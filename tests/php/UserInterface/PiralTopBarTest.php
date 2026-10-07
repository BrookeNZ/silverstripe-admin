<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\AdminRootController;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\SapphireTest;
use SilverStripe\Security\Member;
use SilverStripe\SiteConfig\SiteConfig;

class PiralTopBarTest extends SapphireTest
{
    protected $usesDatabase = true;

    private function topBar(): array
    {
        return json_decode(LeftAndMain::create()->PiralTopBar(), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testComposesTheMemberNameAsTheLegacyMenuDoes(): void
    {
        $member = Member::create(['FirstName' => 'Ada', 'Surname' => 'Lovelace', 'Email' => 'ada@example.com']);
        $member->write();
        $this->logInAs($member);
        $this->assertSame('Ada Lovelace', $this->topBar()['member']['name']);

        $member->Surname = '';
        $member->write();
        $this->assertSame('Ada', $this->topBar()['member']['name']);

        $member->FirstName = '';
        $member->Surname = 'Lovelace';
        $member->write();
        $this->assertSame('ada@example.com', $this->topBar()['member']['name']);
        $this->assertSame(AdminRootController::admin_url('myprofile'), $this->topBar()['member']['profileUrl']);
    }

    public function testCarriesTheSiteAndALogoutUrlBackToTheAdmin(): void
    {
        $config = SiteConfig::current_site_config();
        $config->Title = 'Example site';
        $config->write();
        $this->logInWithPermission('ADMIN');

        $topBar = $this->topBar();
        $this->assertSame('Example site', $topBar['siteName']);
        $this->assertSame('Silverstripe', $topBar['applicationName']);
        $this->assertStringContainsString('BackURL=' . urlencode(AdminRootController::admin_url()), $topBar['logoutUrl']);
        $this->assertSame(['title' => 'CMS User help', 'url' => 'https://userhelp.silverstripe.org/en/6/'], $topBar['helpLinks'][0]);
    }

    public function testHelpLinksAreEmptyWhenTheConfigIsFalse(): void
    {
        Config::modify()->set(LeftAndMain::class, 'help_links', false);
        $this->logInWithPermission('ADMIN');

        $this->assertSame([], $this->topBar()['helpLinks']);
    }
}
