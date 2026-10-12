<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\Tests\UserInterface\PageCreateControllerTest\RetitlingExtension;
use SilverStripe\Admin\Tests\UserInterface\PageWriteRulesTest\PlainPage;
use SilverStripe\Admin\UserInterface\PageCreateController;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\SecurityToken;

class PageCreateControllerTest extends FunctionalTest
{
    use ShellResponseAssertions;

    protected static $fixture_file = 'PageCreateControllerTest.yml';

    protected static $extra_dataobjects = [PlainPage::class];

    public static function setUpBeforeClass(): void
    {
        if (!class_exists(SiteTree::class)) {
            static::markTestSkipped('The add page endpoints need silverstripe/cms');
        }
        parent::setUpBeforeClass();
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
    }

    public function testParentTheMemberCannotAddToOffersNoTypesAndRefusesTheCreate(): void
    {
        $locked = $this->objFromFixture(SiteTree::class, 'locked');

        $types = json_decode($this->get('admin/pages/create/types/' . $locked->ID)->getBody(), true);
        $response = $this->create(['parentId' => $locked->ID, 'className' => PlainPage::class]);

        $this->assertSame([], $types['types']);
        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame(0, SiteTree::get()->filter('ParentID', $locked->ID)->count());
    }

    public function testLoggedOutCreateAsksToLogInAgain(): void
    {
        $this->logOut();

        $response = $this->create(['parentId' => 0, 'className' => PlainPage::class]);

        $this->assertJsonError($response, 403, 'notLoggedIn');
        $this->assertSame('1', $response->getHeader('X-Reauthenticate'));
    }

    public function testCreateWithoutTheSecurityTokenIsRefused(): void
    {
        SecurityToken::enable();
        $open = $this->objFromFixture(SiteTree::class, 'open');

        $response = $this->create(['parentId' => $open->ID, 'className' => PlainPage::class]);

        $this->assertSame(400, $response->getStatusCode());
        $this->assertSame(0, SiteTree::get()->filter('ParentID', $open->ID)->count());
    }

    public function testCreatesTheLegacyNewItemUnderTheParent(): void
    {
        $open = $this->objFromFixture(SiteTree::class, 'open');

        $types = json_decode($this->get('admin/pages/create/types/' . $open->ID)->getBody(), true);
        $response = $this->create(['parentId' => $open->ID, 'className' => PlainPage::class]);
        $body = json_decode($response->getBody(), true);

        $this->assertContains(PlainPage::class, array_column($types['types'], 'className'));
        $this->assertNotContains(SiteTree::class, array_column($types['types'], 'className'));
        $this->assertSame(['id' => $open->ID, 'title' => 'Open'], $types['parent']);
        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame($open->ID, $body['parentId']);
        $this->assertSame('New Plain Page', SiteTree::get()->byID($body['id'])->Title);
    }

    public function testCreateUnderAParentThatDoesNotExistIsRefused(): void
    {
        $response = $this->create(['parentId' => 999999, 'className' => PlainPage::class]);

        $this->assertSame(404, $response->getStatusCode());
        $this->assertSame(0, PlainPage::get()->count());
    }

    public function testCreatedPageHookChangesAreSaved(): void
    {
        $open = $this->objFromFixture(SiteTree::class, 'open');

        PageCreateController::add_extension(RetitlingExtension::class);
        try {
            $response = $this->create(['parentId' => $open->ID, 'className' => PlainPage::class]);
        } finally {
            PageCreateController::remove_extension(RetitlingExtension::class);
        }
        $body = json_decode($response->getBody(), true);

        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame('Retitled by extension', $body['title']);
        $this->assertSame('Retitled by extension', SiteTree::get()->byID($body['id'])->Title);
    }

    public function testTypesCarryTheLegacyIconClassOrImage(): void
    {
        $open = $this->objFromFixture(SiteTree::class, 'open');
        $image = 'data:image/svg+xml;base64,PHN2Zy8+';

        $byClass = $this->typeOf(PlainPage::class, $open->ID);
        Config::modify()->set(PlainPage::class, 'cms_icon', $image);
        $byImage = $this->typeOf(PlainPage::class, $open->ID);

        $this->assertSame('font-icon-page', $byClass['iconClass']);
        $this->assertNull($byClass['iconUrl']);
        $this->assertNull($byImage['iconClass']);
        $this->assertSame($image, $byImage['iconUrl']);
    }

    private function typeOf(string $className, int $parentId): array
    {
        $types = json_decode($this->get('admin/pages/create/types/' . $parentId)->getBody(), true)['types'];
        return $types[array_search($className, array_column($types, 'className'), true)];
    }

    private function create(array $body): HTTPResponse
    {
        return $this->post(
            'admin/pages/create/page',
            [],
            ['Content-Type' => 'application/json', 'X-Requested-With' => 'XMLHttpRequest'],
            null,
            json_encode($body)
        );
    }
}
