<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\UserInterface\PiletFeed;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;

class PiletFeedControllerTest extends FunctionalTest
{
    use ShellResponseAssertions;

    private const AJAX = ['X-Requested-With' => 'XMLHttpRequest'];

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

    public function testAnonymousAjaxRequestsGetAJsonError(): void
    {
        $this->logOut();
        $this->autoFollowRedirection = false;

        $response = $this->get('admin/pilets/', null, PiletFeedControllerTest::AJAX);

        $this->assertJsonError($response, 403, 'notLoggedIn');
        $this->assertSame('1', $response->getHeader('X-Reauthenticate'));
        $this->assertArrayNotHasKey('items', json_decode($response->getBody(), true));
    }

    public function testAjaxRequestsWithoutCmsAccessGetAJsonForbidden(): void
    {
        $this->logInWithPermission('SOME_OTHER_CODE');

        $response = $this->get('admin/pilets/', null, PiletFeedControllerTest::AJAX);

        $this->assertJsonError($response, 403, 'forbidden');
        $this->assertNull($response->getHeader('X-Reauthenticate'));
    }

    public function testCmsUsersGetTheFeed(): void
    {
        $this->logInWithPermission('CMS_ACCESS_LeftAndMain');

        $response = $this->get('admin/pilets/', null, PiletFeedControllerTest::AJAX);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('application/json', $response->getHeader('Content-Type'));
        $this->assertSame('private, no-cache', $response->getHeader('Cache-Control'));
        $feed = json_decode($response->getBody(), true);
        $this->assertSame('hello', $feed['items'][0]['name']);
        $this->assertSame('webpackChunkhello', $feed['items'][0]['requireRef']);
        $this->assertStringStartsWith('sha384-', $feed['items'][0]['integrity']);
    }

    public function testTheEtagAnswersIfNoneMatchWithNotModified(): void
    {
        $this->logInWithPermission('CMS_ACCESS_LeftAndMain');

        $etag = $this->get('admin/pilets/')->getHeader('ETag');
        $this->assertMatchesRegularExpression('#^"[0-9a-f]{32}"$#', $etag);

        $notModified = $this->get('admin/pilets/', null, ['If-None-Match' => $etag]);
        $this->assertSame(304, $notModified->getStatusCode());
        $this->assertSame('', $notModified->getBody());
        $this->assertSame($etag, $notModified->getHeader('ETag'));

        $weakInAList = $this->get('admin/pilets/', null, ['If-None-Match' => '"other", W/' . $etag]);
        $this->assertSame(304, $weakInAList->getStatusCode());

        $stale = $this->get('admin/pilets/', null, ['If-None-Match' => '"stale"']);
        $this->assertSame(200, $stale->getStatusCode());
    }

    public function testTheEtagChangesWithTheItems(): void
    {
        $this->logInWithPermission('CMS_ACCESS_LeftAndMain');
        $before = $this->get('admin/pilets/')->getHeader('ETag');

        Config::modify()->set(PiletFeed::class, 'pilets', [
            'hello' => [
                'version' => '1.0.1',
                'link' => 'silverstripe/admin:tests/php/UserInterface/PiletFeedTest/hello.js',
            ],
        ]);
        $response = $this->get('admin/pilets/', null, ['If-None-Match' => $before]);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertNotSame($before, $response->getHeader('ETag'));
    }

    public function testEntriesNeedOneOfTheirPermissionCodes(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'open' => ['link' => 'silverstripe/admin:tests/php/UserInterface/PiletFeedTest/hello.js'],
            'reports' => [
                'link' => 'silverstripe/admin:tests/php/UserInterface/PiletFeedTest/hello.js',
                'permissions' => ['CMS_ACCESS_ReportAdmin', 'ADMIN'],
            ],
            'files' => [
                'link' => 'silverstripe/admin:tests/php/UserInterface/PiletFeedTest/hello.js',
                'permissions' => 'CMS_ACCESS_AssetAdmin',
            ],
        ]);

        $this->logInWithPermission('CMS_ACCESS_CMSMain');
        $this->assertSame(['open'], $this->feedNames());

        $this->logInWithPermission(['CMS_ACCESS_CMSMain', 'CMS_ACCESS_AssetAdmin']);
        $this->assertSame(['open', 'files'], $this->feedNames());

        // Access to all CMS sections passes every CMS_ACCESS_ code
        $this->logInWithPermission('CMS_ACCESS_LeftAndMain');
        $this->assertSame(['open', 'reports', 'files'], $this->feedNames());
    }

    private function feedNames(): array
    {
        return array_column(json_decode($this->get('admin/pilets/')->getBody(), true)['items'], 'name');
    }
}
