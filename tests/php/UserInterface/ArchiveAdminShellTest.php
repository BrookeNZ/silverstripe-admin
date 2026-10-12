<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use ReflectionProperty;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\UserInterface\ArchiveAdminShellExtension;
use SilverStripe\Assets\AssetControlExtension;
use SilverStripe\Assets\File;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\i18n\i18n;
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
        ArchiveAdminShellExtension::flush();
    }

    public function testArchiveTabsAreCachedUntilFlush(): void
    {
        $built = ArchiveAdmin::create()->getArchiveTabs();
        // Changes what a rebuild gives (the Files tab) without changing the cache key
        $keepArchived = !Config::inst()->get(File::class, 'keep_archived_assets');
        Config::modify()->set(File::class, 'keep_archived_assets', $keepArchived);
        Config::modify()->set(AssetControlExtension::class, 'keep_archived_assets', $keepArchived);

        ArchiveAdminShellExtension::resetMemo();
        $this->assertSame($built, ArchiveAdmin::create()->getArchiveTabs(), 'A later request serves the cached tabs');

        $this->logInWithPermission('CMS_ACCESS_' . ArchiveAdmin::class);
        ArchiveAdminShellExtension::resetMemo();
        $this->assertSame($built, ArchiveAdmin::create()->getArchiveTabs(), 'Another member shares them');

        $locale = i18n::get_locale();
        i18n::set_locale('de_DE');
        try {
            ArchiveAdminShellExtension::resetMemo();
            $this->assertNotSame($built, ArchiveAdmin::create()->getArchiveTabs(), 'Another locale misses the cache');
        } finally {
            i18n::set_locale($locale);
        }

        ArchiveAdminShellExtension::flush();
        $rebuilt = ArchiveAdmin::create()->getArchiveTabs();
        $this->assertNotSame($built, $rebuilt, 'A flush clears the cache');
        $this->assertSame($keepArchived, in_array(File::class, array_column($rebuilt['tabs'], 'class'), true));
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

    public function testLegacyOthersUrlRedirectsToTheOtherTabUnderTheShell(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $this->autoFollowRedirection = false;
        $otherClass = array_keys(ArchiveAdmin::create()->getVersionedModels('other', true))[0];

        $response = $this->get('admin/archive/?others=1', null, ['Accept' => 'text/html']);

        $this->assertSame(302, $response->getStatusCode(), (string) $response->getBody());
        $this->assertStringEndsWith(
            'admin/archive/' . str_replace('\\', '-', $otherClass),
            rtrim((string) $response->getHeader('Location'), '/')
        );
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
