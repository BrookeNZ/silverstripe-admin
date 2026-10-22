<?php

namespace SilverStripe\Admin\Client;

use Psr\Log\LoggerInterface;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Control\Director;
use SilverStripe\Core\Convert;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Model\List\ArrayList;
use SilverStripe\Model\ModelData;

/**
 * The admin chrome page, which LeftAndMain renders for every page navigation into a section. It inlines everything
 * the loader reads, so the loader makes no request for its config or module list. The section controller is its
 * failover, so the template's `$Title` and `$Locale` are the section's.
 *
 * The loader reads the element ids `ss-admin-modules` and `ss-admin-config` (client/loader/src/clientConfig.ts) and
 * removes a failed module's stylesheet by its `data-module`. Renaming one breaks the loader with no server error.
 *
 * An extension on LeftAndMain that implements `updateChromeNonce` supplies the CSP nonce for every section.
 *
 * @internal
 */
class ChromePage extends ModelData
{
    private static array $casting = [
        'NonceAttribute' => 'HTMLFragment',
    ];

    private LeftAndMain $controller;

    private string $clientConfig;

    /**
     * Null for a member the section refuses
     */
    private ?array $moduleItems;

    private ?string $scriptURL;

    public function __construct(LeftAndMain $controller, string $clientConfig)
    {
        parent::__construct();
        $this->controller = $controller;
        $this->clientConfig = $clientConfig;
        $this->setFailover($controller);
        $this->moduleItems = $controller->canView() ? ModuleRegistry::singleton()->getModuleItems() : null;
        $this->scriptURL = LoaderAssets::singleton()->getScriptURL();
        if ($this->scriptURL === null && Director::isDev()) {
            Injector::inst()->get(LoggerInterface::class)->warning(
                'The client loader is not built: client/dist/loader/ has no main.js; run npm run build in client/loader'
            );
        }
    }

    /**
     * Encoded with JSON_HEX_TAG by LeftAndMain::getCombinedClientConfig(), so it cannot close its block
     */
    public function ClientConfig(): string
    {
        return $this->clientConfig;
    }

    public function ImportMap(): string
    {
        return ChromePage::jsonForScriptBlock(ImportMap::singleton()->getMap(ModuleRegistry::singleton()->getImports()));
    }

    /**
     * The loader always imports `@silverstripe/admin`; the other shared files are preloaded only when a module is
     * listed, since any module may import them
     */
    public function ModulePreloads(): ArrayList
    {
        $moduleURLs = [];
        $imports = ModuleRegistry::singleton()->getImports();
        foreach (array_keys($this->listedNamesBySpecifier($this->moduleItems ?? [])) as $specifier) {
            $moduleURLs[] = $imports[$specifier];
        }
        $sharedImports = ImportMap::singleton()->getSharedImports();
        if (!$moduleURLs) {
            $sharedImports = array_intersect_key($sharedImports, [LoaderAssets::ADMIN_SPECIFIER => true]);
        }
        $urls = [$this->scriptURL, ...array_values($sharedImports), ...$moduleURLs];
        $urls = array_values(array_unique(array_filter($urls, fn (?string $url) => $url !== null)));
        return ArrayList::create(array_map(fn (string $url) => ['URL' => $url], $urls));
    }

    /**
     * A module's stylesheet is linked only when the module is listed, with the module's name in `data-module`
     * so the loader can remove it on failure. Other entries' stylesheets are always linked. Empty for a member the
     * section refuses
     */
    public function ModuleStylesheets(): ArrayList
    {
        $items = $this->moduleItems;
        if ($items === null) {
            return ArrayList::create();
        }
        $listedNames = $this->listedNamesBySpecifier($items);
        $links = [];
        foreach (ModuleRegistry::singleton()->getStylesheets() as $stylesheet) {
            if (!$stylesheet['module']) {
                $links[] = ['IsModule' => false, 'Module' => '', 'URL' => $stylesheet['url']];
                continue;
            }
            $module = $listedNames[$stylesheet['name']] ?? null;
            if ($module !== null) {
                $links[] = ['IsModule' => true, 'Module' => $module, 'URL' => $stylesheet['url']];
            }
        }
        return ArrayList::create($links);
    }

    /**
     * The first item's name by specifier; a registry module's specifier is its name. Mirrors readModuleList()
     * in client/loader/src/loader.ts: the first item of a name wins and a non-string name is skipped
     *
     * @return array<string, string>
     */
    private function listedNamesBySpecifier(array $items): array
    {
        $seen = [];
        $names = [];
        foreach ($items as $item) {
            $name = is_array($item) ? ($item['name'] ?? null) : null;
            if (!is_string($name) || isset($seen[$name])) {
                continue;
            }
            $seen[$name] = true;
            $specifier = (string) ($item['specifier'] ?? '');
            $names[$specifier] ??= $name;
        }
        return $names;
    }

    public function ScriptURL(): ?string
    {
        return $this->scriptURL;
    }

    /**
     * The whole attribute with its leading space, or nothing when no extension supplies a nonce
     */
    public function NonceAttribute(): string
    {
        $nonce = '';
        $this->controller->extend('updateChromeNonce', $nonce);
        $nonce = (string) $nonce;
        return $nonce === '' ? '' : sprintf(' nonce="%s"', Convert::raw2att($nonce));
    }

    public function ModuleList(): string
    {
        return ChromePage::jsonForScriptBlock($this->moduleItems ?? []);
    }

    /**
     * JSON_HEX_TAG keeps a value from closing the `<script>` element the JSON sits in
     */
    private static function jsonForScriptBlock(mixed $value): string
    {
        return json_encode($value, JSON_HEX_TAG | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }
}
