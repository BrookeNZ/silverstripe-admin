<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;

class ShellPermissionFailureTest extends FunctionalTest
{
    protected $usesDatabase = true;

    protected function setUp(): void
    {
        parent::setUp();
        $this->autoFollowRedirection = false;
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
    }

    public function testLoggedOutShellSubmissionGetsJsonAndKeepsReauthenticate(): void
    {
        $response = $this->post(
            'admin/security/users/EditForm/field/users/item/1/ItemEditForm',
            ['action_doSave' => 1],
            ['X-Formschema-Request' => 'state,errors', 'Accept' => 'application/json']
        );

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('1', $response->getHeader('X-Reauthenticate'));
        $this->assertSame('Your session has ended. Log in again to continue.', $this->errorMessage($response));
    }

    public function testLoggedOutXhrGetsJson(): void
    {
        $response = $this->get('admin/security/users/schema/EditForm', null, ['X-Requested-With' => 'XMLHttpRequest']);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('1', $response->getHeader('X-Reauthenticate'));
        $this->assertSame('Your session has ended. Log in again to continue.', $this->errorMessage($response));
    }

    public function testMemberWithoutSectionAccessGetsJson(): void
    {
        $this->logInWithPermission('CMS_ACCESS_SomeOtherAdmin');
        $response = $this->get('admin/security/users/schema/EditForm', null, ['X-Requested-With' => 'XMLHttpRequest']);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertNull($response->getHeader('X-Reauthenticate'));
        $this->assertSame('You do not have permission to open this section.', $this->errorMessage($response));
    }

    public function testLegacyAdminAnswerIsUnchanged(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);
        $response = $this->get('admin/security/users/schema/EditForm', null, ['X-Requested-With' => 'XMLHttpRequest']);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('Not logged in', $response->getBody());
    }

    private function errorMessage(HTTPResponse $response): string
    {
        $this->assertSame('application/json', $response->getHeader('Content-Type'));
        $body = json_decode($response->getBody(), true);
        $this->assertSame('error', $body['status']);
        $this->assertSame(403, $body['errors'][0]['code']);
        return $body['errors'][0]['value'];
    }
}
