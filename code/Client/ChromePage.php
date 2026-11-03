<?php

namespace SilverStripe\Admin\Client;

use Psr\Log\LoggerInterface;
use SilverStripe\Admin\ClientRegistry;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Control\Director;
use SilverStripe\Core\Convert;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Model\List\ArrayList;
use SilverStripe\Model\ModelData;

/**
 * The admin chrome page, which LeftAndMain renders for every page navigation into a section. It inlines everything
 * the loader reads, so the loader makes no request for its config or entry list. The section controller is its
 * failover, so the template's `$Title` and `$Locale` are the section's.
 *
 * The loader reads the element ids `ss-admin-entries` and `ss-admin-config` (client/loader/src/clientConfig.ts) and
 * removes a failed entry's stylesheet by its `data-entry`. Renaming one breaks the loader with no server error.
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

    private string $clientConfig;

    private string $nonce;

    /**
     * Null for a member the section refuses
     */
    private ?array $entryItems;

    private ?string $scriptURL;

    public function __construct(LeftAndMain $controller, string $clientConfig)
    {
        parent::__construct();
        $this->clientConfig = $clientConfig;
        $this->setFailover($controller);
        $nonce = '';
        $controller->extend('updateChromeNonce', $nonce);
        $this->nonce = (string) $nonce;
        $this->entryItems = $controller->canView() ? ClientRegistry::singleton()->getEntries() : null;
        $this->scriptURL = LoaderAssets::singleton()->getScriptURL();
        if ($this->scriptURL === null && Director::isDev()) {
            Injector::inst()->get(LoggerInterface::class)->warning(
                'The client loader is not built: client/dist/loader/ has no main.js; run npm run build in client/loader'
            );
        }
    }

    /**
     * Encoded by jsonForScriptBlock() in LeftAndMain::getCombinedClientConfig(), so it cannot close its block
     */
    public function ClientConfig(): string
    {
        return $this->clientConfig;
    }

    public function ImportMap(): string
    {
        return ChromePage::jsonForScriptBlock(ImportMap::singleton()->getMap(ClientRegistry::singleton()->getImports()));
    }

    /**
     * The loader always imports `@silverstripe/admin`; the other shared files are preloaded only when an entry is
     * listed, since any entry may import them
     */
    public function ClientEntryPreloads(): ArrayList
    {
        $entryURLs = [];
        $imports = ClientRegistry::singleton()->getImports();
        foreach ($this->listedNames($this->entryItems ?? []) as $name) {
            $entryURLs[] = $imports[$name];
        }
        $sharedImports = ImportMap::singleton()->getSharedImports();
        if (!$entryURLs) {
            $sharedImports = array_intersect_key($sharedImports, [LoaderAssets::ADMIN_SPECIFIER => true]);
        }
        $urls = [$this->scriptURL, ...array_values($sharedImports), ...$entryURLs];
        $urls = array_values(array_unique(array_filter($urls, fn (?string $url) => $url !== null)));
        return ArrayList::create(array_map(fn (string $url) => ['URL' => $url], $urls));
    }

    /**
     * A client entry's stylesheet is linked only when the entry is listed, with the entry's name in `data-entry`
     * so the loader can remove it on failure. A stylesheet entry's is always linked. Empty for a member the
     * section refuses
     */
    public function ClientEntryStylesheets(): ArrayList
    {
        $items = $this->entryItems;
        if ($items === null) {
            return ArrayList::create();
        }
        $listedNames = $this->listedNames($items);
        $links = [];
        foreach (ClientRegistry::singleton()->getStylesheets() as $stylesheet) {
            if (!$stylesheet['entry']) {
                $links[] = ['IsEntry' => false, 'Entry' => '', 'URL' => $stylesheet['url']];
                continue;
            }
            if (in_array($stylesheet['name'], $listedNames, true)) {
                $links[] = ['IsEntry' => true, 'Entry' => $stylesheet['name'], 'URL' => $stylesheet['url']];
            }
        }
        return ArrayList::create($links);
    }

    /**
     * The names of the items the loader keeps, which getEntries() keeps unique. Skips what readEntryList() in
     * client/loader/src/loader.ts skips: a later item of a name, a non-string name and a non-string module
     *
     * @return list<string>
     */
    private function listedNames(array $items): array
    {
        $names = [];
        foreach ($items as $item) {
            $name = is_array($item) ? ($item['name'] ?? null) : null;
            if (is_string($name) && is_string($item['module'] ?? null) && !in_array($name, $names, true)) {
                $names[] = $name;
            }
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
        return $this->nonce === '' ? '' : sprintf(' nonce="%s"', Convert::raw2att($this->nonce));
    }

    public function ClientEntryList(): string
    {
        return ChromePage::jsonForScriptBlock($this->entryItems ?? []);
    }

    /**
     * JSON_HEX_TAG keeps a value from closing the `<script>` element the JSON sits in, and JSON_INVALID_UTF8_SUBSTITUTE
     * keeps a bad byte from failing the page
     */
    public static function jsonForScriptBlock(mixed $value): string
    {
        return json_encode(
            $value,
            JSON_INVALID_UTF8_SUBSTITUTE | JSON_HEX_TAG | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
        );
    }
}
