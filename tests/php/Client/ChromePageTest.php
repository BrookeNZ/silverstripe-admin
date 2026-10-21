<?php

namespace SilverStripe\Admin\Tests\Client;

use ReflectionMethod;
use SilverStripe\Admin\Client\LoaderAssets;
use SilverStripe\Admin\Client\ModuleRegistry;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\Client\ChromePageTest\NonceExtension;
use SilverStripe\Admin\Tests\Client\ChromePageTest\SectionController;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\SudoMode\SudoModeServiceInterface;

class ChromePageTest extends FunctionalTest
{
    // One slash, as the name rule requires; the tags still prove nothing can close a script block
    private const string NAME = 'acme/<script>alert(1)<!--';

    private const string SECTION = 'admin/chrome-test-section/';

    protected static $required_extensions = [
        LeftAndMain::class => [NonceExtension::class],
    ];

    protected static $extra_controllers = [
        SectionController::class,
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(ModuleRegistry::class, 'modules', [
            ChromePageTest::NAME => ['link' => 'https://cdn.example.test/hello.js'],
        ]);
        $this->logInWithPermission('ADMIN');
    }

    public function testANavigationGetsTheChromePageWithTheMapModulesAndConfig(): void
    {
        $body = $this->sectionNavigation();

        $this->assertMatchesRegularExpression(
            '#<html lang="[a-z]{2}-[A-Z]{2}">.*<title>[^<]*' . SectionController::MENU_TITLE . '</title>#s',
            $body,
            'The section is the failover'
        );
        $nonce = 'nonce="' . NonceExtension::NONCE . '"';
        $this->assertStringContainsString('<script type="importmap" ' . $nonce . '>', $body);
        $map = json_decode($this->scriptBlock($body, 'type="importmap"'), true, 512, JSON_THROW_ON_ERROR);
        $this->assertArrayHasKey('react', $map['imports']);
        $this->assertSame('https://cdn.example.test/hello.js', $map['imports'][ChromePageTest::NAME]);
        $preloads = $this->modulePreloads($body);
        $this->assertStringContainsString('client/dist/loader/main.js', $preloads[0]);
        $shared = array_map(fn (string $specifier) => $map['imports'][$specifier], LoaderAssets::SHARED_SPECIFIERS);
        $this->assertSame([$preloads[0], ...$shared, 'https://cdn.example.test/hello.js'], $preloads, 'The loader, the shared files, then the module');
        $this->assertStringContainsString('?v=', $preloads[1]);
        $this->assertStringContainsString('<script type="module" ' . $nonce . ' src="' . $preloads[0] . '"></script>', $body);

        $modules = json_decode($this->scriptBlock($body, 'id="ss-admin-modules"'), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame(
            [['name' => ChromePageTest::NAME, 'specifier' => ChromePageTest::NAME]],
            $modules,
            'A value cannot close its block'
        );
        $config = json_decode($this->scriptBlock($body, 'id="ss-admin-config"'), true, 512, JSON_THROW_ON_ERROR);
        $this->assertArrayHasKey('sections', $config);

        $this->assertStringNotContainsString('window.ss.config', $body);
        $this->assertStringNotContainsString('<script type="text/javascript"', $body);

        Config::modify()->set(ModuleRegistry::class, 'modules', []);
        $this->assertSame(
            [$preloads[0], $map['imports'][LoaderAssets::ADMIN_SPECIFIER]],
            $this->modulePreloads($this->sectionNavigation()),
            'With no module, only the loader and the file it imports'
        );
    }

    public function testAHeaderSetDuringInitStaysOnTheChromePage(): void
    {
        $response = $this->get(ChromePageTest::SECTION, null, ['Accept' => 'text/html']);

        $this->assertStringContainsString('type="importmap"', $response->getBody());
        $this->assertSame(NonceExtension::POLICY, $response->getHeader('Content-Security-Policy'));
    }

    public function testAClientRouteNamedLikeAnActionTheFrameworkRefusesGetsTheChromePage(): void
    {
        foreach ([ChromePageTest::SECTION . 'run', ChromePageTest::SECTION . 'doinit'] as $url) {
            $response = $this->get($url, null, ['Accept' => 'text/html']);
            $this->assertSame(200, $response->getStatusCode(), $url);
            $this->assertStringContainsString('type="importmap"', $response->getBody(), $url);
        }
    }

    public function testInvalidUTF8InTheClientConfigIsSubstituted(): void
    {
        Config::modify()->set(LeftAndMain::class, 'client_debugging', "bad \xB1 byte</script>");

        $config = json_decode($this->scriptBlock($this->sectionNavigation(), 'id="ss-admin-config"'), true, 512, JSON_THROW_ON_ERROR);

        $this->assertSame("bad \u{FFFD} byte</script>", $config['debugging'], 'Substituted, and unable to close its block');
    }

    public function testADataRequestToASectionURLReachesItsLegacyAction(): void
    {
        $legacy = $this->get(ChromePageTest::SECTION, null, ['Accept' => '*/*']);
        $page = $legacy->getBody();
        $chrome = $this->get(ChromePageTest::SECTION, null, ['Accept' => 'text/html']);
        $vary = 'X-Requested-With, Accept, Sec-Fetch-Dest, Sec-Fetch-Mode, X-Pjax, X-Formschema-Request';
        $this->assertSame([true, true], array_map(fn ($response) => str_contains((string) $response->getHeader('Vary'), $vary), [$legacy, $chrome]));
        $this->assertStringNotContainsString('type="importmap"', $page);
        $this->assertStringContainsString('window.ss.config', $page);

        $pjax = $this->get(ChromePageTest::SECTION, null, ['X-Requested-With' => 'XMLHttpRequest', 'X-Pjax' => 'CurrentForm']);
        $this->assertArrayHasKey('CurrentForm', json_decode($pjax->getBody(), true, 512, JSON_THROW_ON_ERROR));

        $json = $this->get(ChromePageTest::SECTION, null, ['Accept' => 'application/json, text/html;q=0.1']);
        $this->assertStringNotContainsString('type="importmap"', $json->getBody());
    }

    public function testAPrintViewOrAnExportNavigationReachesItsServerAction(): void
    {
        // Without sudo mode the grid is read-only and has no print or export button
        Injector::inst()->get(SudoModeServiceInterface::class)->activate($this->session());
        $grid = 'admin/security/users/EditForm/field/users/';
        $print = $this->get($grid . 'print', null, ['Accept' => 'text/html']);
        $export = $this->get($grid . 'export', null, ['Accept' => 'text/html']);

        $this->assertStringNotContainsString('type="importmap"', $print->getBody());
        $this->assertStringContainsString('<table', $print->getBody());
        $this->assertStringContainsString('text/csv', (string) $export->getHeader('Content-Type'));
        // Not a request: LeftAndMain::printable() fails in core, as Form::setActions() does not take null
        $isNavigation = new ReflectionMethod(LeftAndMain::class, 'isChromeNavigation');
        $navigation = function (string $url) use ($isNavigation): bool {
            $request = new HTTPRequest('GET', $url);
            $request->addHeader('Accept', 'text/html');
            return $isNavigation->invoke(SectionController::singleton(), $request);
        };
        $this->assertFalse($navigation(ChromePageTest::SECTION . 'printable/5'), 'A trailing record ID is skipped');
        $this->assertTrue($navigation(ChromePageTest::SECTION . 'edit/show/5'));
    }

    private function sectionNavigation(): string
    {
        $response = $this->get(ChromePageTest::SECTION, null, ['Accept' => 'text/html']);
        $this->assertSame(200, $response->getStatusCode());
        return $response->getBody();
    }

    /**
     * @return list<string>
     */
    private function modulePreloads(string $body): array
    {
        $nonce = 'nonce="' . NonceExtension::NONCE . '"';
        preg_match_all('#<link rel="modulepreload" ' . preg_quote($nonce, '#') . ' href="([^"]*)"#', $body, $preloads);
        return $preloads[1];
    }

    private function scriptBlock(string $body, string $attribute): string
    {
        $this->assertSame(1, preg_match('#<script[^>]*' . preg_quote($attribute, '#') . '[^>]*>(.*?)</script>#s', $body, $matches), $attribute);
        return $matches[1];
    }
}
