<?php

namespace SilverStripe\Admin\Tests\Client;

use Monolog\Handler\TestHandler;
use Monolog\Logger;
use Psr\Log\LoggerInterface;
use SilverStripe\Admin\Client\ImportMap;
use SilverStripe\Admin\Client\LoaderAssets;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\SapphireTest;

class ImportMapTest extends SapphireTest
{
    private const string RELEASE_FIXTURE = 'silverstripe/admin:tests/php/Client/ImportMapTest/release/';

    protected $usesDatabase = false;

    private TestHandler $warnings;

    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(LoaderAssets::class, 'release_dir', ImportMapTest::RELEASE_FIXTURE);
        $this->warnings = new TestHandler();
        Injector::inst()->registerService(new Logger('test', [$this->warnings]), LoggerInterface::class);
    }

    public function testEveryManifestSpecifierMapsToAHashedURL(): void
    {
        $map = ImportMap::singleton()->getMap();

        $shared = preg_quote(LoaderAssets::singleton()->getReleaseBaseURL() . 'shared/', '#');
        $this->assertSame(['present', '@scope/also', 'alias'], array_keys($map['imports']));
        $this->assertMatchesRegularExpression('#^' . $shared . 'present\.js\?v=b08de28e$#', $map['imports']['present']);
        $this->assertMatchesRegularExpression('#^' . $shared . 'also\.js\?v=5debdf9c$#', $map['imports']['@scope/also']);
        $this->assertSame($map['imports']['present'], $map['imports']['alias']);
        $this->assertFalse($this->warnings->hasWarningRecords());
    }

    public function testTheFixedSharedSpecifiersMatchTheLoadersSharedList(): void
    {
        $source = (string) file_get_contents(__DIR__ . '/../../../client/loader/shared.js');
        $this->assertSame(1, preg_match('#export const sharedFiles = \{(.*?)\};#s', $source, $block));
        preg_match_all("#^\s*(?:'([^']+)'|([\w\$]+))\s*:#m", $block[1], $keys);
        $specifiers = array_values(array_filter(array_map(fn ($quoted, $bare) => $quoted ?: $bare, $keys[1], $keys[2])));

        $this->assertNotEmpty($specifiers);
        $this->assertEqualsCanonicalizing($specifiers, LoaderAssets::SHARED_SPECIFIERS);
    }
}
