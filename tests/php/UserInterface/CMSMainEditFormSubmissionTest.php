<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\Tests\UserInterface\CMSMainEditFormSubmissionTest\RejectingExtension;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Core\Kernel;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\Group;
use SilverStripe\Security\SecurityToken;
use SilverStripe\Versioned\Versioned;

class CMSMainEditFormSubmissionTest extends FunctionalTest
{
    use ShellResponseAssertions;

    protected static $fixture_file = 'CMSMainEditFormSubmissionTest.yml';

    protected static $required_extensions = [
        SiteTree::class => [RejectingExtension::class],
    ];

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
        $this->logInWithPermission('ADMIN');
    }

    public function testSaveAnswersTheFormStateOfTheSavedPage(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $response = $this->submit($page, 'save', ['Title' => 'Alpha renamed']);
        $body = $this->jsonBody($response, 200);

        $this->assertSame([], $body['errors'] ?? []);
        $this->assertSame('admin/pages/edit/schema/EditForm/' . $page->ID, $body['id']);
        $this->assertSame('Alpha renamed', $this->stateValue($body, 'Title'));
        $this->assertSame('Saved Page "Alpha renamed"', $body['message']);
        $this->assertFalse($body['deleted']);
        $this->assertSame(['id' => $page->ID, 'title' => 'Alpha renamed'], [
            'id' => $body['record']['id'],
            'title' => $body['record']['title'],
        ]);
        $this->assertSame('no-store', $response->getHeader('Cache-Control'));
        $this->assertSame('Alpha renamed', SiteTree::get()->byID($page->ID)->Title);
        $this->assertFalse(SiteTree::get()->byID($page->ID)->isPublished());
    }

    public function testPublishAndUnpublish(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $body = $this->jsonBody($this->submit($page, 'publish', ['Title' => 'Alpha live']), 200);
        $this->assertSame('Published Page "Alpha live"', $body['message']);
        $live = Versioned::get_by_stage(SiteTree::class, Versioned::LIVE)->byID($page->ID);
        $this->assertSame('Alpha live', $live?->Title);

        $body = $this->jsonBody($this->submit($page, 'unpublish', ['Title' => 'Alpha live']), 200);
        $this->assertSame('Unpublished Page "Alpha live"', $body['message']);
        $this->assertNull(Versioned::get_by_stage(SiteTree::class, Versioned::LIVE)->byID($page->ID));
        $this->assertSame('Alpha live', $this->stateValue($body, 'Title'));
    }

    public function testArchiveAnswersDeletedWithNoState(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $body = $this->jsonBody($this->submit($page, 'archive', ['Title' => 'Alpha']), 200);

        $this->assertSame(['deleted' => true, 'message' => 'Archived Page "Alpha"'], $body);
        $this->assertNull(SiteTree::get()->byID($page->ID));
    }

    public function testValidationErrorAnswersTheErrorsEnvelope(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $body = $this->jsonBody($this->submit($page, 'save', ['Title' => 'Rejected']), 200);

        $this->assertSame('This title is rejected', $body['errors'][0]['value']);
        $this->assertSame('Title', $body['errors'][0]['field']);
        $this->assertSame('Rejected', $this->stateValue($body, 'Title'));
        $this->assertSame('Alpha', SiteTree::get()->byID($page->ID)->Title);
    }

    public function testAnOfferedActionTheRecordRefusesAnswersAJsonForbidden(): void
    {
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
        $alpha = $this->objFromFixture(SiteTree::class, 'alpha');
        $locked = $this->objFromFixture(SiteTree::class, 'locked');

        $response = $this->post(
            'admin/pages/edit/EditForm/' . $alpha->ID . '/',
            ['ID' => $locked->ID, 'Title' => 'Unlocked', 'action_save' => 1],
            static::SHELL_HEADERS
        );
        $body = $this->jsonBody($response, 403);

        $this->assertSame('You do not have permission to do that to this page.', $body['errors'][0]['value']);
        $this->assertSame('forbidden', $body['errors'][0]['reason']);
        $this->assertSame('Locked', SiteTree::get()->byID($locked->ID)->Title);
    }

    public function testAnActionTheFormNoLongerOffersAnswersANeutralForbidden(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $body = $this->jsonBody($this->submit($page, 'unpublish', ['Title' => 'Alpha']), 403);

        $this->assertSame(
            'That action is no longer available for this page. Reload to see its current actions.',
            $body['errors'][0]['value']
        );
        $this->assertSame('actionNotAvailable', $body['errors'][0]['reason']);
    }

    public function testAnExceptionThrownByTheActionAnswersTheJsonEnvelope(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $notFound = $this->jsonBody($this->submit($page, 'save', ['ID' => 999999, 'Title' => 'Alpha']), 404);
        $this->assertSame('Bad record ID #999999', $notFound['errors'][0]['value']);
        $this->assertSame('notFound', $notFound['errors'][0]['reason']);

        $kernel = Injector::inst()->get(Kernel::class);
        $environment = $kernel->getEnvironment();
        $kernel->setEnvironment('live');
        try {
            $serverError = $this->jsonBody($this->submit($page, 'save', ['Title' => 'Explode']), 500);
        } finally {
            $kernel->setEnvironment($environment);
        }
        $this->assertSame('serverError', $serverError['errors'][0]['reason']);
        $this->assertStringNotContainsString('exploded', $serverError['errors'][0]['value']);
        $this->assertSame('Alpha', SiteTree::get()->byID($page->ID)->Title);
    }

    public function testAStaleSecurityTokenAnswersAJsonBadRequest(): void
    {
        SecurityToken::enable();
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $body = $this->jsonBody($this->submit($page, 'save', ['Title' => 'Forged', 'SecurityID' => 'stale']), 400);

        $this->assertSame('Your session has expired. Please re-submit the form.', $body['errors'][0]['value']);
        $this->assertSame('Alpha', SiteTree::get()->byID($page->ID)->Title);
    }

    public function testAMissingSecurityTokenAnswersTheFrameworkWording(): void
    {
        SecurityToken::enable();
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $response = $this->submit($page, 'save', ['Title' => 'Forged']);
        $body = $this->jsonBody($response, 400);

        $this->assertStringStartsWith('There seems to have been a technical problem.', $body['errors'][0]['value']);
        $this->assertNull($response->getHeader('X-Reauthenticate'));
        $this->assertSame('Alpha', SiteTree::get()->byID($page->ID)->Title);
    }

    public function testANewRecordIdIsRefusedBeforeAnyWrite(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');
        $pagesBefore = SiteTree::get()->count();

        $body = $this->jsonBody($this->submit($page, 'save', ['ID' => 'new-' . SiteTree::class . '-0', 'Title' => 'Created']), 400);

        $this->assertSame('invalid', $body['errors'][0]['reason']);
        $this->assertSame($pagesBefore, SiteTree::get()->count());
        $this->assertSame('Alpha', SiteTree::get()->byID($page->ID)->Title);
    }

    public function testSchemaOfAPageTheMemberCannotViewAnswersAJsonForbidden(): void
    {
        $locked = $this->objFromFixture(SiteTree::class, 'locked');
        $locked->CanViewType = 'OnlyTheseUsers';
        $locked->ViewerGroups()->add($this->objFromFixture(Group::class, 'other'));
        $locked->write();
        $this->logInWithPermission('CMS_ACCESS_CMSMain');

        $response = $this->get(
            'admin/pages/edit/schema/EditForm/' . $locked->ID,
            null,
            ['X-Requested-With' => 'XMLHttpRequest', 'X-Formschema-Request' => 'schema,state,errors']
        );
        $body = $this->jsonBody($response, 403);

        $this->assertSame('forbidden', $body['errors'][0]['reason']);
    }

    public function testAPostWithoutTheSchemaHeaderKeepsTheLegacyAnswer(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $response = $this->post(
            'admin/pages/edit/EditForm/' . $page->ID . '/',
            ['ID' => $page->ID, 'Title' => 'Alpha legacy', 'action_save' => 1],
            ['X-Requested-With' => 'XMLHttpRequest', 'X-Pjax' => 'ValidationResult']
        );

        $this->assertSame(200, $response->getStatusCode());
        $this->assertArrayHasKey('ValidationResult', json_decode($response->getBody(), true));
    }

    private function submit(SiteTree $page, string $action, array $data): HTTPResponse
    {
        return $this->post(
            'admin/pages/edit/EditForm/' . $page->ID . '/',
            array_merge(['ID' => $page->ID, 'action_' . $action => 1], $data),
            static::SHELL_HEADERS
        );
    }
}
