<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use Composer\InstalledVersions;
use SilverStripe\Admin\UserInterface\PiletFeed;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\SapphireTest;
use stdClass;

class PiletFeedTest extends SapphireTest
{
    protected $usesDatabase = false;

    private const FIXTURE = 'silverstripe/admin:tests/php/UserInterface/PiletFeedTest/hello.js';

    public function testTheModuleRegistersItsFieldsPilet(): void
    {
        $definition = Config::inst()->get(PiletFeed::class, 'pilets')['silverstripe-admin-fields'] ?? null;
        $this->assertSame('silverstripe/admin:client/dist/pilet/index.js', $definition['link'] ?? null);
        // The version comes from Composer, which installed the code; the pilet's package.json is never published
        $this->assertArrayNotHasKey('version', $definition);

        $items = array_column(PiletFeed::singleton()->getItems(), null, 'name');
        $this->assertArrayHasKey('silverstripe-admin-fields', $items);
        $item = $items['silverstripe-admin-fields'];
        $this->assertSame($this->adminVersion(), $item['version']);
        $this->assertSame('v2', $item['spec']);
        $this->assertSame('webpackChunkpr_silverstripeadminfields', $item['requireRef']);
        $this->assertMatchesRegularExpression('#^https?://.+/client/dist/pilet/index\.js(\?|$)#', $item['link']);
    }

    public function testVersionIsDerivedWhenTheConfigOmitsIt(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'module' => ['link' => PiletFeedTest::FIXTURE],
            'project' => ['link' => 'vendor/silverstripe/admin/tests/php/UserInterface/PiletFeedTest/hello.js'],
            'remote' => ['link' => 'https://cdn.example.test/remote/index.js'],
        ]);

        $items = array_column(PiletFeed::singleton()->getItems(), 'version', 'name');

        $this->assertSame($this->adminVersion(), $items['module']);
        $hash = substr(hash_file('sha384', __DIR__ . '/PiletFeedTest/hello.js'), 0, 8);
        $this->assertSame('0.0.0+' . $hash, $items['project']);
        $this->assertSame('0.0.0', $items['remote']);
    }

    public function testComposerVersionsBecomeSemver(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', ['module' => ['link' => PiletFeedTest::FIXTURE]]);

        $this->assertMatchesRegularExpression(
            '#^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$#',
            PiletFeed::singleton()->getItems()[0]['version']
        );
    }

    public function testIntegrityIsComputedForFilesOnly(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'hello' => ['link' => PiletFeedTest::FIXTURE],
            'remote' => ['link' => 'https://cdn.example.test/remote/index.js'],
            'pinned' => ['link' => 'https://cdn.example.test/pinned/index.js', 'integrity' => 'sha384-abc'],
        ]);

        $items = array_column(PiletFeed::singleton()->getItems(), null, 'name');

        $expected = 'sha384-' . base64_encode(hash_file('sha384', __DIR__ . '/PiletFeedTest/hello.js', true));
        $this->assertSame($expected, $items['hello']['integrity']);
        $this->assertArrayNotHasKey('integrity', $items['remote']);
        $this->assertSame('sha384-abc', $items['pinned']['integrity']);
    }

    public function testDisabledEntriesAreDropped(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'off' => ['link' => PiletFeedTest::FIXTURE, 'enabled' => false],
            'on' => ['link' => PiletFeedTest::FIXTURE, 'enabled' => true],
            'default' => ['link' => PiletFeedTest::FIXTURE],
        ]);

        $names = array_column(PiletFeed::singleton()->getItems(), 'name');

        $this->assertSame(['on', 'default'], $names);
    }

    private function adminVersion(): string
    {
        $pretty = (string) InstalledVersions::getPrettyVersion('silverstripe/admin');
        if (preg_match('#^v?(\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?)$#', $pretty, $matches)) {
            return $matches[1];
        }
        $slug = trim(preg_replace('#[^0-9A-Za-z-]+#', '-', $pretty), '-');
        return '0.0.0-' . $slug . '+' . substr((string) InstalledVersions::getReference('silverstripe/admin'), 0, 7);
    }

    public function testItemsAreBuiltFromTheBuildHeader(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'hello' => ['version' => '1.2.3', 'link' => PiletFeedTest::FIXTURE],
        ]);

        $items = PiletFeed::singleton()->getItems();

        $this->assertCount(1, $items);
        $item = $items[0];
        $this->assertSame('hello', $item['name']);
        $this->assertSame('1.2.3', $item['version']);
        $this->assertSame('v2', $item['spec']);
        $this->assertSame('webpackChunkhello', $item['requireRef']);
        $this->assertSame(['react' => 'https://example.test/react.js'], $item['dependencies']);
        $this->assertInstanceOf(stdClass::class, $item['custom']);
        $this->assertStringStartsWith('http', $item['link']);
        $this->assertStringContainsString('tests/php/UserInterface/PiletFeedTest/hello.js', $item['link']);
    }

    public function testConfigValuesWinOverTheHeader(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'hello' => [
                'version' => '1.0.0',
                'link' => PiletFeedTest::FIXTURE,
                'spec' => 'v3',
                'requireRef' => 'customRef',
                'dependencies' => ['tslib' => 'https://example.test/tslib.js'],
                'custom' => ['section' => 'pages'],
            ],
        ]);

        $item = PiletFeed::singleton()->getItems()[0];

        $this->assertSame('v3', $item['spec']);
        $this->assertSame('customRef', $item['requireRef']);
        $this->assertSame(['tslib' => 'https://example.test/tslib.js'], $item['dependencies']);
        $this->assertSame(['section' => 'pages'], $item['custom']);
    }

    public function testMissingFilesAndLinklessEntriesAreDropped(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'missing' => ['version' => '1.0.0', 'link' => 'silverstripe/admin:tests/php/UserInterface/PiletFeedTest/missing.js'],
            'linkless' => ['version' => '1.0.0'],
            'unknown-module' => ['version' => '1.0.0', 'link' => 'nobody/nothing:client/dist/hello.js'],
            'not-a-module-path' => ['version' => '1.0.0', 'link' => 'app:client/dist/hello.js'],
            'hello' => ['version' => '1.0.0', 'link' => PiletFeedTest::FIXTURE],
        ]);

        $items = PiletFeed::singleton()->getItems();

        $this->assertCount(1, $items);
        $this->assertSame('hello', $items[0]['name']);
    }

    public function testProjectRelativePathsResolve(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'hello' => [
                'version' => '1.0.0',
                'link' => 'vendor/silverstripe/admin/tests/php/UserInterface/PiletFeedTest/hello.js',
            ],
        ]);

        $item = PiletFeed::singleton()->getItems()[0];

        $this->assertSame('webpackChunkhello', $item['requireRef']);
        $this->assertStringContainsString('tests/php/UserInterface/PiletFeedTest/hello.js', $item['link']);
    }

    public function testRelativeDependenciesBecomeAbsolute(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'hello' => [
                'version' => '1.0.0',
                'link' => PiletFeedTest::FIXTURE,
                'dependencies' => ['chunk' => 'chunk.js', 'remote' => 'https://cdn.example.test/x.js'],
            ],
        ]);

        $item = PiletFeed::singleton()->getItems()[0];

        $this->assertSame('https://cdn.example.test/x.js', $item['dependencies']['remote']);
        $this->assertStringEndsWith('/PiletFeedTest/chunk.js', $item['dependencies']['chunk']);
        $this->assertStringStartsWith('http', $item['dependencies']['chunk']);
    }

    public function testOlderHeadersAndMissingHeadersAreTolerated(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'v1' => ['version' => '1.0.0', 'link' => 'silverstripe/admin:tests/php/UserInterface/PiletFeedTest/hello-v1.js'],
            'plain' => ['version' => '1.0.0', 'link' => 'silverstripe/admin:tests/php/UserInterface/PiletFeedTest/plain.js'],
        ]);

        [$v1, $plain] = PiletFeed::singleton()->getItems();

        $this->assertSame('v1', $v1['spec']);
        $this->assertSame('webpackChunkhelloV1', $v1['requireRef']);
        $this->assertInstanceOf(stdClass::class, $v1['dependencies']);
        $this->assertSame('v2', $plain['spec']);
        $this->assertNull($plain['requireRef']);
    }

    public function testLinksThatLeaveTheProjectAreDropped(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'up' => ['version' => '1.0.0', 'link' => '../../etc/hostname'],
            'module-up' => ['version' => '1.0.0', 'link' => 'silverstripe/admin:../../../.env'],
            'hello' => ['version' => '1.0.0', 'link' => PiletFeedTest::FIXTURE],
        ]);

        $items = PiletFeed::singleton()->getItems();

        $this->assertCount(1, $items);
        $this->assertSame('hello', $items[0]['name']);
    }

    public function testScalarConfigYieldsNoItems(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', 'nonsense');

        $this->assertSame([], PiletFeed::singleton()->getItems());
    }

    public function testAbsoluteLinksPassThroughWithoutAHeader(): void
    {
        Config::modify()->set(PiletFeed::class, 'pilets', [
            'remote' => ['version' => '2.0.0', 'link' => 'https://cdn.example.test/remote/index.js'],
        ]);

        $item = PiletFeed::singleton()->getItems()[0];

        $this->assertSame('https://cdn.example.test/remote/index.js', $item['link']);
        $this->assertSame('v2', $item['spec']);
        $this->assertNull($item['requireRef']);
        $this->assertInstanceOf(stdClass::class, $item['dependencies']);
    }
}
