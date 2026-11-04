<?php

namespace SilverStripe\Admin\Client;

use InvalidArgumentException;
use Psr\Log\LoggerInterface;
use RuntimeException;
use SilverStripe\Control\Director;
use SilverStripe\Core\Config\Configurable;
use SilverStripe\Core\Environment;
use SilverStripe\Core\Extensible;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Core\Manifest\ModuleResource;
use SilverStripe\Core\Manifest\ModuleResourceLoader;
use SilverStripe\Core\Path;

/**
 * Reads the `modules` config, keyed by Composer package with client entries nested under each, into the loader's
 * entry list, the import map entries and the stylesheets they link. client/loader/MODULES.md documents the config keys
 * and the dev override for module authors; keep the two in step.
 *
 * A module is a Composer package. A client entry is one JavaScript file a module ships, whose `setup` export the
 * loader calls once. An entry is not a component: its setup may register several components or none. An entry such
 * as elemental's might register its editor, block views and hooks; one for a keyboard shortcut registers nothing and
 * only adds a listener; another might add a page route, a modal or a menu item.
 *
 * ClientEntryChecker checks the config first. After that, each problem drops only what it concerns and logs a
 * warning, so one module's mistake cannot take the admin down.
 */
class ClientRegistry
{
    use Injectable;
    use Configurable;
    use Extensible;

    public const string DEV_URLS_ENV = 'SS_ADMIN_ENTRY_DEV_URLS';

    private static array $modules = [];

    /**
     * Cached so each problem is logged once
     *
     * @var array{modules: array<string, array>, entries: array<string, array>}|null
     */
    private ?array $checked = null;

    /**
     * @var array<string, array{url: string, css: ?string}>|null
     */
    private ?array $resolvedEntries = null;

    /**
     * @var array<string, string>|null
     */
    private ?array $libraries = null;

    /**
     * @var list<array{name: string, url: string, entry: bool}>|null
     */
    private ?array $stylesheets = null;

    /**
     * @return list<array{name: string, module: string}>
     * @throws RuntimeException in dev, on a specifier claimed twice in the import map
     */
    public function getEntries(): array
    {
        $items = [];
        foreach (array_keys($this->resolvedEntries()) as $name) {
            $items[] = ['name' => $name, 'module' => $this->checked()['entries'][$name]['module']];
        }
        $this->extend('updateEntries', $items);
        return $this->dropRefusedItems($items);
    }

    /**
     * @return array<string, string>
     * @throws RuntimeException as getEntries() does
     * @internal
     */
    public function getImports(): array
    {
        $entries = $this->resolvedEntries();
        return array_map(fn (array $entry) => $entry['url'], $entries) + $this->libraries();
    }

    /**
     * In config order, with the dev override's stylesheet in place of an entry's where it names one
     *
     * @return list<array{name: string, url: string, entry: bool}>
     * @throws RuntimeException as getEntries() does
     * @internal
     */
    public function getStylesheets(): array
    {
        if ($this->stylesheets !== null) {
            return $this->stylesheets;
        }
        $resolved = $this->resolvedEntries();
        $this->stylesheets = [];
        foreach ($this->checked()['entries'] as $name => $entry) {
            $name = (string) $name;
            $isEntry = ClientEntryChecker::hasJs($entry);
            $url = $isEntry ? ($resolved[$name]['css'] ?? null) : $this->resolveStylesheet($name, $entry);
            if ($url !== null) {
                $this->stylesheets[] = ['name' => $name, 'url' => $url, 'entry' => $isEntry];
            }
        }
        return $this->stylesheets;
    }

    /**
     * Drops an item whose name is not a mapped entry, whose module is not a string, or whose name is already listed.
     * The loader (client/loader/src/loader.ts) loads the list as written, so nothing refuses such an item after this
     */
    private function dropRefusedItems(array $items): array
    {
        $entries = $this->resolvedEntries();
        $mapped = [];
        $listed = [];
        foreach ($items as $item) {
            $name = is_array($item) ? ($item['name'] ?? null) : null;
            if (!is_string($name) || !isset($entries[$name])) {
                $this->warn(sprintf(
                    'After updateEntries: an item names %s, which no client entry adds to the import map; the item was left out',
                    is_scalar($name) ? sprintf('"%s"', $name) : 'nothing'
                ));
                continue;
            }
            if (!is_string($item['module'] ?? null)) {
                $this->warn(sprintf(
                    'After updateEntries: the item named "%s" gives %s for its module, which is not a module name; the item was left out',
                    $name,
                    ClientEntryChecker::describeValue($item['module'] ?? null)
                ));
                continue;
            }
            if (isset($listed[$name])) {
                $this->warn(sprintf(
                    'After updateEntries: the item named "%s" is listed more than once; the later item was left out',
                    $name
                ));
                continue;
            }
            $mapped[] = $item;
            $listed[$name] = true;
        }
        return $mapped;
    }

    /**
     * @return array{modules: array<string, array>, entries: array<string, array>}
     */
    private function checked(): array
    {
        if ($this->checked !== null) {
            return $this->checked;
        }
        $configured = $this->config()->get('modules');
        if (!is_array($configured)) {
            $this->warn('The modules config must be an array keyed by module name');
            return $this->checked = ['modules' => [], 'entries' => []];
        }
        $checker = new ClientEntryChecker($this->getSharedSpecifiers(), $this->warn(...));
        return $this->checked = $checker->check($configured);
    }

    /**
     * @return array<string, array{url: string, css: ?string}>
     */
    private function resolvedEntries(): array
    {
        if ($this->resolvedEntries !== null) {
            return $this->resolvedEntries;
        }
        $checked = $this->checked();
        $scripts = array_filter($checked['entries'], ClientEntryChecker::hasJs(...));
        $devUrls = $this->resolveDevURLs(array_keys($scripts));
        $resolved = [];
        foreach ($scripts as $name => $entry) {
            $url = $this->resolveScript($name, $entry);
            if ($url === null) {
                continue;
            }
            $resolved[$name] = [
                'url' => $devUrls[$name]['url'] ?? $url,
                'css' => $devUrls[$name]['css'] ?? $this->resolveStylesheet($name, $entry),
            ];
        }
        $this->warnAboutMissingRequires($checked, $resolved);
        return $this->resolvedEntries = $resolved;
    }

    /**
     * Every enabled module's imports, whether or not its entries resolve
     *
     * @return array<string, string>
     */
    private function libraries(): array
    {
        if ($this->libraries !== null) {
            return $this->libraries;
        }
        $libraries = [];
        foreach ($this->checked()['modules'] as $key => $module) {
            $libraries += $this->resolveImports((string) $key, $module);
        }
        return $this->libraries = $libraries;
    }

    /**
     * The fixed list as well as the manifest's, so the duplicate check holds while the loader is unbuilt
     *
     * @return list<string>
     */
    private function getSharedSpecifiers(): array
    {
        $shared = LoaderAssets::singleton()->getManifest()['shared'] ?? null;
        $fromManifest = is_array($shared) ? array_map('strval', array_keys($shared)) : [];
        return array_values(array_unique(array_merge(LoaderAssets::SHARED_SPECIFIERS, $fromManifest)));
    }

    /**
     * @param array{modules: array<string, array>, entries: array<string, array>} $checked
     * @param array<string, array> $resolved
     */
    private function warnAboutMissingRequires(array $checked, array $resolved): void
    {
        if (!Director::isDev()) {
            return;
        }
        $mapped = array_fill_keys($this->getSharedSpecifiers(), true) + $resolved + $this->libraries();
        $listedModules = array_unique(array_map(fn (string $name) => $checked['entries'][$name]['module'], array_keys($resolved)));
        foreach ($listedModules as $key) {
            foreach ($checked['modules'][$key]['requires'] as $specifier) {
                if (!isset($mapped[$specifier])) {
                    $this->warn(sprintf(
                        'Module "%s" requires "%s", which nothing adds to the import map, so the import will fail if '
                            . 'the module imports it; install and enable the module or library package that provides it',
                        $key,
                        $specifier
                    ));
                }
            }
        }
    }

    /**
     * @param list<string> $names The client entries' names, the only ones an override may name
     * @return array<string, array{url: string, css: ?string}>
     */
    private function resolveDevURLs(array $names): array
    {
        $value = Environment::getEnv(ClientRegistry::DEV_URLS_ENV);
        if (!is_string($value) || trim($value) === '') {
            return [];
        }
        if (!Director::isDev()) {
            $this->warn(ClientRegistry::DEV_URLS_ENV . ' is set outside dev and was ignored');
            return [];
        }
        $overrides = [];
        foreach (explode(',', $value) as $pair) {
            if (trim($pair) === '') {
                continue;
            }
            $override = ClientRegistry::parseDevURLPair($pair);
            if ($override === null) {
                $this->warn(sprintf(
                    '%s pair "%s" is not name=URL with an optional stylesheet URL, each absolute http(s), and was ignored',
                    ClientRegistry::DEV_URLS_ENV,
                    trim($pair)
                ));
                continue;
            }
            $name = $override['name'];
            if (!in_array($name, $names, true)) {
                $this->warn(sprintf(
                    '%s names "%s", which no client entry configures, and was ignored',
                    ClientRegistry::DEV_URLS_ENV,
                    $name
                ));
                continue;
            }
            if (isset($overrides[$name])) {
                $this->warn(sprintf('%s names "%s" more than once; the last pair is used', ClientRegistry::DEV_URLS_ENV, $name));
            }
            $overrides[$name] = ['url' => $override['url'], 'css' => $override['css']];
        }
        return $overrides;
    }

    /**
     * Parses one `name=URL [stylesheet URL]` pair; null unless the name is set and every URL is absolute http(s)
     *
     * @return array{name: string, url: string, css: ?string}|null
     */
    private static function parseDevURLPair(string $pair): ?array
    {
        [$name, $urlText] = array_map('trim', explode('=', $pair, 2)) + [1 => ''];
        $urls = preg_split('#\s+#', $urlText, -1, PREG_SPLIT_NO_EMPTY);
        if ($name === '' || count($urls) < 1 || count($urls) > 2) {
            return null;
        }
        foreach ($urls as $url) {
            if (!ClientRegistry::isDevURL($url)) {
                return null;
            }
        }
        return ['name' => $name, 'url' => $urls[0], 'css' => $urls[1] ?? null];
    }

    private static function isDevURL(string $url): bool
    {
        return preg_match('#^https?://#i', $url) === 1 && filter_var($url, FILTER_VALIDATE_URL) !== false;
    }

    private function resolveScript(string $name, array $entry): ?string
    {
        $type = ClientEntryChecker::entryType($entry);
        $js = $entry['js'] ?? null;
        return $this->resolveLink($type, $name, $entry['module'], $js, 'its script', 'the client entry was skipped');
    }

    /**
     * A missing or broken `css` drops only the stylesheet, so the entry still loads unstyled
     */
    private function resolveStylesheet(string $name, array $entry): ?string
    {
        if (!array_key_exists('css', $entry)) {
            return null;
        }
        $type = ClientEntryChecker::entryType($entry);
        $css = $entry['css'];
        return $this->resolveLink($type, $name, $entry['module'], $css, 'its stylesheet', 'the stylesheet was dropped');
    }

    /**
     * @return array<string, string> Absolute URLs by specifier
     */
    private function resolveImports(string $key, array $module): array
    {
        $type = ClientEntryChecker::moduleType($module);
        $urls = [];
        foreach ($module['imports'] as $specifier => $link) {
            $purpose = sprintf('its import "%s"', $specifier);
            $url = $this->resolveLink($type, $key, $key, $link, $purpose, 'the import was left out');
            if ($url !== null) {
                $urls[(string) $specifier] = $url;
            }
        }
        return $urls;
    }

    /**
     * @param string $type As ClientEntryChecker::entryType() or moduleType() gives it
     * @param string $module The package a bare path is relative to
     * @param string $purpose What the link is for, such as "its stylesheet"
     * @param string $consequence What dropping the link drops, logged with the reason
     */
    private function resolveLink(
        string $type,
        string $name,
        string $module,
        mixed $link,
        string $purpose,
        string $consequence
    ): ?string {
        if (!is_string($link) || $link === '') {
            $this->warn(sprintf(
                '%s "%s" gives %s for %s, which is not a link, so %s',
                ucfirst($type),
                $name,
                $link === null || $link === '' ? 'nothing' : ClientEntryChecker::describeValue($link),
                $purpose,
                $consequence
            ));
            return null;
        }
        if (preg_match('#^(https?:)?/#i', $link)) {
            // Director::absoluteURL() treats an upper-case scheme as a relative path
            return Director::absoluteURL(preg_replace_callback('#^https?:#i', fn (array $scheme) => strtolower($scheme[0]), $link));
        }
        $file = ClientRegistry::packagePath($module, $link);
        $points = sprintf('%s "%s" points %s at "%s"', ucfirst($type), $name, $purpose, $file);
        try {
            return $this->resolveFileLink($file, $points, $consequence);
        } catch (InvalidArgumentException $exception) {
            $this->warn(sprintf('%s, which cannot be resolved (%s), so %s', $points, $exception->getMessage(), $consequence));
            return null;
        }
    }

    /**
     * A bare path is the module's own file, so `client/dist/main.js` under `acme/dates` is
     * `acme/dates:client/dist/main.js`, except under the root package, whose folder is the project root
     */
    private static function packagePath(string $module, string $link): string
    {
        $isResource = preg_match('#^ *[^/: ]+/[^/: ]+ *:#', $link) === 1;
        return $isResource || ClientEntryChecker::isRootPackage($module) ? $link : $module . ':' . $link;
    }

    /**
     * A `vendor/package:path` resource, or the project's own path from its root
     *
     * @param string $points The link's owner and purpose, the start of each warning
     * @throws InvalidArgumentException for an unknown module or a path with `..` segments
     */
    private function resolveFileLink(string $link, string $points, string $consequence): ?string
    {
        $resource = ModuleResourceLoader::singleton()->resolveResource($link);
        if ($resource instanceof ModuleResource) {
            $exists = $resource->exists();
            $relativePath = $resource->getRelativePath();
        } else {
            $exists = file_exists(Path::join(Director::baseFolder(), $link));
            $relativePath = $link;
        }
        if (!$exists) {
            $this->warn(sprintf('%s, which does not exist, so %s', $points, $consequence));
            return null;
        }
        if (!ClientRegistry::isServed($relativePath)) {
            $this->warn(ClientRegistry::unservedWarning($points, $consequence));
            return null;
        }
        return Director::absoluteURL(ModuleResourceLoader::singleton()->resolveURL($link));
    }

    private static function unservedWarning(string $points, string $consequence): string
    {
        $publicDir = Director::publicDir();
        return sprintf(
            '%s, which is outside %s/ and has no exposed copy in %s/%s/, so it would not be served and %s; add its '
                . 'folder to extra.expose in the composer.json of the package that holds it, or the root one for '
                . 'project code, and run composer vendor-expose',
            $points,
            $publicDir,
            $publicDir,
            RESOURCES_DIR,
            $consequence
        );
    }

    /**
     * Follows SimpleResourceURLGenerator, which links a module resource or any other project file into _resources/
     * without checking that the copy exists
     *
     * @param string $path Relative to the project root
     */
    private static function isServed(string $path): bool
    {
        if (!Director::publicDir()) {
            return true;
        }
        $relative = Path::normalise($path, true);
        return str_starts_with($relative, Director::publicDir() . DIRECTORY_SEPARATOR)
            || file_exists(Path::join(Director::publicFolder(), RESOURCES_DIR, $relative));
    }

    private function warn(string $message): void
    {
        Injector::inst()->get(LoggerInterface::class)->warning($message);
    }
}
