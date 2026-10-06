<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\UserInterface\PiletFeed;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;

class PiletFeedControllerTest extends FunctionalTest
{
    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'hello' => [
                'version' => '1.0.0',
                'link' => 'silverstripe/admin:tests/php/UserInterface/PiletFeedTest/hello.js',
            ],
        ]);
    }

    public function testAnonymousRequestsAreRedirectedToLogin(): void
    {
        $this->logOut();
        $this->autoFollowRedirection = false;

        $response = $this->get('admin/pilets/');

        $this->assertSame(302, $response->getStatusCode());
        $this->assertStringContainsString('Security/login', $response->getHeader('Location'));
    }

    public function testCmsUsersGetTheFeed(): void
    {
        $this->logInWithPermission('CMS_ACCESS_LeftAndMain');

        $response = $this->get('admin/pilets/');

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('application/json', $response->getHeader('Content-Type'));
        $this->assertSame('no-store', $response->getHeader('Cache-Control'));
        $feed = json_decode($response->getBody(), true);
        $this->assertSame('hello', $feed['items'][0]['name']);
        $this->assertSame('webpackChunkhello', $feed['items'][0]['requireRef']);
    }
}
