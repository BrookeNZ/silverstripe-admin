<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use ReflectionProperty;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\UserInterface\ArchiveAdminShellExtension;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\VersionedAdmin\ArchiveAdmin;

class ArchiveAdminShellTest extends FunctionalTest
{
    protected $usesDatabase = true;

    protected function setUp(): void
    {
        parent::setUp();
        if (!class_exists(ArchiveAdmin::class) || !class_exists(SiteTree::class)) {
            $this->markTestSkipped('Needs silverstripe/versioned-admin and silverstripe/cms');
        }
        $this->logInWithPermission('ADMIN');
    }

    public function testModelTabsAreTheLegacyViewsWithOtherOnTheFirstOtherType(): void
    {
        $admin = ArchiveAdmin::create();
        $otherClasses = array_keys($admin->getVersionedModels('other', true));
        $tabs = $admin->getClientConfig()['modelTabs'];

        $this->assertSame(array_column($admin->getManagedModelTabs()->toNestedArray(), 'Title'), array_column($tabs, 'title'));
        $this->assertSame('SilverStripe-CMS-Model-SiteTree', $tabs[0]['tab']);
        $this->assertSame('Other', end($tabs)['title']);
        $this->assertSame(str_replace('\\', '-', $otherClasses[0]), end($tabs)['tab']);
    }

    public function testOtherTabIsTheOtherTypeInTheRequestUrl(): void
    {
        $otherClass = array_keys(ArchiveAdmin::create()->getVersionedModels('other', true))[1];
        $tab = str_replace('\\', '-', $otherClass);
        $routed = ArchiveAdmin::create();
        $routed->setRequest(
            (new HTTPRequest('GET', "admin/archive/{$tab}/EditForm/field/Others/item/5/view"))->setSession(new Session([]))
        );
        $routed->pushCurrent();
        try {
            $tabs = ArchiveAdmin::create()->getClientConfig()['modelTabs'];
        } finally {
            $routed->popCurrent();
        }

        $this->assertSame($tab, end($tabs)['tab']);
    }

    public function testTypeDropdownNamesThePiletComponentUnderTheShell(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $otherClass = array_keys(ArchiveAdmin::create()->getVersionedModels('other', true))[0];
        $response = $this->get(
            'admin/archive/' . str_replace('\\', '-', $otherClass) . '/schema/EditForm',
            null,
            ['Accept' => 'application/json', 'X-Formschema-Request' => 'schema,state']
        );

        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $fields = array_column(json_decode($response->getBody(), true)['schema']['fields'], null, 'name');
        $this->assertSame(ArchiveAdminShellExtension::TYPE_FIELD_COMPONENT, $fields['OtherDropdown']['component']);
        $this->assertArrayHasKey('Others', $fields);
    }

    public function testTypeDropdownKeepsItsComponentWithTheShellOff(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);
        $admin = ArchiveAdmin::create();
        $admin->setRequest((new HTTPRequest('GET', 'admin/archive'))->setSession(new Session([])));
        $otherClass = array_keys($admin->getVersionedModels('other', true))[0];
        (new ReflectionProperty(ArchiveAdmin::class, 'modelClass'))->setValue($admin, $otherClass);

        $this->assertNull($admin->getEditForm()->Fields()->dataFieldByName('OtherDropdown')->getSchemaComponent());
    }
}
