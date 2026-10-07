<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\SecurityAdmin;
use SilverStripe\Control\Controller;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\Security;

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

    public function testMemberWithoutSectionAccessSendingOnlyTheFormSchemaHeaderGetsJson(): void
    {
        $this->logInWithPermission('CMS_ACCESS_SomeOtherAdmin');
        $response = $this->refuseWithLoginRedirect(['X-Formschema-Request' => 'schema,state']);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertNull($response->getHeader('Location'));
        $this->assertNull($response->getHeader('X-Reauthenticate'));
        $this->assertSame('You do not have permission to open this section.', $this->errorMessage($response));
    }

    public function testLoginRedirectIsKeptWithTheShellOff(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);
        $this->logInWithPermission('CMS_ACCESS_SomeOtherAdmin');
        $response = $this->refuseWithLoginRedirect(['X-Formschema-Request' => 'schema,state']);

        $this->assertSame(302, $response->getStatusCode());
        $this->assertStringContainsString('Security/login', $response->getHeader('Location'));
    }

    public function testOtherRedirectsAreKept(): void
    {
        $this->logInWithPermission('CMS_ACCESS_SomeOtherAdmin');
        $controller = $this->controllerFor(['X-Formschema-Request' => 'schema,state']);
        $controller->redirect('admin/pages/');
        $controller->extend('onAfterInit');

        $this->assertSame(302, $controller->getResponse()->getStatusCode());
    }

    /**
     * The redirect Security::permissionFailure() answers with when its login handler sends one, as on a site
     * whose login form redirects (multi-factor authentication)
     */
    private function refuseWithLoginRedirect(array $headers): HTTPResponse
    {
        $controller = $this->controllerFor($headers);
        $controller->redirect(Controller::join_links(Security::config()->get('login_url'), '?BackURL=admin%2Fsecurity'));
        $controller->extend('onAfterInit');
        return $controller->getResponse();
    }

    private function controllerFor(array $headers): LeftAndMain
    {
        $request = new HTTPRequest('GET', 'admin/security/users/schema/EditForm');
        foreach ($headers as $name => $value) {
            $request->addHeader($name, $value);
        }
        $request->setSession(new Session([]));
        $controller = SecurityAdmin::create();
        $controller->setRequest($request);
        $controller->setResponse(HTTPResponse::create());
        return $controller;
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
