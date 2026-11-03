<?php

namespace SilverStripe\Admin\Client;

use Composer\InstalledVersions;
use Psr\Log\LoggerInterface;
use SilverStripe\Control\Director;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Core\Injector\Injector;

/**
 * YAML that attaches component files to PHP classes, compiled into client entries of the module that owns each file.
 * The config is keyed by class name; each class takes a `component` link and a `wrap` map of named links, and a null
 * item removes one an earlier config fragment set under the same class. Links take the forms a ClientRegistry entry's
 * `link` takes. client/loader/MODULES.md documents the shape; keep the two in step.
 *
 * An item belongs to the package of a `vendor/package:path` link, otherwise to the project's root package, and is
 * named `<module>/component.<Class.With.Dots>` or `<module>/wrap.<Class.With.Dots>.<item>`. A module that
 * ClientRegistry turns off with `enabled: false` loses its compiled entries too.
 *
 * Nothing lists the compiled entries yet, so none is added to the import map or loaded; they take effect once the
 * admin draws components by class, which a later part adds.
 */
class ComponentRegistry
{
    use Injectable;

    public const string KIND_COMPONENT = 'component';

    public const string KIND_WRAP = 'wrap';

    /**
     * @return list<array{name: string, module: string, url: string, class: string, kind: string}>
     */
    public function getClientEntries(): array
    {
        $entries = [];
        foreach ($this->items() as $class => $item) {
            $dotted = str_replace('\\', '.', $class);
            $entries[] = $this->entry($class, ComponentRegistry::KIND_COMPONENT, $dotted, $item['component']);
            foreach ($item['wrap'] as $name => $link) {
                $entries[] = $this->entry($class, ComponentRegistry::KIND_WRAP, $dotted . '.' . $name, $link);
            }
        }
        return array_values(array_filter($entries));
    }

    /**
     * @return ?array{name: string, module: string, url: string, class: string, kind: string} Null for a removed item,
     * one of a disabled module, or a link that does not resolve
     */
    private function entry(string $class, string $kind, string $suffix, mixed $link): ?array
    {
        if ($link === null) {
            return null;
        }
        $module = $this->moduleOf($link);
        $registry = ClientRegistry::singleton();
        if (!$registry->isModuleEnabled($module)) {
            return null;
        }
        $name = $module . '/' . $kind . '.' . $suffix;
        $url = $registry->resolveItemLink($name, $link);
        if ($url === null) {
            return null;
        }
        return ['name' => $name, 'module' => $module, 'url' => $url, 'class' => $class, 'kind' => $kind];
    }

    private function moduleOf(mixed $link): string
    {
        if (is_string($link) && preg_match('#^([^/:\s]+/[^/:\s]+):#', $link, $matches)) {
            return $matches[1];
        }
        return InstalledVersions::getRootPackage()['name'];
    }

    /**
     * @return array<string, array{component: mixed, wrap: array<string, mixed>}> By class name without a leading backslash
     */
    private function items(): array
    {
        $configured = Config::inst()->get(ComponentRegistry::class);
        if (!is_array($configured)) {
            return [];
        }
        $items = [];
        foreach ($configured as $key => $item) {
            $class = ltrim((string) $key, '\\');
            if (!is_array($item)) {
                continue;
            }
            if (Director::isDev() && !class_exists($class)) {
                $this->warn(sprintf('Component entry "%s" names no installed class, so it never applies', $class));
            }
            $wrap = $item['wrap'] ?? [];
            $items[$class] = [
                'component' => $item['component'] ?? null,
                'wrap' => is_array($wrap) ? $wrap : [],
            ];
        }
        return $items;
    }

    private function warn(string $message): void
    {
        Injector::inst()->get(LoggerInterface::class)->warning($message);
    }
}
