<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\Tests\UserInterface\PageTreeDeleteRulesTest\WorkflowStyleLock;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\Member;
use SilverStripe\Versioned\Versioned;

class PageTreeDeleteRulesTest extends FunctionalTest
{
    protected static $fixture_file = 'PageTreeDeleteRulesTest.yml';

    protected static $required_extensions = [
        SiteTree::class => [WorkflowStyleLock::class],
    ];

    private const AJAX = ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->logInAs($this->objFromFixture(Member::class, 'editor'));
    }

    public function testDraftChildrenMatchRecords(): void
    {
        $this->assertRowsMatch('admin/pages/tree/children/0', 'Stage');
        $this->assertRowsMatch('admin/pages/tree/children/' . $this->idFor('top'), 'Stage');
        $this->assertRowsMatch('admin/pages/tree/children/' . $this->idFor('mid'), 'Stage');
    }

    public function testChildrenWithADraftOnlyDescendantMatchRecords(): void
    {
        foreach (['top', 'mid', 'leaf', 'wf', 'open', 'openchild'] as $name) {
            $this->objFromFixture(SiteTree::class, $name)->publishSingle();
        }
        // a descendant the editor cannot edit that exists on draft only
        $draftOnly = SiteTree::create(['Title' => 'Draft only', 'ParentID' => $this->idFor('openchild')]);
        $draftOnly->CanEditType = 'OnlyTheseUsers';
        $draftOnly->write();
        $draftOnly->EditorGroups()->add($this->objFromFixture(\SilverStripe\Security\Group::class, 'other'));

        $this->assertRowsMatch('admin/pages/tree/children/0', 'Stage');
        $this->assertRowsMatch('admin/pages/tree/children/' . $this->idFor('top'), 'Stage');
    }

    public function testAncestorsMatchRecords(): void
    {
        $this->assertRowsMatch('admin/pages/tree/ancestors/' . $this->idFor('leaf'), 'Stage');
    }

    public function testSearchMatchesRecords(): void
    {
        $this->assertRowsMatch('admin/pages/tree/search?q=Top', 'Stage');
    }

    private function assertRowsMatch(string $url, string $stage): void
    {
        $response = $this->get($url, null, self::AJAX);
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $items = json_decode($response->getBody(), true)['items'];
        $this->assertNotEmpty($items);
        $member = $this->objFromFixture(Member::class, 'editor');
        foreach ($items as $item) {
            [$canEdit, $canDelete] = Versioned::withVersionedMode(function () use ($item, $stage, $member) {
                Versioned::set_stage($stage);
                $checker = SiteTree::singleton()->getPermissionChecker();
                $checker->clearCache();
                $record = SiteTree::get()->byID($item['id']);
                return [(bool) $record->canEdit($member), (bool) $record->canDelete($member)];
            });
            $this->assertSame(
                ['canEdit' => $canEdit, 'canDelete' => $canDelete],
                ['canEdit' => $item['canEdit'], 'canDelete' => $item['canDelete']],
                "$url {$item['title']}"
            );
        }
    }

    private function idFor(string $name): int
    {
        return (int) $this->idFromFixture(SiteTree::class, $name);
    }
}
