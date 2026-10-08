<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\UserInterface\ArchiveAdminShellExtension;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\i18n\i18n;
use SilverStripe\VersionedAdmin\ArchiveAdmin;

class ArchiveTabsCacheRulesTest extends FunctionalTest
{
    protected $usesDatabase = true;

    protected function setUp(): void
    {
        parent::setUp();
        if (!class_exists(ArchiveAdmin::class) || !class_exists(SiteTree::class)) {
            $this->markTestSkipped('Needs silverstripe/versioned-admin and silverstripe/cms');
        }
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        ArchiveAdminShellExtension::flush();
    }

    protected function tearDown(): void
    {
        ArchiveAdminShellExtension::flush();
        parent::tearDown();
    }

    private function modelTabs(): array
    {
        return ArchiveAdmin::create()->getClientConfig()['modelTabs'];
    }

    public function testAWarmCacheGivesNoTabsToAMemberWhoCannotViewTheArchive(): void
    {
        $this->logInWithPermission('ADMIN');
        $this->assertNotEmpty($this->modelTabs());

        $this->logInWithPermission('CMS_ACCESS_CMSMain');
        $this->assertSame([], $this->modelTabs());
        ArchiveAdminShellExtension::resetMemo();
        $this->assertSame([], $this->modelTabs());
    }

    public function testAMemberWhosePermissionsChangeGetsTabsBuiltForTheNewCodes(): void
    {
        $member = $this->createMemberWithPermission('CMS_ACCESS_CMSMain');
        $this->logInAs($member);
        $this->assertSame([], $this->modelTabs());

        $group = $member->Groups()->first();
        \SilverStripe\Security\Permission::grant($group->ID, 'CMS_ACCESS_' . ArchiveAdmin::class);
        \SilverStripe\Security\Permission::reset();
        \SilverStripe\ORM\DataObject::flush_and_destroy_cache();
        $this->logInAs(\SilverStripe\Security\Member::get()->byID($member->ID));
        $this->assertTrue(ArchiveAdmin::create()->canView(), 'canView after the grant');
        $this->assertNotEmpty($this->modelTabs());
    }

    public function testTheTitlesFollowTheLocale(): void
    {
        $this->logInWithPermission('ADMIN');
        $english = $this->modelTabs();
        $locale = i18n::get_locale();
        i18n::set_locale('de_DE');
        $key = function (): string {
            $extension = ArchiveAdmin::create()->getExtensionInstance(ArchiveAdminShellExtension::class);
            $extension->setOwner(ArchiveAdmin::create());
            return (new \ReflectionMethod(ArchiveAdminShellExtension::class, 'archiveTabsKey'))->invoke($extension);
        };
        try {
            $german = $key();
            i18n::set_locale($locale);
            $keyBack = $key();
            $this->assertNotSame($german, $keyBack);
        } finally {
            i18n::set_locale($locale);
        }
        $this->assertSame($english, $this->modelTabs());
    }
}
