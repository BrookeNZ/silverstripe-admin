<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use RuntimeException;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\SecurityAdmin;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;

class ModelAdminSchemaTest extends FunctionalTest
{
    protected $usesDatabase = true;

    protected function setUp(): void
    {
        parent::setUp();
        $this->logInWithPermission('ADMIN');
    }

    public function testEditFormSchemaIsServedPerModelTab(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        foreach (['users', 'groups', 'roles'] as $tab) {
            $response = $this->get(
                "admin/security/{$tab}/schema/EditForm",
                null,
                ['Accept' => 'application/json', 'X-Formschema-Request' => 'schema,state']
            );

            $this->assertSame(200, $response->getStatusCode(), $tab);
            $data = json_decode($response->getBody(), true);
            $this->assertSame("admin/security/{$tab}/schema/EditForm", $data['id']);
            $this->assertStringEndsWith("admin/security/{$tab}/EditForm/", $data['schema']['action']);
            $this->assertContains($tab, array_column($data['schema']['fields'], 'name'), $tab);
        }
    }

    public function testSchemaUrlWithoutAModelTabIsAJson404(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $response = $this->get(
            'admin/security/schema/EditForm',
            null,
            ['Accept' => 'application/json', 'X-Formschema-Request' => 'schema,state']
        );

        $this->assertSame(404, $response->getStatusCode(), $response->getBody());
        $this->assertSame('application/json', $response->getHeader('Content-Type'));
        $this->assertStringContainsString('needs a model tab', json_decode($response->getBody(), true)['errors'][0]['value']);
    }

    public function testSchemaUrlWithoutAModelTabKeepsTheLegacyErrorWithTheShellOff(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Invalid Model class');
        $this->get('admin/security/schema/EditForm', null, ['Accept' => 'application/json', 'X-Formschema-Request' => 'schema,state']);
    }

    public function testSchemaUrlWithoutAModelTabKeepsTheLegacyErrorWithoutAShellRequest(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $this->expectException(RuntimeException::class);
        $this->get('admin/security/schema/EditForm');
    }

    public function testClientConfigListsModelTabsInOrder(): void
    {
        $config = SecurityAdmin::singleton()->getClientConfig();

        $this->assertSame(['users', 'groups', 'roles'], array_column($config['modelTabs'], 'tab'));
        $this->assertSame('Users', $config['modelTabs'][0]['title']);
    }
}
