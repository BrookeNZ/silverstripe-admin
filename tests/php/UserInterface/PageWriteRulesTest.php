<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use ReflectionProperty;
use SilverStripe\Admin\Tests\UserInterface\PageWriteRulesTest\PlainPage;
use SilverStripe\Admin\Tests\UserInterface\PageWriteRulesTest\RejectingValidationExtension;
use SilverStripe\Admin\Tests\UserInterface\PageWriteRulesTest\RejectingWriteExtension;
use SilverStripe\CMS\Model\RedirectorPage;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\CMS\Model\VirtualPage;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\ORM\Hierarchy\Hierarchy;
use SilverStripe\SiteConfig\SiteConfig;

class PageWriteRulesTest extends FunctionalTest
{
    use ShellResponseAssertions;

    protected $usesDatabase = true;

    protected static $extra_dataobjects = [PlainPage::class];

    public static function setUpBeforeClass(): void
    {
        if (!class_exists(SiteTree::class)) {
            static::markTestSkipped('The page write endpoints need silverstripe/cms');
        }
        parent::setUpBeforeClass();
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->logInWithPermission(['CMS_ACCESS_CMSMain', 'SITETREE_REORGANISE']);
        $this->resetAllowedChildren();
    }

    protected function tearDown(): void
    {
        $this->resetAllowedChildren();
        parent::tearDown();
    }

    public function testVirtualPageMovesWhereItsCopiedPageIsAllowed(): void
    {
        $source = $this->page(SiteTree::class, 'Source');
        $parent = $this->page(SiteTree::class, 'Parent');
        $virtual = $this->page(VirtualPage::class, 'Virtual', ['CopyContentFromID' => $source->ID]);
        $this->allowChildren(SiteTree::class, ['*' . SiteTree::class]);

        $virtual->ParentID = $parent->ID;
        $this->assertTrue($virtual->validate()->isValid(), 'Hierarchy validation accepts the copied page type');

        $response = $this->move(['id' => $virtual->ID, 'parentId' => $parent->ID]);

        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
    }

    public function testTreeRowCarriesAVirtualPagesCopiedClassAndOtherRowsDoNot(): void
    {
        $source = $this->page(RedirectorPage::class, 'Source');
        $virtual = $this->page(VirtualPage::class, 'Virtual', ['CopyContentFromID' => $source->ID]);
        $unlinked = $this->page(VirtualPage::class, 'Unlinked');

        $response = $this->get('admin/pages/tree/children/0');
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $rows = array_column(json_decode($response->getBody(), true)['items'], null, 'id');

        $this->assertSame(RedirectorPage::class, $rows[$virtual->ID]['copiedClassName']);
        $this->assertArrayNotHasKey('copiedClassName', $rows[$source->ID]);
        $this->assertArrayNotHasKey('copiedClassName', $rows[$unlinked->ID]);
    }

    public function testRefusedVirtualPageMoveLeavesSiblingsUntouched(): void
    {
        $source = $this->page(SiteTree::class, 'Source');
        $parent = $this->page(SiteTree::class, 'Parent');
        $first = $this->page(SiteTree::class, 'First', ['ParentID' => $parent->ID, 'Sort' => 1]);
        $second = $this->page(SiteTree::class, 'Second', ['ParentID' => $parent->ID, 'Sort' => 2]);
        $virtual = $this->page(VirtualPage::class, 'Virtual', ['CopyContentFromID' => $source->ID]);
        $this->allowChildren(SiteTree::class, ['*' . VirtualPage::class]);

        $response = $this->move([
            'id' => $virtual->ID,
            'parentId' => $parent->ID,
            'siblingIds' => [$virtual->ID, $first->ID, $second->ID],
        ]);

        $this->assertSame(0, (int) SiteTree::get()->byID($virtual->ID)->ParentID);
        $this->assertSame(
            [1, 2],
            array_map('intval', SiteTree::get()->filter('ParentID', $parent->ID)->sort('Sort')->column('Sort'))
        );
        $this->assertNotSame(500, $response->getStatusCode(), $response->getBody());
    }

    public function testTypesLeaveOutTheBaseClassAndHiddenPageTypes(): void
    {
        $parent = $this->page(SiteTree::class, 'Parent');
        Config::modify()->set(SiteTree::class, 'hide_pagetypes', [RedirectorPage::class]);

        $body = json_decode($this->get('admin/pages/create/types/' . $parent->ID)->getBody(), true);
        $classes = array_column($body['types'], 'className');

        $this->assertSame([], array_values(array_intersect([SiteTree::class, RedirectorPage::class], $classes)));
    }

    public function testHintsLeaveOutTheBaseClassAndHiddenPageTypes(): void
    {
        Config::modify()->set(SiteTree::class, 'hide_pagetypes', [RedirectorPage::class]);

        $hints = json_decode($this->get('admin/pages/move/hints')->getBody(), true);

        $this->assertContains(PlainPage::class, $hints['rootClasses']);
        $this->assertNotContains(SiteTree::class, $hints['rootClasses']);
        $this->assertNotContains(RedirectorPage::class, $hints['rootClasses']);
        $this->assertArrayNotHasKey(SiteTree::class, $hints['allowedChildren']);
        $this->assertArrayNotHasKey(RedirectorPage::class, $hints['allowedChildren']);
    }

    public function testBaseClassCannotBeCreated(): void
    {
        $parent = $this->page(SiteTree::class, 'Parent');

        $response = $this->create(['parentId' => $parent->ID, 'className' => SiteTree::class]);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame(0, SiteTree::get()->filter('ParentID', $parent->ID)->count());
    }

    public function testRootCreateFollowsCanCreateTopLevel(): void
    {
        $types = json_decode($this->get('admin/pages/create/types/0')->getBody(), true)['types'];
        $allowed = $this->create(['parentId' => 0, 'className' => PlainPage::class]);
        $this->refuseTopLevel();
        $refusedTypes = json_decode($this->get('admin/pages/create/types/0')->getBody(), true)['types'];
        $refused = $this->create(['parentId' => 0, 'className' => PlainPage::class]);

        $this->assertContains(PlainPage::class, array_column($types, 'className'));
        $this->assertSame(201, $allowed->getStatusCode(), $allowed->getBody());
        $this->assertSame(0, json_decode($allowed->getBody(), true)['parentId']);
        $this->assertSame([], $refusedTypes);
        $this->assertSame(403, $refused->getStatusCode());
        $this->assertSame(1, PlainPage::get()->count());
    }

    public function testRootTypesLeaveOutClassesThatCannotBeRoot(): void
    {
        Config::modify()->set(PlainPage::class, 'can_be_root', 0);

        $types = json_decode($this->get('admin/pages/create/types/0')->getBody(), true)['types'];

        $this->assertNotContains(PlainPage::class, array_column($types, 'className'));
    }

    public function testMoveOutOfTheTopLevelWithoutCanCreateTopLevelIsRefused(): void
    {
        $page = $this->page(SiteTree::class, 'Page');
        $parent = $this->page(SiteTree::class, 'Parent');
        $this->refuseTopLevel();

        $response = $this->move(['id' => $page->ID, 'parentId' => $parent->ID]);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('cannotMoveTopLevel', $this->errorReason($response));
        $this->assertSame(0, (int) SiteTree::get()->byID($page->ID)->ParentID);
    }

    public function testMoveToTheTopLevelWithoutCanCreateTopLevelIsRefused(): void
    {
        $parent = $this->page(SiteTree::class, 'Parent');
        $page = $this->page(SiteTree::class, 'Page', ['ParentID' => $parent->ID]);
        $this->refuseTopLevel();

        $response = $this->move(['id' => $page->ID, 'parentId' => 0]);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('cannotMoveTopLevel', $this->errorReason($response));
        $this->assertSame($parent->ID, (int) SiteTree::get()->byID($page->ID)->ParentID);
    }

    public function testMoveToTheTopLevelOfAClassThatCannotBeRootIsRefused(): void
    {
        $parent = $this->page(SiteTree::class, 'Parent');
        $page = $this->page(PlainPage::class, 'Page', ['ParentID' => $parent->ID]);
        Config::modify()->set(PlainPage::class, 'can_be_root', 0);

        $response = $this->move(['id' => $page->ID, 'parentId' => 0]);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('notAllowedHere', $this->errorReason($response));
        $this->assertSame($parent->ID, (int) SiteTree::get()->byID($page->ID)->ParentID);
    }

    public function testMoveUnderAParentThatTakesNoChildrenIsRefused(): void
    {
        $page = $this->page(SiteTree::class, 'Page');
        $parent = $this->page(SiteTree::class, 'Parent');
        $this->allowChildren(SiteTree::class, 'none');

        $response = $this->move(['id' => $page->ID, 'parentId' => $parent->ID]);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('notAllowedHere', $this->errorReason($response));
        $this->assertSame(0, (int) SiteTree::get()->byID($page->ID)->ParentID);
    }

    public function testExactClassAllowedChildrenRefusesASubclass(): void
    {
        $page = $this->page(PlainPage::class, 'Page');
        $parent = $this->page(SiteTree::class, 'Parent');
        $this->allowChildren(SiteTree::class, ['*' . SiteTree::class]);

        $response = $this->move(['id' => $page->ID, 'parentId' => $parent->ID]);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('notAllowedHere', $this->errorReason($response));
        $this->assertSame(0, (int) SiteTree::get()->byID($page->ID)->ParentID);
    }

    public function testMoveRefusedByValidationLeavesSiblingsUntouched(): void
    {
        $parent = $this->page(SiteTree::class, 'Parent');
        $first = $this->page(SiteTree::class, 'First', ['ParentID' => $parent->ID, 'Sort' => 1]);
        $second = $this->page(SiteTree::class, 'Second', ['ParentID' => $parent->ID, 'Sort' => 2]);
        $page = $this->page(SiteTree::class, 'Page');

        SiteTree::add_extension(RejectingValidationExtension::class);
        try {
            $response = $this->move([
                'id' => $page->ID,
                'parentId' => $parent->ID,
                'siblingIds' => [$page->ID, $first->ID, $second->ID],
            ]);
        } finally {
            SiteTree::remove_extension(RejectingValidationExtension::class);
        }

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('REJECTED', $this->errorReason($response));
        $this->assertSame(0, (int) SiteTree::get()->byID($page->ID)->ParentID);
        $this->assertSame(
            [$first->ID => 1, $second->ID => 2],
            array_map('intval', SiteTree::get()->filter('ParentID', $parent->ID)->map('ID', 'Sort')->toArray())
        );
    }

    public function testWriteRejectedByValidationAnswersForbiddenAndLeavesSiblingsUntouched(): void
    {
        $page = $this->page(SiteTree::class, 'Page');
        $parent = $this->page(SiteTree::class, 'Parent');
        $first = $this->page(SiteTree::class, 'First', ['ParentID' => $parent->ID, 'Sort' => 1]);
        $second = $this->page(SiteTree::class, 'Second', ['ParentID' => $parent->ID, 'Sort' => 2]);

        SiteTree::add_extension(RejectingWriteExtension::class);
        try {
            $response = $this->move([
                'id' => $page->ID,
                'parentId' => $parent->ID,
                'siblingIds' => [$page->ID, $first->ID, $second->ID],
            ]);
        } finally {
            SiteTree::remove_extension(RejectingWriteExtension::class);
        }

        $this->assertSame(403, $response->getStatusCode(), $response->getBody());
        $this->assertSame(0, (int) SiteTree::get()->byID($page->ID)->ParentID);
        $this->assertSame(
            [$first->ID => 1, $second->ID => 2],
            array_map('intval', SiteTree::get()->filter('ParentID', $parent->ID)->map('ID', 'Sort')->toArray())
        );
    }

    private function page(string $class, string $title, array $fields = []): SiteTree
    {
        $page = $class::create(['Title' => $title] + $fields);
        $page->write();
        return $page;
    }

    private function allowChildren(string $class, array|string $allowed): void
    {
        Config::modify()->set($class, 'allowed_children', $allowed);
        $this->resetAllowedChildren();
    }

    private function resetAllowedChildren(): void
    {
        (new ReflectionProperty(Hierarchy::class, 'cache_allowedChildren'))->setValue(null, []);
    }

    private function refuseTopLevel(): void
    {
        $config = SiteConfig::current_site_config();
        $config->CanCreateTopLevelType = 'OnlyTheseUsers';
        $config->write();
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

    private function move(array $body): HTTPResponse
    {
        return $this->post(
            'admin/pages/move/page',
            [],
            ['Content-Type' => 'application/json', 'X-Requested-With' => 'XMLHttpRequest'],
            null,
            json_encode($body)
        );
    }
}
