<?php

namespace SilverStripe\Admin\UserInterface;

use Composer\InstalledVersions;
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
use SilverStripe\Security\Permission;
use SilverStripe\Security\Security;
use stdClass;

/**
 * Lists the pilets (pre-built micro-frontend bundles) the Piral admin shell loads at runtime.
 *
 * A module registers itself through the `pilets` config, keyed by pilet name, with a `link` of the form
 * `vendor/module:client/dist/pilet/index.js`, a path relative to the project root for the root module's own
 * files, or a URL. Each item follows the Piral feed service metadata shape, which is what the shell's
 * requestPilets callback expects. Optional keys on an entry:
 *
 * - `version`: overrides the derived version. Without it a `vendor/module:` link takes the module's Composer
 *   version (a branch install such as `dev-main` becomes `0.0.0-dev-main+<commit>` to stay semver), a file
 *   without a Composer package takes `0.0.0+<first 8 hex of its sha384>`, and a URL takes `0.0.0`.
 * - `integrity`: overrides the `sha384-` digest computed for file links. URL links only carry one if set here.
 *   piral-base 1.12 sets it on the script element for v1 pilets; its v2 SystemJS loader does not use it yet.
 * - `enabled: false`: drops the entry, which is how a later config fragment removes another module's pilet,
 *   since YAML merging cannot unset a key.
 * - `permissions`: a permission code or list of codes; the entry is only listed for a member holding any of them
 *   (as everywhere in the CMS, `CMS_ACCESS_LeftAndMain` passes every `CMS_ACCESS_` code).
 * - `spec`, `requireRef`, `dependencies`: override the build header piral-cli writes on the file's first line,
 *   `//@pilet v:2(<requireRef>,<dependencies>)`. Relative dependency paths are made absolute against the link.
 * - `custom`: passed through to the shell.
 */
class PiletFeed
{
    use Injectable;
    use Configurable;
    use Extensible;

    private static array $pilets = [];

    /**
     * Raw sha384 digests keyed by file path, so each file is hashed once per request
     */
    private array $digests = [];

    public function getItems(): array
    {
        $items = [];
        $pilets = $this->config()->get('pilets');
        if (!is_array($pilets)) {
            $this->warn('The pilets config must be an array keyed by pilet name');
            return [];
        }
        foreach ($pilets as $name => $definition) {
            $definition = (array) $definition;
            if (!$this->isListed($definition)) {
                continue;
            }
            $item = $this->buildItem((string) $name, $definition);
            if ($item) {
                $items[] = $item;
            }
        }
        $this->extend('updatePilets', $items);
        return $items;
    }

    protected function isListed(array $definition): bool
    {
        if (array_key_exists('enabled', $definition) && !$definition['enabled']) {
            return false;
        }
        $codes = array_filter((array) ($definition['permissions'] ?? []));
        if (!$codes) {
            return true;
        }
        $member = Security::getCurrentUser();
        return $member && Permission::checkMember($member, $codes);
    }

    protected function buildItem(string $name, array $definition): ?array
    {
        $link = (string) ($definition['link'] ?? '');
        if ($link === '') {
            $this->warn(sprintf("Pilet '%s' has no link and was skipped", $name));
            return null;
        }

        try {
            $target = $this->resolveLink($name, $link);
        } catch (InvalidArgumentException $exception) {
            $this->warn(sprintf("Pilet '%s' was skipped: %s", $name, $exception->getMessage()));
            return null;
        }
        if ($target === null) {
            return null;
        }

        $link = Director::absoluteURL($target['url']);
        $header = $target['path'] ? $this->parseHeader($target['path']) : [];
        $dependencies = $this->absoluteDependencies($definition['dependencies'] ?? $header['dependencies'] ?? [], $link);

        $item = [
            'name' => $name,
            'version' => (string) ($definition['version'] ?? $this->deriveVersion($target['package'], $target['path'])),
            'link' => $link,
            'spec' => $definition['spec'] ?? $header['spec'] ?? 'v2',
            'requireRef' => $definition['requireRef'] ?? $header['requireRef'] ?? null,
            'dependencies' => $dependencies ?: new stdClass(),
            'custom' => $definition['custom'] ?? new stdClass(),
        ];
        $integrity = $definition['integrity'] ?? ($target['path'] ? 'sha384-' . base64_encode($this->digest($target['path'])) : null);
        if ($integrity) {
            $item['integrity'] = (string) $integrity;
        }
        return $item;
    }

    /**
     * Turns a configured link into its URL, the file behind it and the Composer package that ships it,
     * or null when the file is missing. Path helpers throw InvalidArgumentException on `..` segments
     *
     * @return array{url: string, path: ?string, package: ?string}|null
     */
    protected function resolveLink(string $name, string $link): ?array
    {
        $resource = ModuleResourceLoader::singleton()->resolveResource($link);
        if ($resource instanceof ModuleResource) {
            if (!$resource->exists()) {
                $this->warn(sprintf("Pilet '%s' points at a missing file (%s) and was skipped", $name, $link));
                return null;
            }
            return [
                'url' => $resource->getURL(),
                'path' => $resource->getPath(),
                'package' => $resource->getModule()->getComposerName(),
            ];
        }
        if (preg_match('#^(https?:)?/#', $link)) {
            return ['url' => $link, 'path' => null, 'package' => null];
        }
        // A path relative to the project root, which is how the root module's own files are addressed
        $path = Path::join(Director::baseFolder(), $link);
        if (!file_exists($path)) {
            $this->warn(sprintf("Pilet '%s' points at a missing file (%s) and was skipped", $name, $link));
            return null;
        }
        return ['url' => ModuleResourceLoader::singleton()->resolveURL($link), 'path' => $path, 'package' => null];
    }

    protected function deriveVersion(?string $package, ?string $path): string
    {
        $rootPackage = InstalledVersions::getRootPackage()['name'] ?? null;
        if ($package && $package !== $rootPackage && InstalledVersions::isInstalled($package)) {
            $pretty = (string) InstalledVersions::getPrettyVersion($package);
            if (preg_match('#^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$#', $pretty, $matches)) {
                return $matches[1];
            }
            $reference = InstalledVersions::getReference($package);
            $build = $reference ? '+' . substr($reference, 0, 7) : '';
            return '0.0.0-' . trim(preg_replace('#[^0-9A-Za-z-]+#', '-', $pretty), '-') . $build;
        }
        if ($path) {
            return '0.0.0+' . substr(bin2hex($this->digest($path)), 0, 8);
        }
        return '0.0.0';
    }

    protected function digest(string $path): string
    {
        return $this->digests[$path] ??= (string) hash_file('sha384', $path, true);
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
