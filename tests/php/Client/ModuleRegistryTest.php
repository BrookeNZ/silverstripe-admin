<?php

namespace SilverStripe\Admin\Tests\Client;

use Monolog\Handler\TestHandler;
use Monolog\Logger;
use Psr\Log\LoggerInterface;
use RuntimeException;
use SilverStripe\Admin\Client\ImportMap;
use SilverStripe\Admin\Client\ModuleRegistry;
use SilverStripe\Admin\Tests\Client\ModuleRegistryTest\UpdateModuleItemsExtension;
use SilverStripe\Control\Director;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Environment;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Core\Kernel;
use SilverStripe\Core\Manifest\ModuleResourceLoader;
use SilverStripe\Dev\SapphireTest;

class ModuleRegistryTest extends SapphireTest
{
    protected $usesDatabase = false;

    private const string FIXTURE = 'silverstripe/admin:tests/php/Client/ModuleRegistryTest/esm.js';

    private string $originalEnvironment = '';

    protected function setUp(): void
    {
        parent::setUp();
        // The dev-only checks run only where a test asks for dev
        $this->originalEnvironment = $this->kernel()->getEnvironment();
        $this->kernel()->setEnvironment(Kernel::TEST);
    }

    protected function tearDown(): void
    {
        $this->kernel()->setEnvironment($this->originalEnvironment);
        parent::tearDown();
    }

    private function kernel(): Kernel
    {
        return Injector::inst()->get(Kernel::class);
    }

    public function testDisabledEntriesAreDropped(): void
    {
        Config::modify()->set(ModuleRegistry::class, 'modules', [
            'acme/off' => ['link' => ModuleRegistryTest::FIXTURE, 'enabled' => false],
            'acme/on' => ['link' => ModuleRegistryTest::FIXTURE, 'enabled' => true],
            'acme/default' => ['link' => ModuleRegistryTest::FIXTURE],
        ]);

        $items = ModuleRegistry::singleton()->getModuleItems();

        $this->assertSame(
            [
                ['name' => 'acme/on', 'specifier' => 'acme/on'],
                ['name' => 'acme/default', 'specifier' => 'acme/default'],
            ],
            $items
        );
    }

    public function testFilesResolveFromOutsideTheProjectRoot(): void
    {
        Config::modify()->set(ModuleRegistry::class, 'modules', [
            // A project path, which is served only through the exposed copy of admin's client/dist
            'acme/hello' => ['link' => $path = ModuleResourceLoader::singleton()->resolvePath('silverstripe/admin:client/dist/js/bundle.js')],
        ]);
        $directory = getcwd();
        // php-fpm runs from public/, where a path relative to the project root does not resolve
        chdir(Director::publicFolder());
        try {
            $map = ImportMap::create()->getMap(ModuleRegistry::create()->getImports());
        } finally {
            chdir($directory);
        }

        $this->assertStringContainsString('/' . RESOURCES_DIR . '/' . $path, $map['imports']['acme/hello']);
    }

    public function testAProjectFileOutsidePublicWithNoExposedCopyIsDropped(): void
    {
        Config::modify()->set(ModuleRegistry::class, 'modules', ['acme/root' => ['link' => 'composer.json']]);
        $logged = $this->captureWarnings();

        $this->assertSame([], ModuleRegistry::singleton()->getImports());
        $this->assertTrue($logged->hasWarningThatContains('add its folder to extra.expose'));
    }

    public function testMissingFilesAndLinklessEntriesAreDropped(): void
    {
        Config::modify()->set(ModuleRegistry::class, 'modules', [
            'acme/missing' => [
                'link' => 'silverstripe/admin:tests/php/Client/ModuleRegistryTest/missing.js',
                'imports' => ['@acme/missing-helper' => ModuleRegistryTest::FIXTURE],
            ],
            'acme/linkless' => ['requires' => ['react']],
            'acme/unknown-module' => ['link' => 'nobody/nothing:client/dist/hello.js'],
            'acme/not-a-module-path' => ['link' => 'app:client/dist/hello.js'],
            'acme/hello' => ['link' => ModuleRegistryTest::FIXTURE],
        ]);
        $logged = $this->captureWarnings();

        $registry = ModuleRegistry::singleton();

        $this->assertSame(['acme/hello'], array_column($registry->getModuleItems(), 'name'));
        $this->assertSame(['acme/hello'], array_keys($registry->getImports()), 'A skipped module adds none of its imports');
        $this->assertTrue($logged->hasWarningThatContains('Module "acme/missing" points at a missing file'));
    }

    public function testAnUpperCaseSchemeLinkStaysOffSite(): void
    {
        Config::modify()->set(ModuleRegistry::class, 'modules', [
            'acme/one' => ['link' => 'HTTPS://cdn.example.test/one.js'],
        ]);

        $this->assertSame(['acme/one' => 'https://cdn.example.test/one.js'], ModuleRegistry::singleton()->getImports());
    }

    public function testLinksThatLeaveTheProjectAreDropped(): void
    {
        Config::modify()->set(ModuleRegistry::class, 'modules', [
            'acme/up' => ['link' => '../../etc/hostname'],
            'acme/module-up' => ['link' => 'silverstripe/admin:../../../.env'],
            'acme/hello' => ['link' => ModuleRegistryTest::FIXTURE, 'imports' => ['helper' => '../../etc/hostname']],
        ]);
        $logged = $this->captureWarnings();

        $registry = ModuleRegistry::singleton();

        $this->assertSame(['acme/hello'], array_column($registry->getModuleItems(), 'name'));
        $this->assertSame(['acme/hello'], array_keys($registry->getImports()));
        $this->assertTrue($logged->hasWarningThatContains('Module "acme/up" was skipped: Can not collapse relative folders'), 'The .. segment, not a missing file, drops it');
    }

    public function testAnItemUpdateModuleItemsGivesAnUnmappedSpecifierIsDropped(): void
    {
        Config::modify()->set(ModuleRegistry::class, 'modules', ['acme/hello' => ['link' => ModuleRegistryTest::FIXTURE]]);
        ModuleRegistry::add_extension(UpdateModuleItemsExtension::class);
        $logged = $this->captureWarnings();

        $items = ModuleRegistry::singleton()->getModuleItems();

        $this->assertSame(['acme/hello', 'acme/again'], array_column($items, 'name'));
        $this->assertTrue($logged->hasWarningThatContains('the specifier "acme/stray", which no module adds'));
    }

    public function testADevUrlReplacesTheModulesMapUrlInDev(): void
    {
        $this->configureDevOverride('acme/hello=http://localhost:8080/index.js');

        $imports = $this->inDev(fn () => ModuleRegistry::singleton()->getImports())[0];

        $this->assertSame('http://localhost:8080/index.js', $imports['acme/hello']);
    }

    public function testADevURLThatIsNotHttpOrNamesAnUnknownModuleIsRefused(): void
    {
        $this->configureDevOverride(
            'acme/hello=javascript:alert(1),acme/hello=/local/index.js,acme/hello=//cdn.example.test/index.js,'
            . 'acme/hello=ftp://x.test/a.js,acme/nobody=http://localhost:8080/index.js,'
        );

        [$imports, $warnings] = $this->inDev(fn () => ModuleRegistry::singleton()->getImports());

        $this->assertStringContainsString('tests/php/Client/ModuleRegistryTest/esm.js', $imports['acme/hello']);
        $this->assertCount(5, $warnings);
        $this->assertStringContainsString('names "acme/nobody"', $warnings[4]);
    }

    public function testDevURLsAreIgnoredOutsideDev(): void
    {
        $this->configureDevOverride('acme/hello=http://localhost:8080/index.js');
        $logged = $this->captureWarnings();

        $imports = ModuleRegistry::singleton()->getImports();

        $this->assertStringContainsString('tests/php/Client/ModuleRegistryTest/esm.js', $imports['acme/hello']);
        $this->assertTrue($logged->hasWarningThatContains('SS_ADMIN_MODULE_DEV_URLS is set outside dev'));
    }

    public function testTwoModulesAddingOneSpecifierDropItFromBothWithALoggedErrorOutsideDev(): void
    {
        $this->configureTwoProviders();
        $logged = $this->captureWarnings();

        $registry = ModuleRegistry::singleton();

        $this->assertSame(['silverstripe/dates', 'silverstripe/calendar'], array_column($registry->getModuleItems(), 'name'));
        $this->assertSame(['silverstripe/dates', 'silverstripe/calendar'], array_keys($registry->getImports()));
        $this->assertCount(1, $logged->getRecords(), 'Logged once, though both the list and the map read the entries');
        $this->assertTrue($logged->hasErrorThatContains('and module "silverstripe/calendar" add "@silverstripe/dayjs"'));
    }

    private function configureTwoProviders(): void
    {
        $imports = ['@silverstripe/dayjs' => ModuleRegistryTest::FIXTURE];
        Config::modify()->set(ModuleRegistry::class, 'modules', [
            'silverstripe/dates' => ['link' => ModuleRegistryTest::FIXTURE, 'imports' => $imports],
            'silverstripe/calendar' => ['link' => ModuleRegistryTest::FIXTURE, 'imports' => $imports],
        ]);
    }

    public function testAModuleNameOrImportClaimingASharedSpecifierIsADuplicate(): void
    {
        Config::modify()->set(ModuleRegistry::class, 'modules', [
            'react/jsx-runtime' => ['link' => ModuleRegistryTest::FIXTURE],
            'silverstripe/dates' => [
                'link' => ModuleRegistryTest::FIXTURE,
                'imports' => ['@silverstripe/admin' => ModuleRegistryTest::FIXTURE, '@silverstripe/dayjs' => ModuleRegistryTest::FIXTURE],
            ],
        ]);

        $thrown = '';
        $this->kernel()->setEnvironment(Kernel::DEV);
        try {
            ModuleRegistry::create()->getModuleItems();
        } catch (RuntimeException $exception) {
            $thrown = $exception->getMessage();
        } finally {
            $this->kernel()->setEnvironment(Kernel::TEST);
        }
        $this->assertStringContainsString('The loader build\'s shared files and module "react/jsx-runtime" add "react/jsx-runtime"', $thrown, 'A module named like a shared file throws in dev');

        $logged = $this->captureWarnings();
        $registry = ModuleRegistry::create();

        $this->assertSame(['silverstripe/dates'], array_column($registry->getModuleItems(), 'name'));
        $this->assertSame(['silverstripe/dates', '@silverstripe/dayjs'], array_keys($registry->getImports()));
        $this->assertTrue($logged->hasErrorThatContains('module "silverstripe/dates" add "@silverstripe/admin"'));
    }

    public function testABrokenNameOrSpecifierRuleDropsTheEntryOrSpecifierWithAWarningInDevWithoutThrowing(): void
    {
        $refused = [
            'specifier is a path' => $this->refusedFor('silverstripe/dates', './dayjs.js'),
            'specifier is a URL' => $this->refusedFor('silverstripe/dates', 'https://evil.test/x'),
            'name is a URL' => $this->refusedFor('https://evil.test/x', null, 'https://cdn.example.test/x.js'),
            'name takes a scope' => $this->refusedFor('@silverstripe/whatever', null, 'https://cdn.example.test/whatever.js'),
            'name ends with a slash' => $this->refusedFor('silverstripe/dates/'),
            'specifier ends with a slash' => $this->refusedFor('silverstripe/dates', '@silverstripe/dayjs/'),
        ];

        $this->assertSame([], array_keys(array_filter($refused, fn (bool $dropped) => !$dropped)));
        $this->assertFalse($this->refusedFor('acme/dates', 'dayjs'), 'Any entry may add any bare specifier');

        Config::modify()->set(ModuleRegistry::class, 'modules', ['dates' => ['link' => ModuleRegistryTest::FIXTURE]]);
        [$items, $warnings] = $this->inDev(fn () => ModuleRegistry::create()->getModuleItems());
        $this->assertSame(
            [[], ['Module "dates" is not vendor/name: a module is named after its Composer package, one vendor and one'
                . ' name, so single words stay free for other owners; the entry was left out']],
            [$items, $warnings]
        );
    }

    public function testAScalarImportsDropsTheEntryWithAWarning(): void
    {
        Config::modify()->set(ModuleRegistry::class, 'modules', [
            'silverstripe/dates' => ['link' => ModuleRegistryTest::FIXTURE, 'imports' => ModuleRegistryTest::FIXTURE],
            'silverstripe/dayjs' => ['imports' => ModuleRegistryTest::FIXTURE],
        ]);
        $logged = $this->captureWarnings();

        $registry = ModuleRegistry::singleton();

        $this->assertSame([], $registry->getModuleItems());
        $this->assertSame([], $registry->getImports());
        $this->assertTrue($logged->hasWarningThatContains('Module "silverstripe/dates" has imports of type string'));
        $this->assertTrue($logged->hasWarningThatContains('Library package "silverstripe/dayjs" has imports of type string'));
    }

    /**
     * Whether the entry, or its one specifier, is missing from the list or map in dev with a warning logged
     */
    private function refusedFor(string $name, ?string $specifier = null, string $link = ModuleRegistryTest::FIXTURE): bool
    {
        $entry = ['link' => $link];
        if ($specifier !== null) {
            $entry['imports'] = [$specifier => ModuleRegistryTest::FIXTURE];
        }
        Config::modify()->set(ModuleRegistry::class, 'modules', [$name => $entry]);
        [$listed, $warnings] = $this->inDev(function () use ($name, $specifier) {
            $registry = ModuleRegistry::create();
            $listed = array_column($registry->getModuleItems(), 'name') === [$name];
            return $listed && ($specifier === null || isset($registry->getImports()[$specifier]));
        });
        return !$listed && $warnings !== [];
    }

    private function configureDevOverride(string $value): void
    {
        Config::modify()->set(ModuleRegistry::class, 'modules', ['acme/hello' => ['link' => ModuleRegistryTest::FIXTURE]]);
        // GlobalsTestState restores the environment after each test
        Environment::setEnv(ModuleRegistry::DEV_URLS_ENV, $value);
    }

    /**
     * Runs the callback in dev and returns its result with the warnings logged
     *
     * @return array{0: mixed, 1: list<string>}
     */
    private function inDev(callable $callback): array
    {
        $logged = $this->captureWarnings();
        $this->kernel()->setEnvironment(Kernel::DEV);
        try {
            $result = $callback();
        } finally {
            $this->kernel()->setEnvironment(Kernel::TEST);
        }
        return [$result, array_map(fn ($record) => (string) $record['message'], $logged->getRecords())];
    }

    private function captureWarnings(): TestHandler
    {
        $handler = new TestHandler();
        Injector::inst()->registerService(new Logger('test', [$handler]), LoggerInterface::class);
        return $handler;
    }
}
