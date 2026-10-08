<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\Group;

class FormSubmissionRulesTest extends FunctionalTest
{
    use ShellResponseAssertions;

    protected static $fixture_file = 'CMSMainEditFormSubmissionTest.yml';

    public static function setUpBeforeClass(): void
    {
        if (!class_exists(SiteTree::class)) {
            static::markTestSkipped('The page edit form needs silverstripe/cms');
        }
        parent::setUpBeforeClass();
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpShell();
    }

    public function testClassNameOnTheContentFormIsLimitedToPageTypes(): void
    {
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
        $alpha = $this->objFromFixture(SiteTree::class, 'alpha');
        $groupsBefore = Group::get()->count();

        $response = $this->submitTo($alpha, [
            'ID' => $alpha->ID,
            'Title' => 'Alpha',
            'ClassName' => Group::class,
            'action_save' => 1,
        ]);

        $this->assertNotSame(200, $response->getStatusCode(), $response->getBody());
        $this->assertSame($groupsBefore, Group::get()->count());
        $this->assertSame(SiteTree::class, SiteTree::get()->byID($alpha->ID)?->ClassName);
    }

    public function testAMissingPostedRecordAnswersTheJsonEnvelope(): void
    {
        $this->logInWithPermission('ADMIN');
        $alpha = $this->objFromFixture(SiteTree::class, 'alpha');

        $response = $this->submitTo($alpha, ['ID' => 999999, 'Title' => 'Alpha', 'action_save' => 1]);

        $this->assertSame(404, $response->getStatusCode(), $response->getBody());
        $this->assertStringContainsString('application/json', (string) $response->getHeader('Content-Type'), $response->getBody());
    }

    public function testAStaleActionIsNotReportedAsAPermissionFailure(): void
    {
        $this->logInWithPermission('ADMIN');
        $alpha = $this->objFromFixture(SiteTree::class, 'alpha');

        $response = $this->submitTo($alpha, ['ID' => $alpha->ID, 'action_unpublish' => 1]);

        $this->assertStringNotContainsString('You do not have permission', $response->getBody());
    }

    public function testSchemaForAPageTheMemberCannotViewAnswersAForbidden(): void
    {
        $this->logInWithPermission('ADMIN');
        $locked = $this->objFromFixture(SiteTree::class, 'locked');
        $locked->CanViewType = 'OnlyTheseUsers';
        $locked->ViewerGroups()->add($this->objFromFixture(Group::class, 'other'));
        $locked->write();
        $this->logOut();
        $this->logInWithPermission('CMS_ACCESS_CMSMain');

        $response = $this->get(
            'admin/pages/edit/schema/EditForm/' . $locked->ID,
            null,
            ['X-Requested-With' => 'XMLHttpRequest', 'X-Formschema-Request' => 'schema,state,errors']
        );

        $this->assertSame(403, $response->getStatusCode(), substr($response->getBody(), 0, 300));
    }

    private function submitTo(SiteTree $page, array $data): HTTPResponse
    {
        return $this->post('admin/pages/edit/EditForm/' . $page->ID . '/', $data, static::SHELL_HEADERS);
    }
}
