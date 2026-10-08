<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\PiralShellStartupTest\PreloadExtension;
use SilverStripe\Admin\UserInterface\PiletFeed;
use SilverStripe\CMS\Controllers\CMSMain;
use SilverStripe\Control\Controller;
use SilverStripe\Control\Director;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;

class PiralShellStartupTest extends FunctionalTest
{
    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'hello' => [
                'version' => '1.0.0',
                'link' => 'silverstripe/admin:tests/php/UserInterface/PiletFeedTest/hello.js',
            ],
            'plain' => [
                'link' => 'silverstripe/admin:tests/php/UserInterface/PiletFeedTest/plain.js',
                'permissions' => 'CMS_ACCESS_SecurityAdmin',
            ],
            'remote' => [
                'link' => 'https://cdn.example.com/remote/index.js',
            ],
        ]);
    }

    public function testTheInlinedPiletsEqualTheFeedForTheSameMember(): void
    {
        foreach (['CMS_ACCESS_LeftAndMain', 'CMS_ACCESS_AssetAdmin'] as $code) {
            $this->logInWithPermission($code);

            $feed = json_decode($this->get('admin/pilets/', null, ['X-Requested-With' => 'XMLHttpRequest'])->getBody(), true);
            $shell = $this->get('admin/shell/', null, ['Accept' => 'text/html'])->getBody();
            $this->assertMatchesRegularExpression('#data-pilets="([^"]*)"#', $shell, $code);
            preg_match('#data-pilets="([^"]*)"#', $shell, $matches);

            $inlined = json_decode(html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5), true, 512, JSON_THROW_ON_ERROR);
            $this->assertSame($feed['items'], $inlined, $code);
        }
        $this->assertSame(['hello', 'remote'], array_column($inlined, 'name'));
    }

    public function testAMemberTheFeedWouldRefuseGetsNoInlinedPiletsOrPreloads(): void
    {
        $this->logInWithPermission('SOME_OTHER_CODE');
        $controller = LeftAndMain::create();

        $this->assertSame('', $controller->PiralPilets());
        $this->assertSame([], $controller->getPiralPreloads());
    }

    public function testThePreloadsDefaultToThePiletScripts(): void
    {
        $this->logInWithPermission('ADMIN');

        $preloads = LeftAndMain::create()->getPiralPreloads();

        $this->assertCount(3, $preloads);
        $this->assertStringStartsWith(Director::absoluteURL('/'), $preloads[0]);
        $this->assertStringContainsString('PiletFeedTest/hello.js', $preloads[0]);
        $this->assertSame('https://cdn.example.com/remote/index.js', $preloads[2]);
    }

    public function testASectionAddsItsPreloadsThroughTheHook(): void
    {
        LeftAndMain::add_extension(PreloadExtension::class);
        try {
            $this->logInWithPermission('ADMIN');
            $links = LeftAndMain::create()->PiralPreloadLinks()->toNestedArray();
        } finally {
            LeftAndMain::remove_extension(PreloadExtension::class);
        }

        $byUrl = array_column($links, null, 'URL');
        $schema = $byUrl['admin/example/schema?id=1'];
        $this->assertSame(['fetch', 'anonymous'], [$schema['As'], $schema['CrossOrigin']]);
        $local = $links[0];
        $this->assertSame(['script', ''], [$local['As'], $local['CrossOrigin']]);
        $remote = $byUrl['https://cdn.example.com/remote/index.js'];
        $this->assertSame(['script', 'anonymous'], [$remote['As'], $remote['CrossOrigin']]);
    }

    public function testThePagesSectionPreloadsItsTreeRequests(): void
    {
        if (!class_exists(CMSMain::class)) {
            $this->markTestSkipped('silverstripe/cms is not installed');
        }
        Config::modify()->set(Controller::class, 'add_trailing_slash', true);
        $this->logInWithPermission('ADMIN');

        $body = $this->get('admin/pages/', null, ['Accept' => 'text/html'])->getBody();

        $tree = 'admin/pages/tree/children/0?page=1&amp;limit=50';
        $hints = 'admin/pages/move/hints';
        $this->assertStringContainsString('<link rel="preload" href="' . $tree . '" as="fetch" crossorigin="anonymous" />', $body);
        $this->assertStringContainsString('<link rel="preload" href="' . $hints . '" as="fetch" crossorigin="anonymous" />', $body);
    }
}
