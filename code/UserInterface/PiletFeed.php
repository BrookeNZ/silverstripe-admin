<?php

namespace SilverStripe\Admin\UserInterface;

use InvalidArgumentException;
use Psr\Log\LoggerInterface;
use SilverStripe\Control\Director;
use SilverStripe\Core\Config\Configurable;
use SilverStripe\Core\Extensible;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Core\Manifest\ModuleResource;
use SilverStripe\Core\Manifest\ModuleResourceLoader;
use SilverStripe\Core\Path;
use stdClass;

/**
 * Lists the pilets (pre-built micro-frontend bundles) the Piral admin shell loads at runtime.
 *
 * A module registers itself through the `pilets` config, keyed by pilet name, with a `version` and a
 * `link` of the form `vendor/module:client/dist/pilet/index.js`, a path relative to the project root for
 * the root module's own files, or a URL. The built file's first line carries the
 * header piral-cli writes, `//@pilet v:2(<requireRef>,<dependencies>)`, which supplies `spec`,
 * `requireRef` and `dependencies` unless the config sets them. Each item follows the Piral feed service
 * metadata shape, which is what the shell's requestPilets callback expects.
 */
class PiletFeed
{
    use Injectable;
    use Configurable;
    use Extensible;

    private static array $pilets = [];

    public function getItems(): array
    {
        $items = [];
        $pilets = $this->config()->get('pilets');
        if (!is_array($pilets)) {
            $this->warn('The pilets config must be an array keyed by pilet name');
            return [];
        }
        foreach ($pilets as $name => $definition) {
            $item = $this->buildItem((string) $name, (array) $definition);
            if ($item) {
                $items[] = $item;
            }
        }
        $this->extend('updatePilets', $items);
        return $items;
    }

    protected function buildItem(string $name, array $definition): ?array
    {
        $link = (string) ($definition['link'] ?? '');
        if ($link === '') {
            $this->warn(sprintf("Pilet '%s' has no link and was skipped", $name));
            return null;
        }

        try {
            [$link, $header] = $this->resolveLink($name, $link);
        } catch (InvalidArgumentException $exception) {
            $this->warn(sprintf("Pilet '%s' was skipped: %s", $name, $exception->getMessage()));
            return null;
        }
        if ($link === null) {
            return null;
        }

        $link = Director::absoluteURL($link);
        $dependencies = $this->absoluteDependencies($definition['dependencies'] ?? $header['dependencies'] ?? [], $link);

        return [
            'name' => $name,
            'version' => (string) ($definition['version'] ?? '0.0.0'),
            'link' => $link,
            'spec' => $definition['spec'] ?? $header['spec'] ?? 'v2',
            'requireRef' => $definition['requireRef'] ?? $header['requireRef'] ?? null,
            'dependencies' => $dependencies ?: new stdClass(),
            'custom' => $definition['custom'] ?? new stdClass(),
        ];
    }

    /**
     * Turns a configured link into a URL plus any build header, or [null, []] when the file is missing.
     * Path helpers throw InvalidArgumentException on `..` segments; the caller skips the entry
     */
    protected function resolveLink(string $name, string $link): array
    {
        $resource = ModuleResourceLoader::singleton()->resolveResource($link);
        if ($resource instanceof ModuleResource) {
            if (!$resource->exists()) {
                $this->warn(sprintf("Pilet '%s' points at a missing file (%s) and was skipped", $name, $link));
                return [null, []];
            }
            return [$resource->getURL(), $this->parseHeader($resource->getPath())];
        }
        if (preg_match('#^(https?:)?/#', $link)) {
            return [$link, []];
        }
        // A path relative to the project root, which is how the root module's own files are addressed
        $path = Path::join(Director::baseFolder(), $link);
        if (!file_exists($path)) {
            $this->warn(sprintf("Pilet '%s' points at a missing file (%s) and was skipped", $name, $link));
            return [null, []];
        }
        return [ModuleResourceLoader::singleton()->resolveURL($link), $this->parseHeader($path)];
    }

    /**
     * The build header names side bundles relative to the pilet file; SystemJS would resolve them against
     * the page, so they are made absolute against the pilet link here
     */
    protected function absoluteDependencies(array $dependencies, string $link): array
    {
        $base = preg_replace('#[^/]*(\?.*)?$#', '', $link);
        foreach ($dependencies as $name => $url) {
            if (is_string($url) && !preg_match('#^(https?:)?/#', $url)) {
                $dependencies[$name] = $base . $url;
            }
        }
        return $dependencies;
    }

    /**
     * Reads the `//@pilet v:N(requireRef,dependencies)` header piral-cli puts on the first line of a build
     */
    protected function parseHeader(string $path): array
    {
        $handle = fopen($path, 'r');
        if (!$handle) {
            return [];
        }
        $firstLine = trim((string) fgets($handle));
        fclose($handle);

        if (!preg_match('#^//@pilet v:(\d)\(([^,)]+)(?:,(.*))?\)$#', $firstLine, $matches)) {
            return [];
        }
        $dependencies = isset($matches[3]) ? json_decode($matches[3], true) : null;

        return [
            'spec' => 'v' . $matches[1],
            'requireRef' => $matches[2],
            'dependencies' => is_array($dependencies) ? $dependencies : [],
        ];
    }

    protected function warn(string $message): void
    {
        Injector::inst()->get(LoggerInterface::class)->warning($message);
    }
}
