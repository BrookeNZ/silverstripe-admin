<?php

namespace SilverStripe\Admin\Tests\Client;

use Composer\InstalledVersions;
use Monolog\Handler\TestHandler;
use Monolog\Logger;
use Psr\Log\LoggerInterface;
use SilverStripe\Admin\Client\ClientRegistry;
use SilverStripe\Admin\Client\ComponentRegistry;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Core\Kernel;
use SilverStripe\Dev\SapphireTest;
use SilverStripe\Forms\FieldGroup;
use SilverStripe\Forms\TextField;

class ComponentRegistryTest extends SapphireTest
{
    protected $usesDatabase = false;

    // A module link must be in a folder the module exposes
    private const string FIXTURE = 'silverstripe/admin:client/dist/js/i18n.js';

    private const string REMOTE = 'https://cdn.example.test/remote.js';

    private string $originalEnvironment = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->originalEnvironment = $this->kernel()->getEnvironment();
        $this->kernel()->setEnvironment(Kernel::TEST);
        Config::modify()->set(ClientRegistry::class, 'modules', []);
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

    public function testItemsCompileToEntriesOfTheirModule(): void
    {
        Config::modify()->set(ComponentRegistry::class, '\\' . TextField::class, [
            'component' => ComponentRegistryTest::FIXTURE,
            'wrap' => ['outer' => ComponentRegistryTest::REMOTE],
        ]);
        $root = InstalledVersions::getRootPackage()['name'];

        $entries = ComponentRegistry::singleton()->getClientEntries();

        $this->assertSame(
            [
                ['silverstripe/admin/component.SilverStripe.Forms.TextField', 'silverstripe/admin', 'component'],
                [$root . '/wrap.SilverStripe.Forms.TextField.outer', $root, 'wrap'],
            ],
            array_map(fn (array $entry) => [$entry['name'], $entry['module'], $entry['kind']], $entries)
        );
        $this->assertSame([TextField::class, TextField::class], array_column($entries, 'class'));
        $this->assertSame(ComponentRegistryTest::REMOTE, $entries[1]['url']);
    }

    public function testNullRemovesAnItemSetUnderTheSameClassWithoutAWarning(): void
    {
        $warnings = new TestHandler();
        Injector::inst()->registerService(new Logger('test', [$warnings]), LoggerInterface::class);
        Config::modify()->set(ComponentRegistry::class, TextField::class, [
            'wrap' => ['kept' => ComponentRegistryTest::REMOTE, 'gone' => ComponentRegistryTest::REMOTE],
        ]);
        Config::modify()->merge(ComponentRegistry::class, TextField::class, ['wrap' => ['gone' => null]]);

        $names = array_column(ComponentRegistry::singleton()->getClientEntries(), 'name');

        $this->assertSame([InstalledVersions::getRootPackage()['name'] . '/wrap.SilverStripe.Forms.TextField.kept'], $names);
        $this->assertSame([], $warnings->getRecords());
    }

    public function testADisabledModuleDropsItsCompiledEntries(): void
    {
        Config::modify()->set(ComponentRegistry::class, FieldGroup::class, [
            'component' => ComponentRegistryTest::FIXTURE,
            'wrap' => ['remote' => ComponentRegistryTest::REMOTE],
        ]);
        Config::modify()->set(ClientRegistry::class, 'modules', ['silverstripe/admin' => ['enabled' => false]]);

        $modules = array_column(ComponentRegistry::singleton()->getClientEntries(), 'module');

        $this->assertSame([InstalledVersions::getRootPackage()['name']], $modules);
    }

    public function testUnknownClassKeyIsWarnedAboutInDev(): void
    {
        $this->kernel()->setEnvironment(Kernel::DEV);
        $warnings = new TestHandler();
        Injector::inst()->registerService(new Logger('test', [$warnings]), LoggerInterface::class);
        Config::modify()->set(ComponentRegistry::class, 'Acme\\Missing\\FancyField', [
            'component' => ComponentRegistryTest::REMOTE,
        ]);

        ComponentRegistry::singleton()->getClientEntries();

        $messages = array_column($warnings->getRecords(), 'message');
        $this->assertCount(1, $messages);
        $this->assertStringContainsString('"Acme\\Missing\\FancyField" names no installed class', $messages[0]);
    }
}
