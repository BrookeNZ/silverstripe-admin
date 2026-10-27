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
 * Reads the `modules` config, keyed by module name, into the loader's module list, the import map entries the
 * modules add and the stylesheets they link. client/loader/MODULES.md documents the config keys and the dev override
 * for module authors; keep the two in step.
 *
 * ModuleEntryChecker checks the entries first. After that, each problem drops only what it concerns and logs a
 * warning, so one module's mistake cannot take the admin down.
 */
class ModuleRegistry
{
    use Injectable;
    use Configurable;
    use Extensible;

    public const string DEV_URLS_ENV = 'SS_ADMIN_MODULE_DEV_URLS';

    private static array $modules = [];

    /**
     * Cached so each problem is logged once
     *
     * @var array<string, array>|null
     */
    private ?array $checkedEntries = null;

    /**
     * @var array<string, array{url: string, css: ?string}>|null
     */
    private ?array $resolvedModules = null;

    /**
     * Set by resolvedModules(), since a module whose link does not resolve adds no imports either
     *
     * @var array<string, string>
     */
    private array $libraries = [];

    /**
     * @var list<array{name: string, url: string, module: bool}>|null
     */
    private ?array $stylesheets = null;

    /**
     * @return list<array{name: string, specifier: string}>
     * @throws RuntimeException in dev, on a specifier claimed twice
     */
    public function getModuleItems(): array
    {
        $items = [];
        foreach (array_keys($this->resolvedModules()) as $name) {
            $items[] = ['name' => $name, 'specifier' => $name];
        }
        $this->extend('updateModuleItems', $items);
        return $this->dropUnmappedItems($items);
    }

    /**
     * @return array<string, string>
     * @throws RuntimeException as getModuleItems() does
     * @internal
     */
    public function getImports(): array
    {
        $modules = $this->resolvedModules();
        return array_map(fn (array $module) => $module['url'], $modules) + $this->libraries;
    }

    /**
     * In config order, with the dev override's stylesheet in place of a module's where it names one
     *
     * @return list<array{name: string, url: string, module: bool}>
     * @throws RuntimeException as getModuleItems() does
     * @internal
     */
    public function getStylesheets(): array
    {
        if ($this->stylesheets !== null) {
            return $this->stylesheets;
        }
        $modules = $this->resolvedModules();
        $this->stylesheets = [];
        foreach ($this->checkedEntries() as $name => $entry) {
            $name = (string) $name;
            $isModule = ModuleEntryChecker::isModule($entry);
            $url = $isModule ? ($modules[$name]['css'] ?? null) : $this->resolveStylesheet($name, $entry);
            if ($url !== null) {
                $this->stylesheets[] = ['name' => $name, 'url' => $url, 'module' => $isModule];
            }
        }
        return $this->stylesheets;
    }

    private function dropUnmappedItems(array $items): array
    {
        $imports = $this->getImports();
        $mapped = [];
        foreach ($items as $item) {
            $specifier = is_array($item) ? ($item['specifier'] ?? null) : null;
            if (is_string($specifier) && isset($imports[$specifier])) {
                $mapped[] = $item;
                continue;
            }
            $this->warn(sprintf(
                'After updateModuleItems: an item names %s, which no module adds to the import map; the item was left out',
                is_scalar($specifier) ? sprintf('the specifier "%s"', $specifier) : 'no specifier'
            ));
        }
        return $mapped;
    }

    /**
     * @return array<string, array>
     */
    private function checkedEntries(): array
    {
        if ($this->checkedEntries !== null) {
            return $this->checkedEntries;
        }
        $configured = $this->config()->get('modules');
        if (!is_array($configured)) {
            $this->warn('The modules config must be an array keyed by module name');
            return $this->checkedEntries = [];
        }
        $enabled = [];
        foreach ($configured as $name => $entry) {
            $name = (string) $name;
            if (!is_array($entry)) {
                $this->warn(sprintf(
                    'Module entry "%s" is of type %s, but an entry is a map of its keys; the entry was left out',
                    $name,
                    get_debug_type($entry)
                ));
                continue;
            }
            if ($this->isEnabled($name, $entry)) {
                $enabled[$name] = $entry;
            }
        }
        $checker = new ModuleEntryChecker($this->getSharedSpecifiers(), $this->warn(...));
        return $this->checkedEntries = $checker->checkEntries($enabled);
    }

    /**
     * @return array<string, array{url: string, css: ?string}>
     */
    private function resolvedModules(): array
    {
        if ($this->resolvedModules !== null) {
            return $this->resolvedModules;
        }
        $entries = $this->checkedEntries();
        $moduleEntries = array_filter($entries, ModuleEntryChecker::isModule(...));
        $devUrls = $this->resolveDevURLs(array_keys($moduleEntries));
        $modules = [];
        foreach ($moduleEntries as $name => $entry) {
            $url = $this->resolveScript($name, $entry);
            if ($url === null) {
                unset($entries[$name]);
                continue;
            }
            $modules[$name] = [
                'url' => $devUrls[$name]['url'] ?? $url,
                'css' => $devUrls[$name]['css'] ?? $this->resolveStylesheet($name, $entry),
            ];
        }
        $this->libraries = $this->libraries($entries);
        $this->warnAboutMissingRequires($entries, $modules);
        return $this->resolvedModules = $modules;
    }

    /**
     * @param array<string, array> $entries
     * @return array<string, string>
     */
    private function libraries(array $entries): array
    {
        $libraries = [];
        foreach ($entries as $name => $entry) {
            $libraries += $this->resolveImports($name, $entry);
        }
        return $libraries;
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
     * @param array<string, array> $entries
     * @param array<string, array> $modules
     */
    private function warnAboutMissingRequires(array $entries, array $modules): void
    {
        if (!Director::isDev()) {
            return;
        }
        $mapped = array_fill_keys($this->getSharedSpecifiers(), true) + $modules + $this->libraries;
        foreach (array_keys($modules) as $name) {
            foreach ($entries[$name]['requires'] as $specifier) {
                if (!isset($mapped[$specifier])) {
                    $this->warn(sprintf(
                        'Module "%s" requires "%s", which nothing adds to the import map, so the import will fail if '
                            . 'the module imports it; install and enable the module or library package that provides it',
                        $name,
                        $specifier
                    ));
                }
            }
        }
    }

    /**
     * @param list<string> $names The module entries' names, the only ones an override may name
     * @return array<string, array{url: string, css: ?string}>
     */
    private function resolveDevURLs(array $names): array
    {
        $value = Environment::getEnv(ModuleRegistry::DEV_URLS_ENV);
        if (!is_string($value) || trim($value) === '') {
            return [];
        }
        if (!Director::isDev()) {
            $this->warn(ModuleRegistry::DEV_URLS_ENV . ' is set outside dev and was ignored');
            return [];
        }
        $overrides = [];
        foreach (explode(',', $value) as $pair) {
            if (trim($pair) === '') {
                continue;
            }
            $override = ModuleRegistry::parseDevURLPair($pair);
            if ($override === null) {
                $this->warn(sprintf(
                    '%s pair "%s" is not name=URL with an optional stylesheet URL, each absolute http(s), and was ignored',
                    ModuleRegistry::DEV_URLS_ENV,
                    trim($pair)
                ));
                continue;
            }
            $name = $override['name'];
            if (!in_array($name, $names, true)) {
                $this->warn(sprintf(
                    '%s names "%s", which no module entry configures, and was ignored',
                    ModuleRegistry::DEV_URLS_ENV,
                    $name
                ));
                continue;
            }
            if (isset($overrides[$name])) {
                $this->warn(sprintf('%s names "%s" more than once; the last pair is used', ModuleRegistry::DEV_URLS_ENV, $name));
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
            if (!ModuleRegistry::isDevURL($url)) {
                return null;
            }
        }
        return ['name' => $name, 'url' => $urls[0], 'css' => $urls[1] ?? null];
    }

    private static function isDevURL(string $url): bool
    {
        return preg_match('#^https?://#i', $url) === 1 && filter_var($url, FILTER_VALIDATE_URL) !== false;
    }

    private function isEnabled(string $name, array $entry): bool
    {
        if (!array_key_exists('enabled', $entry)) {
            return true;
        }
        $value = $entry['enabled'];
        if (is_bool($value)) {
            return $value;
        }
        $this->warn(sprintf(
            '%s "%s" sets enabled to %s, which is not true or false; the entry was left out',
            ucfirst(ModuleEntryChecker::entryType($entry)),
            $name,
            ModuleEntryChecker::describeValue($value)
        ));
        return false;
    }

    private function resolveScript(string $name, array $entry): ?string
    {
        $type = ModuleEntryChecker::entryType($entry);
        return $this->resolveLink($type, $name, $entry['link'] ?? null, 'its script', 'the module was skipped');
    }

    /**
     * A missing or broken `css` drops only the stylesheet, so the module still loads unstyled
     */
    private function resolveStylesheet(string $name, array $entry): ?string
    {
        if (!array_key_exists('css', $entry)) {
            return null;
        }
        $type = ModuleEntryChecker::entryType($entry);
        return $this->resolveLink($type, $name, $entry['css'], 'its stylesheet', 'the stylesheet was dropped');
    }

    /**
     * @return array<string, string> Absolute URLs by specifier
     */
    private function resolveImports(string $name, array $entry): array
    {
        $type = ModuleEntryChecker::entryType($entry);
        $urls = [];
        foreach ($entry['imports'] ?? [] as $specifier => $link) {
            $purpose = sprintf('its import "%s"', $specifier);
            $url = $this->resolveLink($type, $name, $link, $purpose, 'the import was left out');
            if ($url !== null) {
                $urls[(string) $specifier] = $url;
            }
        }
        return $urls;
    }

    /**
     * @param string $type As ModuleEntryChecker::entryType() gives it
     * @param string $purpose What the link is for, such as "its stylesheet"
     * @param string $consequence What dropping the link drops, logged with the reason
     */
    private function resolveLink(string $type, string $name, mixed $link, string $purpose, string $consequence): ?string
    {
        if (!is_string($link) || $link === '') {
            $this->warn(sprintf(
                '%s "%s" gives %s for %s, which is not a link, so %s',
                ucfirst($type),
                $name,
                $link === null || $link === '' ? 'nothing' : ModuleEntryChecker::describeValue($link),
                $purpose,
                $consequence
            ));
            return null;
        }
        $points = sprintf('%s "%s" points %s at "%s"', ucfirst($type), $name, $purpose, $link);
        try {
            if (preg_match('#^(https?:)?/#i', $link)) {
                // Director::absoluteURL() treats an upper-case scheme as a relative path
                return Director::absoluteURL(preg_replace_callback('#^https?:#i', fn (array $scheme) => strtolower($scheme[0]), $link));
            }
            $resource = ModuleResourceLoader::singleton()->resolveResource($link);
            $isModuleResource = $resource instanceof ModuleResource;
            // A non-module link is a path relative to the project root, as the root module addresses its own files
            $exists = $isModuleResource ? $resource->exists() : file_exists(Path::join(Director::baseFolder(), $link));
            if (!$exists) {
                $this->warn(sprintf('%s, which does not exist, so %s', $points, $consequence));
                return null;
            }
            if ($isModuleResource) {
                return Director::absoluteURL($resource->getURL());
            }
            if (!ModuleRegistry::isServed($link)) {
                $this->warn(ModuleRegistry::unservedWarning($points, $consequence));
                return null;
            }
            return Director::absoluteURL(ModuleResourceLoader::singleton()->resolveURL($link));
        } catch (InvalidArgumentException $exception) {
            $this->warn(sprintf('%s, which cannot be resolved (%s), so %s', $points, $exception->getMessage(), $consequence));
            return null;
        }
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
     * Follows SimpleResourceURLGenerator::resolvePublicResource(), which links any other project file into
     * _resources/ without checking that the copy exists
     */
    private static function isServed(string $link): bool
    {
        if (!Director::publicDir()) {
            return true;
        }
        $relative = Path::normalise($link, true);
        return str_starts_with($relative, Director::publicDir() . DIRECTORY_SEPARATOR)
            || file_exists(Path::join(Director::publicFolder(), RESOURCES_DIR, $relative));
    }

    private function warn(string $message): void
    {
        Injector::inst()->get(LoggerInterface::class)->warning($message);
    }
}
