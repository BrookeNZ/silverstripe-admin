<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Dev\FunctionalTest;

/**
 * The page settings form is CMSMain's EditForm on CMSPageSettingsController, so the shell submission
 * extensions answer it too, with the settings controller's schema id and fields
 */
class CMSPageSettingsSubmissionTest extends FunctionalTest
{
    use ShellResponseAssertions;

    protected static $fixture_file = 'CMSMainEditFormSubmissionTest.yml';

    public static function setUpBeforeClass(): void
    {
        if (!class_exists(SiteTree::class)) {
            static::markTestSkipped('The page settings form needs silverstripe/cms');
        }
        parent::setUpBeforeClass();
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpShell();
        $this->logInWithPermission('ADMIN');
    }

    public function testSaveAnswersTheSettingsFormState(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $response = $this->submit($page, 'save', ['ShowInMenus' => 0, 'CanViewType' => 'LoggedInUsers']);
        $body = $this->jsonBody($response, 200);

        $this->assertSame([], $body['errors'] ?? []);
        $this->assertSame('admin/pages/settings/schema/EditForm/' . $page->ID, $body['id']);
        $this->assertSame('LoggedInUsers', $this->stateValue($body, 'CanViewType'));
        $this->assertNotContains('Title', array_column($body['state']['fields'], 'name'));
        $this->assertSame('Saved Page "Alpha"', $body['message']);
        $saved = SiteTree::get()->byID($page->ID);
        $this->assertSame('LoggedInUsers', $saved->CanViewType);
        $this->assertFalse((bool) $saved->ShowInMenus);
        $this->assertSame('Alpha', $saved->Title);
    }

    public function testTopLevelLocationClearsTheParent(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');
        $parent = $this->objFromFixture(SiteTree::class, 'locked');
        $page->ParentID = $parent->ID;
        $page->write();

        $this->jsonBody($this->submit($page, 'save', ['ParentType' => 'root', 'ParentID' => $parent->ID]), 200);

        $this->assertSame(0, (int) SiteTree::get()->byID($page->ID)->ParentID);
    }

    public function testASaveWithheldFromTheMemberAnswersAJsonForbidden(): void
    {
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
        $page = $this->objFromFixture(SiteTree::class, 'locked');

        $body = $this->jsonBody($this->submit($page, 'save', ['CanViewType' => 'Anyone']), 403);

        $this->assertSame('actionNotAvailable', $body['errors'][0]['reason']);
        $this->assertSame('Inherit', SiteTree::get()->byID($page->ID)->CanViewType);
    }

    private function submit(SiteTree $page, string $action, array $data): HTTPResponse
    {
        return $this->post(
            'admin/pages/settings/EditForm/' . $page->ID . '/',
            array_merge(['ID' => $page->ID, 'action_' . $action => 1], $data),
            static::SHELL_HEADERS
        );
    }
}
