<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\SecurityToken;

class PageMoveControllerTest extends FunctionalTest
{
    protected static $fixture_file = 'PageMoveControllerTest.yml';

    public static function setUpBeforeClass(): void
    {
        if (!class_exists(SiteTree::class)) {
            static::markTestSkipped('The move endpoint needs silverstripe/cms');
        }
        parent::setUpBeforeClass();
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->logInWithPermission(['CMS_ACCESS_CMSMain', 'SITETREE_REORGANISE']);
    }

    public function testMoveWithoutTheReorganisePermissionIsRefused(): void
    {
        $this->logOut();
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
        $b1 = $this->page('b1');
        $alpha = $this->page('alpha');

        $response = $this->move(['id' => $b1->ID, 'parentId' => $alpha->ID]);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('cannotOrganise', $this->reason($response));
        $this->assertSame($this->page('bravo')->ID, $this->reload($b1)->ParentID);
    }

    public function testMoveWithoutTheSecurityTokenIsRefused(): void
    {
        SecurityToken::enable();
        $b1 = $this->page('b1');

        $response = $this->move(['id' => $b1->ID, 'parentId' => $this->page('alpha')->ID]);

        $this->assertSame(400, $response->getStatusCode());
        $this->assertSame('invalidToken', $this->reason($response));
        $this->assertSame($this->page('bravo')->ID, $this->reload($b1)->ParentID);
    }

    public function testMoveReparentsAndRenumbersWithoutMarkingSiblingsModified(): void
    {
        [$a1, $a2, $a3, $b1] = array_map(fn (string $name) => $this->page($name), ['a1', 'a2', 'a3', 'b1']);
        $alpha = $this->page('alpha');
        $a2Version = $a2->Version;

        $response = $this->move(['id' => $b1->ID, 'parentId' => $alpha->ID, 'siblingIds' => [$a1->ID, $b1->ID, $a2->ID, $a3->ID]]);
        $body = json_decode($response->getBody(), true);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame($alpha->ID, $body['parentId']);
        $this->assertSame($this->page('bravo')->ID, $body['previousParentId']);
        $this->assertSame([$b1->ID], $body['modifiedIds']);
        $this->assertSame(
            [$a1->ID, $b1->ID, $a2->ID, $a3->ID],
            array_map('intval', SiteTree::get()->filter('ParentID', $alpha->ID)->sort('Sort')->column('ID'))
        );
        $this->assertSame([1, 2, 3, 4], array_map('intval', SiteTree::get()->filter('ParentID', $alpha->ID)->sort('Sort')->column('Sort')));
        $this->assertSame($a2Version, $this->reload($a2)->Version);
    }

    public function testMoveWithoutSiblingsPutsThePageLast(): void
    {
        $b1 = $this->page('b1');
        $alpha = $this->page('alpha');

        $response = $this->move(['id' => $b1->ID, 'parentId' => $alpha->ID]);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(4, $this->reload($b1)->Sort);
    }

    public function testDropOnAPageTheMemberCannotEditIsRefused(): void
    {
        $b1 = $this->page('b1');

        $response = $this->move(['id' => $b1->ID, 'parentId' => $this->page('locked')->ID]);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('notAllowedHere', $this->reason($response));
        $this->assertSame($this->page('bravo')->ID, $this->reload($b1)->ParentID);
    }

    public function testDropIntoItsOwnDescendantIsRefused(): void
    {
        $alpha = $this->page('alpha');

        $response = $this->move(['id' => $alpha->ID, 'parentId' => $this->page('a2')->ID]);

        $this->assertSame(400, $response->getStatusCode());
        $this->assertSame(0, $this->reload($alpha)->ParentID);
    }

    public function testHintsCarryThePermissionsAndAllowedChildren(): void
    {
        $hints = json_decode($this->get('admin/pages/move/hints')->getBody(), true);

        $this->assertTrue($hints['canOrganise']);
        $this->assertContains(SiteTree::class, $hints['rootClasses']);
        $this->assertContains(SiteTree::class, $hints['allowedChildren'][SiteTree::class]);
    }

    private function page(string $name): SiteTree
    {
        return $this->objFromFixture(SiteTree::class, $name);
    }

    private function reload(SiteTree $page): SiteTree
    {
        return SiteTree::get()->byID($page->ID);
    }

    private function reason(HTTPResponse $response): ?string
    {
        return json_decode($response->getBody(), true)['errors'][0]['reason'] ?? null;
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
