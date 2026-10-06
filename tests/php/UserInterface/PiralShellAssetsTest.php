<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\UserInterface\PiralShellAssets;
use SilverStripe\Core\Environment;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Core\Kernel;
use SilverStripe\Dev\SapphireTest;
use SilverStripe\View\Requirements;

class PiralShellAssetsTest extends SapphireTest
{
    protected $usesDatabase = false;

    private const DEV_URL = 'http://localhost:1234/shell-dev';

    private string|false $originalDevUrl = false;

    private string $originalEnvironment = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->originalDevUrl = Environment::getEnv(PiralShellAssets::DEV_URL_ENV) ?? false;
        $this->originalEnvironment = $this->kernel()->getEnvironment();
        Requirements::clear();
    }

    protected function tearDown(): void
    {
        Environment::setEnv(PiralShellAssets::DEV_URL_ENV, $this->originalDevUrl);
        $this->kernel()->setEnvironment($this->originalEnvironment);
        Requirements::clear();
        parent::tearDown();
    }

    public function testWithoutTheDevUrlTheReleaseBuildIsRequired(): void
    {
        Environment::setEnv(PiralShellAssets::DEV_URL_ENV, false);
        $this->kernel()->setEnvironment(Kernel::DEV);

        $this->assertNull(PiralShellAssets::singleton()->getDevUrl());
        $this->assertReleaseBuildRequired();
    }

    public function testInDevTheDevServerBundleIsRequiredWithoutAStylesheet(): void
    {
        Environment::setEnv(PiralShellAssets::DEV_URL_ENV, PiralShellAssetsTest::DEV_URL);
        $this->kernel()->setEnvironment(Kernel::DEV);

        $this->assertSame('http://localhost:1234/shell-dev/', PiralShellAssets::singleton()->getDevUrl());
        PiralShellAssets::singleton()->includeRequirements();
        $this->assertSame(
            ['http://localhost:1234/shell-dev/main.js'],
            array_keys(Requirements::backend()->getJavascript())
        );
        $this->assertSame([], Requirements::backend()->getCSS());
    }

    public function testOutsideDevTheDevUrlIsRefused(): void
    {
        Environment::setEnv(PiralShellAssets::DEV_URL_ENV, PiralShellAssetsTest::DEV_URL);

        foreach ([Kernel::TEST, Kernel::LIVE] as $environment) {
            $this->kernel()->setEnvironment($environment);
            $this->assertNull(PiralShellAssets::singleton()->getDevUrl(), $environment);
        }
        $this->assertReleaseBuildRequired();
    }

    public function testARelativeDevUrlIsRefused(): void
    {
        Environment::setEnv(PiralShellAssets::DEV_URL_ENV, '/shell-dev/');
        $this->kernel()->setEnvironment(Kernel::DEV);

        $this->assertNull(PiralShellAssets::singleton()->getDevUrl());
    }

    private function assertReleaseBuildRequired(): void
    {
        PiralShellAssets::singleton()->includeRequirements();
        $javascript = array_keys(Requirements::backend()->getJavascript());
        $css = array_keys(Requirements::backend()->getCSS());
        $this->assertCount(1, $javascript);
        $this->assertStringEndsWith('client/dist/shell/main.js', $javascript[0]);
        $this->assertCount(1, $css);
        $this->assertStringEndsWith('client/dist/shell/main.css', $css[0]);
    }

    private function kernel(): Kernel
    {
        return Injector::inst()->get(Kernel::class);
    }
}
