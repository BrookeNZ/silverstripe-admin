<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\SecurityToken;
use SilverStripe\VersionedAdmin\Controllers\HistoryViewerController;

/**
 * The history pilet reads and reverts through versioned-admin's HistoryViewerController and renders its
 * version form, so these pin the permission answers the shell relies on. An unviewable record answers
 * 403, not 404: that is the controller's own behaviour
 */
class HistoryViewerShellTest extends FunctionalTest
{
    use ShellResponseAssertions;

    protected static $fixture_file = 'HistoryViewerShellTest.yml';

    public static function setUpBeforeClass(): void
    {
        if (!class_exists(SiteTree::class) || !class_exists(HistoryViewerController::class)) {
            static::markTestSkipped('The history viewer needs silverstripe/cms and silverstripe/versioned-admin');
        }
        parent::setUpBeforeClass();
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->objFromFixture(SiteTree::class, 'open')->publishSingle();
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
    }

    public function testReadListsTheVersionsOfAViewablePage(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'open');

        $latest = (int) SiteTree::get()->byID($page->ID)->Version;

        $body = $this->jsonBody($this->read($page->ID), 200);

        $this->assertSame($latest, $body['pageInfo']['totalCount']);
        $this->assertSame(range($latest, 1), array_column($body['versions'], 'version'));
        $this->assertTrue($body['versions'][0]['published']);
    }

    public function testReadRefusesAnUnviewablePageAndAMissingOne(): void
    {
        $hidden = $this->objFromFixture(SiteTree::class, 'hidden');

        $this->jsonBody($this->read($hidden->ID), 403);
        $this->jsonBody($this->read(999999), 404);
    }

    public function testVersionFormRefusesAnUnviewablePageAndAVersionOfAnotherRecord(): void
    {
        $open = $this->objFromFixture(SiteTree::class, 'open');
        $hidden = $this->objFromFixture(SiteTree::class, 'hidden');

        $openLatest = (int) SiteTree::get()->byID($open->ID)->Version;
        $hiddenLatest = (int) SiteTree::get()->byID($hidden->ID)->Version;
        $this->assertGreaterThan($hiddenLatest, $openLatest);

        $this->assertSame(200, $this->versionForm($open->ID, $openLatest)->getStatusCode());
        $this->assertSame(403, $this->versionForm($hidden->ID, 1)->getStatusCode());
        $this->assertSame(404, $this->versionForm($hidden->ID, $openLatest)->getStatusCode());
    }

    public function testRevertNeedsTheTokenAndEditPermission(): void
    {
        SecurityToken::enable();
        $open = $this->objFromFixture(SiteTree::class, 'open');
        $hidden = $this->objFromFixture(SiteTree::class, 'hidden');

        $this->jsonBody($this->revert($open->ID, 1, 'stale'), 400);
        $this->jsonBody($this->revert($hidden->ID, 1, SecurityToken::inst()->getValue()), 403);
        $before = (int) SiteTree::get()->byID($open->ID)->Version;
        $this->assertSame(204, $this->revert($open->ID, 1, SecurityToken::inst()->getValue())->getStatusCode());
        $this->assertSame($before + 1, (int) SiteTree::get()->byID($open->ID)->Version);
    }

    private function read(int $id): HTTPResponse
    {
        return $this->get('admin/historyviewer/api/read?' . http_build_query([
            'id' => $id,
            'dataClass' => SiteTree::class,
            'page' => 1,
        ]));
    }

    private function versionForm(int $id, int $version): HTTPResponse
    {
        return $this->get(
            'admin/historyviewer/schema/versionForm?' . http_build_query([
                'RecordClass' => SiteTree::class,
                'RecordID' => $id,
                'RecordVersion' => $version,
            ]),
            null,
            ['X-FormSchema-Request' => 'auto']
        );
    }

    private function revert(int $id, int $toVersion, string $token): HTTPResponse
    {
        return $this->post(
            'admin/historyviewer/api/revert',
            [],
            ['X-SecurityID' => $token, 'Content-Type' => 'application/json'],
            null,
            json_encode(['id' => $id, 'dataClass' => SiteTree::class, 'toVersion' => $toVersion])
        );
    }
}
