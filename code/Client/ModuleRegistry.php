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
 * Lists the client modules the admin's loader imports, from the `modules` config keyed by module name, and the import
 * map entries they add: each module's name at its entry file's URL, and the libraries in each entry's `imports`. The
 * config keys and the dev override are documented for module authors in client/loader/MODULES.md; keep the two in
 * step.
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
     * @var array<string, array{url: string}>|null
     */
    private ?array $resolvedModules = null;

    /**
     * Set by resolvedModules(), since a module whose link does not resolve adds no imports either
     *
     * @var array<string, string>
     */
    private array $libraries = [];

    /**
     * The module list: each enabled module entry whose entry file resolves, never a library package
     *
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
     * Each module entry's URL, the dev override's where it names one, by name
     *
     * @return array<string, array{url: string}>
     */
    private function resolvedModules(): array
    {
        if ($this->resolvedModules !== null) {
            return $this->resolvedModules;
        }
        $entries = $this->checkedEntries();
        $moduleEntries = array_filter($entries, fn (array $entry) => !ModuleEntryChecker::isLibraryPackage($entry));
        $devUrls = $this->resolveDevURLs(array_keys($moduleEntries));
        $modules = [];
        foreach ($moduleEntries as $name => $entry) {
            $url = $this->resolveScript($name, $entry);
            if ($url === null) {
                unset($entries[$name]);
                continue;
            }
            $modules[$name] = ['url' => $devUrls[$name] ?? $url];
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
            $libraries += $this->resolveImports($name, $entry['imports'] ?? []);
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
     * The dev override's entry file URLs keyed by module name, empty outside dev
     *
     * @param list<string> $names The module entries' names, the only ones an override may name
     * @return array<string, string>
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
            [$name, $url] = array_map('trim', explode('=', $pair, 2)) + [1 => ''];
            if ($name === '' || !ModuleRegistry::isDevURL($url)) {
                $this->warn(sprintf(
                    '%s pair "%s" is not name=URL with an absolute http(s) URL, and was ignored',
                    ModuleRegistry::DEV_URLS_ENV,
                    trim($pair)
                ));
                continue;
            }
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
            $overrides[$name] = $url;
        }
        return $overrides;
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
            ModuleEntryChecker::isLibraryPackage($entry) ? 'Library package' : 'Module',
            $name,
            ModuleEntryChecker::describeValue($value)
        ));
        return false;
    }

    private function resolveScript(string $name, array $entry): ?string
    {
        $link = (string) ($entry['link'] ?? '');
        if ($link === '') {
            $this->warn(sprintf('Module "%s" has no link and was skipped', $name));
            return null;
        }
        try {
            return $this->resolveLink($name, $link);
        } catch (InvalidArgumentException $exception) {
            $this->warn(sprintf('Module "%s" was skipped: %s', $name, $exception->getMessage()));
            return null;
        }
    }

    /**
     * @return array<string, string> Absolute URLs by specifier
     */
    private function resolveImports(string $name, array $imports): array
    {
        $urls = [];
        foreach ($imports as $specifier => $link) {
            $leftOut = sprintf('its import "%s" was left out', $specifier);
            if (!is_string($link) || $link === '') {
                $this->warn(sprintf('Module "%s" gives no link for an import, so %s', $name, $leftOut));
                continue;
            }
            try {
                $url = $this->resolveLink($name, $link, $leftOut);
            } catch (InvalidArgumentException $exception) {
                $this->warn(sprintf('Module "%s" import "%s" was left out: %s', $name, $specifier, $exception->getMessage()));
                continue;
            }
            if ($url !== null) {
                $urls[(string) $specifier] = $url;
            }
        }
        return $urls;
    }

    /**
     * @throws InvalidArgumentException for an unknown module or a path with `..` segments
     */
    private function resolveLink(string $name, string $link, string $consequence = 'was skipped'): ?string
    {
        $resource = ModuleResourceLoader::singleton()->resolveResource($link);
        if ($resource instanceof ModuleResource) {
            if (!$resource->exists()) {
                $this->warn(sprintf('Module "%s" points at a missing file (%s) and %s', $name, $link, $consequence));
                return null;
            }
            return Director::absoluteURL($resource->getURL());
        }
        if (preg_match('#^(https?:)?/#i', $link)) {
            // Director::absoluteURL() treats an upper-case scheme as a relative path
            $link = preg_replace_callback('#^https?:#i', fn (array $scheme) => strtolower($scheme[0]), $link);
            return Director::absoluteURL($link);
        }
        // A path relative to the project root, as the root module addresses its own files
        if (!file_exists(Path::join(Director::baseFolder(), $link))) {
            $this->warn(sprintf('Module "%s" points at a missing file (%s) and %s', $name, $link, $consequence));
            return null;
        }
        if (!ModuleRegistry::isServed($link)) {
            $publicDir = Director::publicDir();
            $this->warn(sprintf(
                'Module "%s" points at "%s", which is outside %s/ and has no exposed copy in %s/%s/, so it would not be '
                    . 'served, and %s; add its folder to extra.expose in the composer.json of the package that holds it, '
                    . 'or the root one for project code, and run composer vendor-expose',
                $name,
                $link,
                $publicDir,
                $publicDir,
                RESOURCES_DIR,
                $consequence
            ));
            return null;
        }
        return Director::absoluteURL(ModuleResourceLoader::singleton()->resolveURL($link));
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
