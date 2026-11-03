<?php

namespace SilverStripe\Admin\Client;

use Closure;
use Composer\InstalledVersions;
use Psr\Log\LoggerInterface;
use RuntimeException;
use SilverStripe\Control\Director;
use SilverStripe\Core\Injector\Injector;

/**
 * Checks the enabled modules and client entries of ClientRegistry before anything is resolved.
 * client/loader/MODULES.md documents the key and name rules for module authors; keep the two in step.
 *
 * Each import map specifier has one owner: a shared file, a client entry's name or a module's `imports` key. A
 * specifier claimed twice throws in dev. Elsewhere it is dropped from every claimant and logged as an error, since no
 * merge order should pick a winner; a shared file keeps its specifier. Any other broken rule drops only the offending
 * module, entry or specifier with a warning.
 *
 * @internal
 */
class ClientEntryChecker
{
    public const string CLIENT_ENTRY = 'client entry';

    public const string STYLESHEET_ENTRY = 'stylesheet entry';

    public const string MODULE = 'module';

    public const string LIBRARY_PACKAGE = 'library package';

    private const array MODULE_KEYS = ['enabled', 'imports', 'requires', 'entries'];

    private const array ENTRY_KEYS = ['link', 'css', 'enabled'];

    /**
     * @var array<string, true>
     */
    private array $sharedSpecifiers;

    /**
     * @var Closure(string): void
     */
    private Closure $warn;

    /**
     * @param list<string> $sharedSpecifiers
     * @param Closure(string): void $warn
     */
    public function __construct(array $sharedSpecifiers, Closure $warn)
    {
        $this->sharedSpecifiers = array_fill_keys($sharedSpecifiers, true);
        $this->warn = $warn;
    }

    public static function hasLink(array $entry): bool
    {
        $link = $entry['link'] ?? '';
        return is_scalar($link) && (string) $link !== '';
    }

    /**
     * Lower case, for the middle of a sentence
     */
    public static function entryType(array $entry): string
    {
        return ClientEntryChecker::hasLink($entry) ? ClientEntryChecker::CLIENT_ENTRY : ClientEntryChecker::STYLESHEET_ENTRY;
    }

    /**
     * Lower case, for the middle of a sentence
     */
    public static function moduleType(array $module): string
    {
        return $module['hasEntries'] ? ClientEntryChecker::MODULE : ClientEntryChecker::LIBRARY_PACKAGE;
    }

    /**
     * A config value for a warning: a scalar as JSON, so every value in a message is double-quoted
     */
    public static function describeValue(mixed $value): string
    {
        if (!is_scalar($value)) {
            return 'a value of type ' . get_debug_type($value);
        }
        return (string) json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    }

    /**
     * Modules and entries are in config order: modules as first declared, and within each its entries as first declared
     *
     * @param array<array-key, mixed> $configured
     * @return array{
     *     modules: array<string, array{imports: array<string, string>, requires: list<string>, hasEntries: bool}>,
     *     entries: array<string, array{module: string, link?: string, css?: string}>
     * }
     * @throws RuntimeException in dev, on a specifier claimed twice
     */
    public function check(array $configured): array
    {
        $modules = [];
        $entries = [];
        foreach ($configured as $key => $module) {
            $key = (string) $key;
            if ($module === null) {
                $this->warn(sprintf(
                    'Module "%s" is null; the module was left out. Set enabled: false to turn a module off',
                    $key
                ));
                continue;
            }
            $problem = ClientEntryChecker::moduleProblem($key, $module);
            if ($problem !== null) {
                $this->warn(sprintf('%s; the module was left out', $problem));
                continue;
            }
            if (($module['enabled'] ?? true) === false) {
                continue;
            }
            $checkedEntries = $this->checkedEntries($key, $module['entries'] ?? []);
            $this->warnAboutDevMistakes($key, $module);
            $modules[$key] = [
                'imports' => $this->checkedImports($key, $module['imports'] ?? []),
                'requires' => $this->checkedRequires($key, $module['requires'] ?? []),
                'hasEntries' => !empty($module['entries']),
            ];
            foreach ($checkedEntries as $name => $entry) {
                $entries[$name] = $entry;
            }
        }
        return $this->dropDuplicateSpecifiers($modules, $entries);
    }

    private static function moduleProblem(string $key, mixed $module): ?string
    {
        if (!is_array($module)) {
            return sprintf('Module "%s" is of type %s, but a module is a map of its keys', $key, get_debug_type($module));
        }
        $nameProblem = ClientEntryChecker::moduleNameProblem($key);
        if ($nameProblem !== null) {
            return $nameProblem;
        }
        if (array_key_exists('enabled', $module) && !is_bool($module['enabled'])) {
            return sprintf(
                'Module "%s" sets enabled to %s, which is not true or false',
                $key,
                ClientEntryChecker::describeValue($module['enabled'])
            );
        }
        $imports = ClientEntryChecker::mapShapeProblem($module['imports'] ?? []);
        if ($imports !== null) {
            return sprintf('Module "%s" has imports %s, but imports is a map of bare specifier to link', $key, $imports);
        }
        $requires = ClientEntryChecker::listShapeProblem($module['requires'] ?? []);
        if ($requires !== null) {
            return sprintf('Module "%s" has requires %s, but requires is a list of bare specifiers', $key, $requires);
        }
        $entries = ClientEntryChecker::mapShapeProblem($module['entries'] ?? []);
        if ($entries !== null) {
            return sprintf('Module "%s" has entries %s, but entries is a map of entry key to its keys', $key, $entries);
        }
        return null;
    }

    /**
     * A module is named after its Composer package, so single words stay free for other owners
     */
    private static function moduleNameProblem(string $key): ?string
    {
        if (!ClientEntryChecker::isBareSpecifier($key) || str_contains($key, '@') || substr_count($key, '/') !== 1 || str_ends_with($key, '/')) {
            return sprintf('Module "%s" is not vendor/name: a module is named after its Composer package, one vendor and one name', $key);
        }
        return null;
    }

    /**
     * A numbered key would reach the import map as `0`; a YAML merge of a list into a map leaves one beside the
     * named keys
     */
    private static function mapShapeProblem(mixed $value): ?string
    {
        if (!is_array($value)) {
            return sprintf('of type %s', get_debug_type($value));
        }
        foreach (array_keys($value) as $key) {
            if (is_int($key)) {
                return 'with a numbered key';
            }
        }
        return null;
    }

    private static function listShapeProblem(mixed $value): ?string
    {
        if (!is_array($value)) {
            return sprintf('of type %s', get_debug_type($value));
        }
        foreach (array_keys($value) as $key) {
            if (is_string($key)) {
                return 'with a named key';
            }
        }
        return null;
    }

    /**
     * A key a later admin may add must not break an older one, so an unknown key is ignored and only dev hears about
     * it, which catches a misspelt key. A module key naming no installed package catches a misspelt `enabled: false`
     */
    private function warnAboutDevMistakes(string $key, array $module): void
    {
        if (!Director::isDev()) {
            return;
        }
        $unknown = array_diff(array_keys($module), ClientEntryChecker::MODULE_KEYS);
        if ($unknown) {
            $this->warn(sprintf(
                'Module "%s" sets %s, which the registry does not read; a module takes %s',
                $key,
                implode(', ', $unknown),
                implode(', ', ClientEntryChecker::MODULE_KEYS)
            ));
        }
        if (!ClientEntryChecker::isInstalledPackage($key)) {
            $this->warn(sprintf('Module "%s" names no installed Composer package; check the spelling of the key', $key));
        }
    }

    private static function isInstalledPackage(string $name): bool
    {
        return InstalledVersions::isInstalled($name) || (InstalledVersions::getRootPackage()['name'] ?? null) === $name;
    }

    /**
     * @return array<string, array{module: string, link?: string, css?: string}> By `<module>/<entry>`
     */
    private function checkedEntries(string $module, array $configured): array
    {
        $entries = [];
        foreach ($configured as $key => $entry) {
            $key = (string) $key;
            $name = $module . '/' . $key;
            if ($entry === null) {
                continue;
            }
            $problem = ClientEntryChecker::entryProblem($module, $name, $key, $entry);
            if ($problem !== null) {
                $this->warn(sprintf('%s; the entry was left out', $problem));
                continue;
            }
            if (($entry['enabled'] ?? true) === false) {
                continue;
            }
            $this->warnAboutUnknownEntryKeys($name, $entry);
            $checked = ['module' => $module];
            foreach (['link', 'css'] as $field) {
                if (array_key_exists($field, $entry)) {
                    $checked[$field] = $entry[$field];
                }
            }
            $entries[$name] = $checked;
        }
        return $entries;
    }

    private static function entryProblem(string $module, string $name, string $key, mixed $entry): ?string
    {
        if (!is_array($entry)) {
            return sprintf(
                'Entry "%s" is of type %s, but an entry is a map of its keys',
                $name,
                get_debug_type($entry)
            );
        }
        if (!preg_match('#^[A-Za-z0-9][A-Za-z0-9._-]*$#', $key)) {
            return sprintf(
                'Entry key "%s" of module "%s" is not one segment of letters, digits, ., _ and -, starting with a letter or digit',
                $key,
                $module
            );
        }
        if (array_key_exists('enabled', $entry) && !is_bool($entry['enabled'])) {
            return sprintf(
                '%s "%s" sets enabled to %s, which is not true or false',
                ucfirst(ClientEntryChecker::entryType($entry)),
                $name,
                ClientEntryChecker::describeValue($entry['enabled'])
            );
        }
        foreach (['imports', 'requires'] as $moduleKey) {
            if (array_key_exists($moduleKey, $entry)) {
                return sprintf(
                    '%s "%s" sets %s, which belongs to its module "%s"',
                    ucfirst(ClientEntryChecker::entryType($entry)),
                    $name,
                    $moduleKey,
                    $module
                );
            }
        }
        if (array_key_exists('link', $entry) && !ClientEntryChecker::hasLink($entry)) {
            return sprintf(
                'Entry "%s" has an empty link; leave the key out of a stylesheet entry, and set enabled: false to turn an entry off',
                $name
            );
        }
        if (!array_key_exists('link', $entry) && !array_key_exists('css', $entry)) {
            return sprintf('Entry "%s" sets neither a link nor a css', $name);
        }
        return null;
    }

    private function warnAboutUnknownEntryKeys(string $name, array $entry): void
    {
        if (!Director::isDev()) {
            return;
        }
        $unknown = array_diff(array_keys($entry), ClientEntryChecker::ENTRY_KEYS);
        if ($unknown) {
            $this->warn(sprintf(
                'Entry "%s" sets %s, which the registry does not read; an entry takes %s',
                $name,
                implode(', ', $unknown),
                implode(', ', ClientEntryChecker::ENTRY_KEYS)
            ));
        }
    }

    /**
     * @return array<string, string>
     */
    private function checkedImports(string $module, array $imports): array
    {
        foreach (array_keys($imports) as $specifier) {
            $specifier = (string) $specifier;
            $problem = ClientEntryChecker::specifierProblem($module, $specifier);
            if ($problem !== null) {
                $this->warn(sprintf('%s; the specifier was left out', $problem));
                unset($imports[$specifier]);
            }
        }
        return $imports;
    }

    /**
     * @return list<string>
     */
    private function checkedRequires(string $module, array $requires): array
    {
        $checked = [];
        foreach ($requires as $specifier) {
            if (is_string($specifier) && ClientEntryChecker::isBareSpecifier($specifier)) {
                $checked[] = $specifier;
                continue;
            }
            $this->warn(sprintf(
                'Module "%s" requires %s, which is not a bare specifier; the requirement was left out',
                $module,
                ClientEntryChecker::describeValue($specifier)
            ));
        }
        return $checked;
    }

    /**
     * @param array<string, array> $modules
     * @param array<string, array> $entries
     * @return array{modules: array<string, array>, entries: array<string, array>}
     */
    private function dropDuplicateSpecifiers(array $modules, array $entries): array
    {
        $owners = [];
        foreach ($entries as $name => $entry) {
            if (ClientEntryChecker::hasLink($entry)) {
                $owners[(string) $name][] = ['entry', (string) $name];
            }
        }
        foreach ($modules as $key => $module) {
            foreach (array_keys($module['imports']) as $specifier) {
                $owners[(string) $specifier][] = ['import', (string) $key];
            }
        }
        foreach ($owners as $specifier => $claimants) {
            $specifier = (string) $specifier;
            $labels = array_map(
                fn (array $claimant) => $claimant[0] === 'entry'
                    ? sprintf('%s "%s"', ClientEntryChecker::CLIENT_ENTRY, $claimant[1])
                    : sprintf('%s "%s"', ClientEntryChecker::moduleType($modules[$claimant[1]]), $claimant[1]),
                $claimants
            );
            if (isset($this->sharedSpecifiers[$specifier])) {
                array_unshift($labels, "the loader build's shared files");
            }
            if (count($labels) < 2) {
                continue;
            }
            $this->reportDuplicateSpecifier(sprintf(
                '%s add "%s" to the import map; only one may provide it',
                ucfirst(implode(' and ', $labels)),
                $specifier
            ));
            foreach ($claimants as [$kind, $name]) {
                if ($kind === 'entry') {
                    unset($entries[$name]);
                    continue;
                }
                unset($modules[$name]['imports'][$specifier]);
            }
        }
        return ['modules' => $modules, 'entries' => $entries];
    }

    private function reportDuplicateSpecifier(string $message): void
    {
        if (Director::isDev()) {
            throw new RuntimeException($message);
        }
        Injector::inst()->get(LoggerInterface::class)->error($message);
    }

    private static function specifierProblem(string $module, string $specifier): ?string
    {
        if (!ClientEntryChecker::isBareSpecifier($specifier)) {
            return sprintf('"%s" adds "%s" to the import map, which is not a bare specifier', $module, $specifier);
        }
        if (str_ends_with($specifier, '/')) {
            return sprintf('"%s" adds "%s" to the import map, but a trailing slash would map a whole prefix', $module, $specifier);
        }
        return null;
    }

    /**
     * Refuses whitespace and control characters anywhere, which a browser strips from a map key, and anything a
     * browser reads as a URL or a path rather than a bare specifier
     */
    private static function isBareSpecifier(string $specifier): bool
    {
        return $specifier !== ''
            && !preg_match('#[\x00-\x20\x7f]#', $specifier)
            && !preg_match('#^(\.{0,2}/|[A-Za-z][A-Za-z0-9+.-]*:)#', $specifier);
    }

    private function warn(string $message): void
    {
        ($this->warn)($message);
    }
}
