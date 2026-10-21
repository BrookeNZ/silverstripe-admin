<?php

namespace SilverStripe\Admin\Client;

use Closure;
use Psr\Log\LoggerInterface;
use RuntimeException;
use SilverStripe\Control\Director;
use SilverStripe\Core\Injector\Injector;

/**
 * Checks ModuleRegistry's enabled entries before anything is resolved. client/loader/MODULES.md documents the name
 * and specifier rules for module authors; keep the two in step.
 *
 * Each import map specifier has one owner: a shared file, a module's name or an `imports` key. A specifier claimed
 * twice throws in dev. Elsewhere it is dropped from every claiming entry and logged as an error, since no merge order
 * should pick a winner; a shared file keeps its specifier. Any other broken rule drops only the offending entry or
 * specifier with a warning.
 *
 * @internal
 */
class ModuleEntryChecker
{
    /**
     * @var array<string, true>
     */
    private array $sharedSpecifiers;

    /**
     * @var array<string, array>
     */
    private array $libraryPackages = [];

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

    public static function isLibraryPackage(array $entry): bool
    {
        return !array_key_exists('link', $entry) && !empty($entry['imports']);
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

    private static function hasLink(array $entry): bool
    {
        return (string) ($entry['link'] ?? '') !== '';
    }

    /**
     * @param array<string, array> $entries
     * @return array<string, array>
     * @throws RuntimeException in dev, on a specifier claimed twice
     */
    public function checkEntries(array $entries): array
    {
        $this->libraryPackages = array_filter($entries, ModuleEntryChecker::isLibraryPackage(...));
        foreach ($entries as $name => $entry) {
            $problem = $this->entryProblem($name, $entry);
            if ($problem !== null) {
                $this->warn(sprintf('%s; the entry was left out', $problem));
                unset($entries[$name]);
                continue;
            }
            $entries[$name] = $this->dropRefusedImports($name, $entry);
            $entries[$name]['requires'] = $this->checkedRequires($name, $entry['requires'] ?? []);
        }
        $entries = $this->dropDuplicateSpecifiers($entries);
        return $this->dropEmptyLibraryPackages($entries);
    }

    private function entryProblem(string $name, array $entry): ?string
    {
        return $this->importsProblem($name, $entry)
            ?? $this->libraryPackageKeysProblem($name, $entry)
            ?? $this->moduleNameProblem($name, $entry);
    }

    /**
     * A module's name is its import map key: one that is not a bare specifier would remap a URL or a path, a trailing
     * slash would map a whole prefix, and an `@` scope or a single word is kept for shared files and `imports` keys
     */
    private function moduleNameProblem(string $name, array $entry): ?string
    {
        if (isset($this->libraryPackages[$name])) {
            return null;
        }
        if (!ModuleEntryChecker::isBareSpecifier($name)) {
            return sprintf('Module "%s" is named like a URL or a path, but a module name is a bare specifier', $name);
        }
        if (str_starts_with($name, '@') || str_ends_with($name, '/')) {
            return sprintf('Module "%s" has an @ scope or a trailing slash, which a module name cannot have', $name);
        }
        if (substr_count($name, '/') !== 1) {
            return sprintf(
                'Module "%s" is not vendor/name: a module is named after its Composer package, one vendor and one name,'
                    . ' so single words stay free for other owners',
                $name
            );
        }
        return null;
    }

    private function importsProblem(string $name, array $entry): ?string
    {
        $shapeProblem = ModuleEntryChecker::mapShapeProblem($entry['imports'] ?? []);
        if ($shapeProblem === null) {
            return null;
        }
        return sprintf(
            '%s has imports %s, but imports is a map of bare specifier to link',
            ucfirst($this->entryLabel($name)),
            $shapeProblem
        );
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

    private function libraryPackageKeysProblem(string $name, array $entry): ?string
    {
        $refused = isset($this->libraryPackages[$name]) ? array_diff(array_keys($entry), ['imports', 'enabled']) : [];
        return $refused ? sprintf(
            'Library package "%s" sets %s, which only a module with a link takes; a library package sets only imports',
            $name,
            implode(', ', $refused)
        ) : null;
    }

    private function dropRefusedImports(string $name, array $entry): array
    {
        foreach (array_keys((array) ($entry['imports'] ?? [])) as $specifier) {
            $specifier = (string) $specifier;
            $problem = ModuleEntryChecker::specifierProblem($name, $specifier);
            if ($problem !== null) {
                $this->warn(sprintf('%s; the specifier was left out', $problem));
                unset($entry['imports'][$specifier]);
            }
        }
        return $entry;
    }

    /**
     * @return list<string>
     */
    private function checkedRequires(string $name, mixed $requires): array
    {
        $checked = [];
        foreach ((array) $requires as $specifier) {
            if (is_string($specifier) && ModuleEntryChecker::isBareSpecifier($specifier)) {
                $checked[] = $specifier;
                continue;
            }
            $this->warn(sprintf(
                'Module "%s" requires %s, which is not a bare specifier; the requirement was left out',
                $name,
                ModuleEntryChecker::describeValue($specifier)
            ));
        }
        return $checked;
    }

    /**
     * @param array<string, array> $entries
     * @return array<string, list<string>> The names of the entries claiming each specifier
     */
    private function specifierOwners(array $entries): array
    {
        $owners = [];
        foreach ($entries as $name => $entry) {
            if (!isset($this->libraryPackages[$name])) {
                $owners[(string) $name][] = (string) $name;
            }
            foreach (array_keys((array) ($entry['imports'] ?? [])) as $specifier) {
                $owners[(string) $specifier][] = (string) $name;
            }
        }
        return $owners;
    }

    private function dropDuplicateSpecifiers(array $entries): array
    {
        foreach ($this->specifierOwners($entries) as $specifier => $names) {
            $specifier = (string) $specifier;
            $labels = array_map(fn (string $name) => $this->entryLabel($name), $names);
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
            foreach ($names as $name) {
                if ($name === $specifier && !isset($this->libraryPackages[$name])) {
                    unset($entries[$name]);
                    continue;
                }
                unset($entries[$name]['imports'][$specifier]);
            }
        }
        return $entries;
    }

    private function dropEmptyLibraryPackages(array $entries): array
    {
        foreach (array_keys($this->libraryPackages) as $name) {
            if (isset($entries[$name]) && empty($entries[$name]['imports'])) {
                unset($entries[$name]);
            }
        }
        return $entries;
    }

    private function entryLabel(string $name): string
    {
        return sprintf('%s "%s"', isset($this->libraryPackages[$name]) ? 'library package' : 'module', $name);
    }

    private function reportDuplicateSpecifier(string $message): void
    {
        if (Director::isDev()) {
            throw new RuntimeException($message);
        }
        Injector::inst()->get(LoggerInterface::class)->error($message);
    }

    private static function specifierProblem(string $name, string $specifier): ?string
    {
        if (!ModuleEntryChecker::isBareSpecifier($specifier)) {
            return sprintf('"%s" adds "%s" to the import map, which is not a bare specifier', $name, $specifier);
        }
        if (str_ends_with($specifier, '/')) {
            return sprintf('"%s" adds "%s" to the import map, but a trailing slash would map a whole prefix', $name, $specifier);
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
