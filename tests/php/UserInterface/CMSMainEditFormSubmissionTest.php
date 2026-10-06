<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\CMSMainEditFormSubmissionTest\RejectingExtension;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\SecurityToken;
use SilverStripe\Versioned\Versioned;

class CMSMainEditFormSubmissionTest extends FunctionalTest
{
    protected static $fixture_file = 'CMSMainEditFormSubmissionTest.yml';

    protected static $required_extensions = [
        SiteTree::class => [RejectingExtension::class],
    ];

    private const SHELL = [
        'X-Requested-With' => 'XMLHttpRequest',
        'Accept' => 'application/json',
        'X-Formschema-Request' => 'state,errors',
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
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $this->logInWithPermission('ADMIN');
    }

    public function testSaveAnswersTheFormStateOfTheSavedPage(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $response = $this->submit($page, 'save', ['Title' => 'Alpha renamed']);
        $body = $this->json($response, 200);

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

        $body = $this->json($this->submit($page, 'publish', ['Title' => 'Alpha live']), 200);
        $this->assertSame('Published Page "Alpha live"', $body['message']);
        $live = Versioned::get_by_stage(SiteTree::class, Versioned::LIVE)->byID($page->ID);
        $this->assertSame('Alpha live', $live?->Title);

        $body = $this->json($this->submit($page, 'unpublish', ['Title' => 'Alpha live']), 200);
        $this->assertSame('Unpublished Page "Alpha live"', $body['message']);
        $this->assertNull(Versioned::get_by_stage(SiteTree::class, Versioned::LIVE)->byID($page->ID));
        $this->assertSame('Alpha live', $this->stateValue($body, 'Title'));
    }

    public function testArchiveAnswersDeletedWithNoState(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $body = $this->json($this->submit($page, 'archive', ['Title' => 'Alpha']), 200);

        $this->assertSame(['deleted' => true, 'message' => 'Archived Page "Alpha"'], $body);
        $this->assertNull(SiteTree::get()->byID($page->ID));
    }

    public function testValidationErrorAnswersTheErrorsEnvelope(): void
    {
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $body = $this->json($this->submit($page, 'save', ['Title' => 'Rejected']), 200);

        $this->assertSame('This title is rejected', $body['errors'][0]['value']);
        $this->assertSame('Title', $body['errors'][0]['field']);
        $this->assertSame('Rejected', $this->stateValue($body, 'Title'));
        $this->assertSame('Alpha', SiteTree::get()->byID($page->ID)->Title);
    }

    public function testPermissionDeniedAnswersAJsonForbidden(): void
    {
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
        $page = $this->objFromFixture(SiteTree::class, 'locked');

        $body = $this->json($this->submit($page, 'save', ['Title' => 'Unlocked']), 403);

        $this->assertSame('You do not have permission to do that to this page.', $body['errors'][0]['value']);
        $this->assertSame('Locked', SiteTree::get()->byID($page->ID)->Title);
    }

    public function testAStaleSecurityTokenAnswersAJsonBadRequest(): void
    {
        SecurityToken::enable();
        $page = $this->objFromFixture(SiteTree::class, 'alpha');

        $body = $this->json($this->submit($page, 'save', ['Title' => 'Forged', 'SecurityID' => 'stale']), 400);

        $this->assertSame('Your session has expired. Please re-submit the form.', $body['errors'][0]['value']);
        $this->assertSame('Alpha', SiteTree::get()->byID($page->ID)->Title);
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
            static::SHELL
        );
    }

    private function json(HTTPResponse $response, int $status): array
    {
        $this->assertSame($status, $response->getStatusCode(), $response->getBody());
        $this->assertStringContainsString('application/json', (string) $response->getHeader('Content-Type'));
        return json_decode($response->getBody(), true);
    }

    private function stateValue(array $body, string $name): mixed
    {
        foreach ($body['state']['fields'] as $field) {
            if ($field['name'] === $name) {
                return $field['value'];
            }
        }
        $this->fail("No state for $name");
    }
}
