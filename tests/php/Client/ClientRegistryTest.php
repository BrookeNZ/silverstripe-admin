<?php

namespace SilverStripe\Admin\Tests\Client;

use Monolog\Handler\TestHandler;
use Monolog\Logger;
use Psr\Log\LoggerInterface;
use RuntimeException;
use SilverStripe\Admin\Client\ImportMap;
use SilverStripe\Admin\Client\ClientRegistry;
use SilverStripe\Admin\Tests\Client\ClientRegistryTest\UpdateEntriesExtension;
use SilverStripe\Control\Director;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Environment;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Core\Kernel;
use SilverStripe\Core\Manifest\ModuleResourceLoader;
use SilverStripe\Dev\SapphireTest;

class ClientRegistryTest extends SapphireTest
{
    protected $usesDatabase = false;

    // A module link must be in a folder the module exposes
    private const string FIXTURE = 'silverstripe/admin:client/dist/js/i18n.js';

    // A package the site has installed, so the dev check for an unknown package stays quiet
    private const string INSTALLED = 'silverstripe/admin';

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
        Config::modify()->set(ClientRegistry::class, 'modules', [
            'acme/off' => [
                'enabled' => false,
                'imports' => ['off-library' => ClientRegistryTest::FIXTURE],
                'entries' => [
                    'first' => ['link' => ClientRegistryTest::FIXTURE, 'css' => 'https://cdn.example.test/first.css'],
                    'second' => ['link' => ClientRegistryTest::FIXTURE, 'css' => 'https://cdn.example.test/second.css'],
                ],
            ],
            'acme/on' => [
                'enabled' => true,
                'imports' => ['on-library' => ClientRegistryTest::FIXTURE],
                'entries' => [
                    'off' => ['link' => ClientRegistryTest::FIXTURE, 'css' => 'https://cdn.example.test/off.css', 'enabled' => false],
                    'main' => ['link' => ClientRegistryTest::FIXTURE, 'css' => 'https://cdn.example.test/main.css', 'enabled' => true],
                    'default' => ['link' => ClientRegistryTest::FIXTURE],
                ],
            ],
        ]);

        $registry = ClientRegistry::singleton();

        $this->assertSame(
            [
                ['name' => 'acme/on/main', 'module' => 'acme/on'],
                ['name' => 'acme/on/default', 'module' => 'acme/on'],
            ],
            $registry->getEntries()
        );
        $this->assertSame(['acme/on/main', 'acme/on/default', 'on-library'], array_keys($registry->getImports()));
        $this->assertSame(['acme/on/main'], array_column($registry->getStylesheets(), 'name'));
    }

    public function testEntriesFollowTheOrderTheirModulesAndTheyWereFirstDeclared(): void
    {
        $entry = fn (string $css) => ['link' => ClientRegistryTest::FIXTURE, 'css' => 'https://cdn.example.test/' . $css . '.css'];
        Config::modify()->set(ClientRegistry::class, 'modules', [
            'acme/first' => ['entries' => ['main' => $entry('first-main')]],
            'acme/second' => ['entries' => ['main' => $entry('second-main')]],
        ]);
        Config::modify()->merge(ClientRegistry::class, 'modules', [
            'acme/first' => ['entries' => ['late' => $entry('first-late')]],
        ]);

        $registry = ClientRegistry::create();

        $this->assertSame(
            ['acme/first/main', 'acme/first/late', 'acme/second/main'],
            array_column($registry->getEntries(), 'name')
        );
        $this->assertSame(
            ['acme/first/main', 'acme/first/late', 'acme/second/main'],
            array_column($registry->getStylesheets(), 'name')
        );
    }

    public function testFilesResolveFromOutsideTheProjectRoot(): void
    {
        Config::modify()->set(ClientRegistry::class, 'modules', [
            // A project path, which is served only through the exposed copy of admin's client/dist
            'acme/hello' => ['entries' => ['main' => [
                'link' => $path = ModuleResourceLoader::singleton()->resolvePath('silverstripe/admin:client/dist/js/bundle.js'),
            ]]],
        ]);
        $directory = getcwd();
        // php-fpm runs from public/, where a path relative to the project root does not resolve
        chdir(Director::publicFolder());
        try {
            $map = ImportMap::create()->getMap(ClientRegistry::create()->getImports());
        } finally {
            chdir($directory);
        }

        $this->assertStringContainsString('/' . RESOURCES_DIR . '/' . $path, $map['imports']['acme/hello/main']);
    }

    public function testAProjectFileOutsidePublicWithNoExposedCopyIsDropped(): void
    {
        Config::modify()->set(ClientRegistry::class, 'modules', [
            'acme/root' => ['entries' => ['main' => ['link' => 'composer.json']]],
        ]);
        $logged = $this->captureWarnings();

        $this->assertSame([], ClientRegistry::singleton()->getImports());
        $this->assertTrue($logged->hasWarningThatContains('add its folder to extra.expose'));
    }

    public function testAModuleFileOutsideTheModulesExposedFoldersIsDropped(): void
    {
        $link = 'silverstripe/admin:tests/php/Client/ClientRegistryTest/esm.js';
        Config::modify()->set(ClientRegistry::class, 'modules', ['acme/hidden' => ['entries' => ['main' => ['link' => $link]]]]);
        $logged = $this->captureWarnings();

        $this->assertSame([], ClientRegistry::singleton()->getImports());
        $this->assertTrue($logged->hasWarningThatContains('points its script at "' . $link . '", which is outside'));
        $this->assertTrue($logged->hasWarningThatContains('add its folder to extra.expose'));
    }

    public function testMissingFilesAndLinklessEntriesAreDropped(): void
    {
        $missing = 'silverstripe/admin:tests/php/Client/ClientRegistryTest/missing.js';
        Config::modify()->set(ClientRegistry::class, 'modules', [
            'acme/missing' => [
                'imports' => ['@acme/missing-helper' => ClientRegistryTest::FIXTURE],
                'entries' => ['main' => ['link' => $missing]],
            ],
            'acme/module-keys' => [
                'entries' => ['main' => ['link' => ClientRegistryTest::FIXTURE, 'requires' => ['react']]],
            ],
            'acme/missing-library' => ['imports' => ['missing-helper' => $missing]],
            'acme/unknown-module' => ['entries' => ['main' => ['link' => 'nobody/nothing:client/dist/hello.js']]],
            'acme/not-a-module-path' => ['entries' => ['main' => ['link' => 'app:client/dist/hello.js']]],
            'acme/hello' => ['entries' => ['main' => ['link' => ClientRegistryTest::FIXTURE]]],
        ]);
        $logged = $this->captureWarnings();

        $registry = ClientRegistry::singleton();

        $this->assertSame(['acme/hello/main'], array_column($registry->getEntries(), 'name'));
        $this->assertSame(
            ['acme/hello/main', '@acme/missing-helper'],
            array_keys($registry->getImports()),
            'A skipped entry leaves its module\'s imports mapped'
        );
        $this->assertTrue($logged->hasWarningThatContains(
            'Client entry "acme/missing/main" points its script at "' . $missing . '", which does not exist, so the client entry was skipped'
        ));
        $this->assertTrue($logged->hasWarningThatContains(
            'Client entry "acme/module-keys/main" sets requires, which belongs to its module "acme/module-keys"; the entry was left out'
        ), 'An entry takes no module-level key');
        $this->assertTrue(
            $logged->hasWarningThatContains('Library package "acme/missing-library" points its import "missing-helper" at'),
            'A library package is named as one'
        );
    }

    public function testAnUpperCaseSchemeLinkStaysOffSite(): void
    {
        Config::modify()->set(ClientRegistry::class, 'modules', [
            'acme/one' => ['entries' => ['main' => ['link' => 'HTTPS://cdn.example.test/one.js']]],
        ]);

        $this->assertSame(['acme/one/main' => 'https://cdn.example.test/one.js'], ClientRegistry::singleton()->getImports());
    }

    public function testLinksThatLeaveTheProjectAreDropped(): void
    {
        Config::modify()->set(ClientRegistry::class, 'modules', [
            'acme/up' => ['entries' => ['main' => ['link' => '../../etc/hostname']]],
            'acme/module-up' => ['entries' => ['main' => ['link' => 'silverstripe/admin:../../../.env']]],
            'acme/hello' => [
                'imports' => ['helper' => '../../etc/hostname'],
                'entries' => ['main' => [
                    'link' => ClientRegistryTest::FIXTURE,
                    'css' => 'silverstripe/admin:../../../.env',
                ]],
            ],
        ]);
        $logged = $this->captureWarnings();

        $registry = ClientRegistry::singleton();

        $this->assertSame(['acme/hello/main'], array_column($registry->getEntries(), 'name'));
        $this->assertSame(['acme/hello/main'], array_keys($registry->getImports()));
        $this->assertSame([], $registry->getStylesheets());
        $this->assertTrue(
            $logged->hasWarningThatContains('Client entry "acme/hello/main" points its stylesheet at "silverstripe/admin:../../../.env", which cannot be resolved'),
            'The dropped stylesheet is logged'
        );
        $this->assertTrue(
            $logged->hasWarningThatContains('Client entry "acme/up/main" points its script at "../../etc/hostname", which cannot be resolved (Can not collapse relative folders)'),
            'The .. segment, not a missing file, drops it'
        );
    }

    public function testALinkClearedByLaterConfigDropsTheWholeEntry(): void
    {
        Config::modify()->set(ClientRegistry::class, 'modules', [
            'acme/dates' => ['entries' => ['main' => ['link' => null, 'css' => 'https://cdn.example.test/dates.css']]],
            'acme/list' => ['entries' => ['main' => ['link' => ['not', 'a', 'link']]]],
        ]);
        $logged = $this->captureWarnings();

        $registry = ClientRegistry::singleton();

        $this->assertSame([], $registry->getEntries());
        $this->assertSame([], $registry->getStylesheets());
        $this->assertTrue($logged->hasWarningThatContains('Entry "acme/dates/main" has an empty link'), 'The dropped entry is logged');
        $this->assertTrue($logged->hasWarningThatContains('Entry "acme/list/main" has an empty link'), 'A non-scalar link counts as none');
    }

    public function testAnUpdateEntriesItemWithAnUnmappedOrListedNameOrNoModuleIsDropped(): void
    {
        Config::modify()->set(ClientRegistry::class, 'modules', [
            'acme/hello' => ['entries' => ['main' => ['link' => ClientRegistryTest::FIXTURE]], 'imports' => ['dayjs' => ClientRegistryTest::FIXTURE]],
        ]);
        ClientRegistry::add_extension(UpdateEntriesExtension::class);
        $logged = $this->captureWarnings();

        $items = ClientRegistry::singleton()->getEntries();

        $this->assertSame([['name' => 'acme/hello/main', 'module' => 'acme/hello']], $items);
        $this->assertTrue($logged->hasWarningThatContains('an item names "acme/stray/main", which no client entry adds'));
        $this->assertTrue($logged->hasWarningThatContains('an item names "dayjs", which no client entry adds'), 'A library is in the map but is not an entry');
        $this->assertTrue($logged->hasWarningThatContains('the item named "acme/hello/main" is listed more than once'));
        $this->assertTrue($logged->hasWarningThatContains('the item named "acme/hello/main" gives a value of type null for its module'));
    }

    public function testADevURLThatIsNotHttpOrNamesAnUnknownEntryIsRefused(): void
    {
        $name = ClientRegistryTest::INSTALLED . '/hello';
        $this->configureDevOverride(
            $name . '=javascript:alert(1),' . $name . '=/local/index.js,' . $name . '=//cdn.example.test/index.js,'
            . $name . '=ftp://x.test/a.js,acme/nobody/main=http://localhost:8080/index.js,'
        );

        [$imports, $warnings] = $this->inDev(fn () => ClientRegistry::singleton()->getImports());

        $this->assertStringContainsString('client/dist/js/i18n.js', $imports[$name]);
        $this->assertCount(5, $warnings);
        $this->assertStringContainsString('names "acme/nobody/main"', $warnings[4]);
    }

    public function testDevURLsAreIgnoredOutsideDev(): void
    {
        $this->configureDevOverride(ClientRegistryTest::INSTALLED . '/hello=http://localhost:8080/index.js');
        $logged = $this->captureWarnings();

        $imports = ClientRegistry::singleton()->getImports();

        $this->assertStringContainsString('client/dist/js/i18n.js', $imports[ClientRegistryTest::INSTALLED . '/hello']);
        $this->assertTrue($logged->hasWarningThatContains('SS_ADMIN_ENTRY_DEV_URLS is set outside dev'));
    }

    public function testTwoModulesAddingOneSpecifierDropItFromBothWithALoggedErrorOutsideDev(): void
    {
        $this->configureTwoProviders();
        $logged = $this->captureWarnings();

        $registry = ClientRegistry::singleton();

        $this->assertSame(['silverstripe/dates/main', 'silverstripe/calendar/main'], array_column($registry->getEntries(), 'name'));
        $this->assertSame(['silverstripe/dates/main', 'silverstripe/calendar/main'], array_keys($registry->getImports()));
        $this->assertCount(1, $logged->getRecords(), 'Logged once, though both the list and the map read the config');
        $this->assertTrue($logged->hasErrorThatContains('and module "silverstripe/calendar" add "@silverstripe/dayjs"'));
    }

    private function configureTwoProviders(): void
    {
        $module = [
            'imports' => ['@silverstripe/dayjs' => ClientRegistryTest::FIXTURE],
            'entries' => ['main' => ['link' => ClientRegistryTest::FIXTURE]],
        ];
        Config::modify()->set(ClientRegistry::class, 'modules', [
            'silverstripe/dates' => $module,
            'silverstripe/calendar' => $module,
        ]);
    }

    public function testAnImportClaimingASharedSpecifierOrAnEntryNameIsADuplicate(): void
    {
        Config::modify()->set(ClientRegistry::class, 'modules', [
            'silverstripe/dates' => [
                'imports' => ['@silverstripe/admin' => ClientRegistryTest::FIXTURE, '@silverstripe/dayjs' => ClientRegistryTest::FIXTURE],
                'entries' => ['main' => ['link' => ClientRegistryTest::FIXTURE]],
            ],
        ]);

        $thrown = '';
        $this->kernel()->setEnvironment(Kernel::DEV);
        try {
            ClientRegistry::create()->getEntries();
        } catch (RuntimeException $exception) {
            $thrown = $exception->getMessage();
        } finally {
            $this->kernel()->setEnvironment(Kernel::TEST);
        }
        $this->assertStringContainsString('The loader build\'s shared files and module "silverstripe/dates" add "@silverstripe/admin"', $thrown, 'An import named like a shared file throws in dev');

        $logged = $this->captureWarnings();
        $registry = ClientRegistry::create();

        $this->assertSame(['silverstripe/dates/main'], array_column($registry->getEntries(), 'name'));
        $this->assertSame(['silverstripe/dates/main', '@silverstripe/dayjs'], array_keys($registry->getImports()));
        $this->assertTrue($logged->hasErrorThatContains('module "silverstripe/dates" add "@silverstripe/admin"'));

        Config::modify()->set(ClientRegistry::class, 'modules', [
            'acme/dates' => ['entries' => ['main' => ['link' => ClientRegistryTest::FIXTURE]]],
            'acme/lib' => ['imports' => ['acme/dates/main' => ClientRegistryTest::FIXTURE]],
        ]);
        $logged = $this->captureWarnings();
        $registry = ClientRegistry::create();

        $this->assertSame([], $registry->getEntries(), 'The entry is dropped, and so is the import');
        $this->assertSame([], $registry->getImports());
        $this->assertTrue($logged->hasErrorThatContains('Client entry "acme/dates/main" and library package "acme/lib" add "acme/dates/main"'));
    }

    public function testABrokenNameOrSpecifierRuleDropsTheModuleEntryOrSpecifierWithAWarningInDevWithoutThrowing(): void
    {
        $refused = [
            'specifier is a path' => $this->refusedFor('silverstripe/dates', 'main', './dayjs.js'),
            'specifier is a URL' => $this->refusedFor('silverstripe/dates', 'main', 'https://evil.test/x'),
            'specifier ends with a slash' => $this->refusedFor('silverstripe/dates', 'main', '@silverstripe/dayjs/'),
            'module is a URL' => $this->refusedFor('https://evil.test/x', 'main'),
            'module takes a scope' => $this->refusedFor('@silverstripe/whatever', 'main'),
            'module ends with a slash' => $this->refusedFor('silverstripe/', 'main'),
            'module has two slashes' => $this->refusedFor('silverstripe/dates/extra', 'main'),
            'module has a byte that is not UTF-8' => $this->refusedFor("acme/bad\xB1byte", 'main'),
            'specifier has a byte that is not UTF-8' => $this->refusedFor('silverstripe/dates', 'main', "day\xB1js"),
            'entry key has a slash' => $this->refusedFor('silverstripe/dates', 'main/extra'),
            'entry key ends with a newline' => $this->refusedFor('silverstripe/dates', "main\n"),
            'entry key starts with a dot' => $this->refusedFor('silverstripe/dates', '.main'),
        ];

        $this->assertSame([], array_keys(array_filter($refused, fn (bool $dropped) => !$dropped)));
        $this->assertFalse($this->refusedFor('acme/dates', 'main', 'dayjs'), 'Any module may add any bare specifier');

        Config::modify()->set(ClientRegistry::class, 'modules', ['dates' => ['entries' => ['main' => ['link' => ClientRegistryTest::FIXTURE]]]]);
        [$items, $warnings] = $this->inDev(fn () => ClientRegistry::create()->getEntries());
        $this->assertSame(
            [[], ['Module "dates" is not vendor/name: a module is named after its Composer package, one vendor and one'
                . ' name; the module was left out']],
            [$items, $warnings]
        );

        Config::modify()->set(ClientRegistry::class, 'modules', [
            ClientRegistryTest::INSTALLED => ['require' => ['x'], 'entries' => ['main' => ['link' => ClientRegistryTest::FIXTURE]]],
        ]);
        [$items, $warnings] = $this->inDev(fn () => ClientRegistry::create()->getEntries());
        $this->assertSame(['silverstripe/admin/main'], array_column($items, 'name'), 'An unknown key is ignored');
        $this->assertSame(
            ['Module "silverstripe/admin" sets require, which the registry does not read; a module takes enabled, imports, requires, entries'],
            $warnings,
            'And named in dev'
        );

        Config::modify()->set(ClientRegistry::class, 'modules', [
            'acme/typo' => ['entries' => ['main' => ['link' => ClientRegistryTest::FIXTURE]]],
        ]);
        [$items, $warnings] = $this->inDev(fn () => ClientRegistry::create()->getEntries());
        $this->assertSame(['acme/typo/main'], array_column($items, 'name'), 'A module naming no package is still listed');
        $this->assertSame(['Module "acme/typo" names no installed Composer package; check the spelling of the key'], $warnings);
    }

    public function testAScalarImportsDropsTheModuleWithAWarning(): void
    {
        Config::modify()->set(ClientRegistry::class, 'modules', [
            'silverstripe/dates' => [
                'imports' => ClientRegistryTest::FIXTURE,
                'entries' => ['main' => ['link' => ClientRegistryTest::FIXTURE]],
            ],
            'silverstripe/dayjs' => ['imports' => ClientRegistryTest::FIXTURE],
        ]);
        $logged = $this->captureWarnings();

        $registry = ClientRegistry::singleton();

        $this->assertSame([], $registry->getEntries());
        $this->assertSame([], $registry->getImports());
        $this->assertTrue($logged->hasWarningThatContains('Module "silverstripe/dates" has imports of type string'));
        $this->assertTrue($logged->hasWarningThatContains('Module "silverstripe/dayjs" has imports of type string'));
    }

    public function testAScalarRequiresDropsTheModuleWithAWarning(): void
    {
        Config::modify()->set(ClientRegistry::class, 'modules', [
            'silverstripe/dates' => [
                'requires' => 'react',
                'entries' => ['main' => ['link' => ClientRegistryTest::FIXTURE]],
            ],
        ]);
        $logged = $this->captureWarnings();

        $this->assertSame([], ClientRegistry::singleton()->getEntries());
        $this->assertTrue($logged->hasWarningThatContains(
            'Module "silverstripe/dates" has requires of type string, but requires is a list of bare specifiers; the module was left out'
        ));
    }

    /**
     * Whether the module, entry or its one specifier is missing from the list or map in dev with a warning logged
     */
    private function refusedFor(string $module, string $entryKey, ?string $specifier = null): bool
    {
        $config = ['entries' => [$entryKey => ['link' => ClientRegistryTest::FIXTURE]]];
        if ($specifier !== null) {
            $config['imports'] = [$specifier => ClientRegistryTest::FIXTURE];
        }
        Config::modify()->set(ClientRegistry::class, 'modules', [$module => $config]);
        [$listed, $warnings] = $this->inDev(function () use ($module, $entryKey, $specifier) {
            $registry = ClientRegistry::create();
            $listed = array_column($registry->getEntries(), 'name') === [$module . '/' . $entryKey];
            return $listed && ($specifier === null || isset($registry->getImports()[$specifier]));
        });
        return !$listed && $warnings !== [];
    }

    private function configureDevOverride(string $value): void
    {
        Config::modify()->set(ClientRegistry::class, 'modules', [
            ClientRegistryTest::INSTALLED => ['entries' => ['hello' => ['link' => ClientRegistryTest::FIXTURE]]],
        ]);
        // GlobalsTestState restores the environment after each test
        Environment::setEnv(ClientRegistry::DEV_URLS_ENV, $value);
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
