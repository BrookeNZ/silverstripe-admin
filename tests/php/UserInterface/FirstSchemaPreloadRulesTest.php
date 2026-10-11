<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\AssetAdmin\Controller\AssetAdmin;
use SilverStripe\Admin\SecurityAdmin;
use SilverStripe\Admin\Tests\UserInterface\FirstSchemaPreloadRulesTest\ClientConfigCallLog;
use SilverStripe\Control\Controller;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;

class FirstSchemaPreloadRulesTest extends FunctionalTest
{
    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        Config::modify()->set(Controller::class, 'add_trailing_slash', true);
        $this->logInWithPermission('ADMIN');
    }

    private function schemaPreloads(string $url): array
    {
        $body = $this->get($url, null, ['Accept' => 'text/html'])->getBody();
        preg_match_all('#<link rel="preload" href="([^"]*formSchema=1[^"]*)"#', $body, $matches);
        return $matches[1];
    }

    public function testOddItemPathsPreloadNothingOrTheSectionForm(): void
    {
        $section = ['admin/security/users/schema/EditForm?formSchema=1'];
        $cases = [
            'admin/security/users/EditForm/field/users/item/new/edit/' => ['admin/security/users/EditForm/field/users/item/new/schema?formSchema=1'],
            'admin/security/users/EditForm/field/users/item/0/edit/' => $section,
            'admin/security/users/EditForm/field/users/item/01/edit/' => $section,
            'admin/security/users/EditForm/field/users/item/new/ItemEditForm/field/x/item/1/' => $section,
            'admin/security/users/EditForm/field/users/item/1/delete/' => $section,
            'admin/security/users/EditForm/field/users/item/1/ItemEditForm/field/Groups/item/2/' => [
                'admin/security/users/EditForm/field/users/item/1/ItemEditForm/field/Groups/item/2/schema?formSchema=1',
            ],
            'admin/security/users/EditForm/field/users/item/1/EditForm/field/Groups/item/2/' => $section,
        ];
        foreach ($cases as $url => $expected) {
            $this->assertSame($expected, $this->schemaPreloads($url), $url);
        }
    }

    public function testAHostileGridSegmentStaysOnTheSiteAndEscaped(): void
    {
        foreach ([
            'admin/security/users/EditForm/field/%2F%2Fevil.example/item/1/',
            'admin/security/users/EditForm/field/%22%3E%3Cscript%3E/item/1/',
            'admin/security/users/EditForm/field/https:%2F%2Fevil.example/item/1/',
        ] as $url) {
            $body = $this->get($url, null, ['Accept' => 'text/html'])->getBody();
            $this->assertStringNotContainsString('"><script>', $body, $url);
            foreach ($this->schemaPreloads($url) as $href) {
                $this->assertMatchesRegularExpression('#^/?admin/security/#', $href, $url);
                $this->assertStringNotContainsString('//', $href, $url);
            }
        }
    }

    public function testTheFilesPanelRoutePreloadsTheFileFormAndTheRedirectNothing(): void
    {
        if (!class_exists(AssetAdmin::class)) {
            $this->markTestSkipped('silverstripe/asset-admin is not installed');
        }
        $this->assertSame(['admin/assets/schema/fileEditForm/19?formSchema=1'], $this->schemaPreloads('admin/assets/show/3/edit/19/'));
        $this->assertSame([], $this->schemaPreloads('admin/assets/edit/19/'));
        $this->assertSame([], $this->schemaPreloads('admin/assets/show/3/edit/0/'));
    }

    public function testADataRequestEmitsNoPreload(): void
    {
        $admin = SecurityAdmin::create();
        $request = new \SilverStripe\Control\HTTPRequest('GET', 'admin/security/users/');
        $request->addHeader('X-Requested-With', 'XMLHttpRequest');
        $admin->setRequest($request);
        $this->assertNull($admin->getPiralFirstSchemaUrl());
    }

    public function testAModelAdminPageLoadBuildsItsClientConfigOnce(): void
    {
        SecurityAdmin::add_extension(ClientConfigCallLog::class);
        try {
            ClientConfigCallLog::$calls = [];
            $this->get('admin/security/users/', null, ['Accept' => 'text/html']);
            $counts = array_count_values(ClientConfigCallLog::$calls);
            $this->assertSame(1, $counts[SecurityAdmin::class] ?? 0);
        } finally {
            SecurityAdmin::remove_extension(ClientConfigCallLog::class);
        }
    }
}
