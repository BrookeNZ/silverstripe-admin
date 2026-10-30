<?php

namespace SilverStripe\Admin\Client;

use Psr\Log\LoggerInterface;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Core\Injector\Injector;
use stdClass;

/**
 * Builds the admin page's import map: the shared files from the loader build, then the modules and libraries from
 * ModuleRegistry::getImports().
 *
 * The shared files come from the build's `manifest.json`, whose `shared` and `files` keys are a contract with
 * client/loader/webpack.config.js. Each shared URL carries `?v=` and the first 8 hex digits of its file's digest, so
 * a rebuilt file gets a new URL without any hashing at request time.
 *
 * @internal
 */
class ImportMap
{
    use Injectable;

    /**
     * @var array<string, string>|null
     */
    private ?array $sharedImports = null;

    /**
     * Paths already warned about, so a stale manifest warns once per process. Protected, not private, so config
     * does not read it
     */
    protected static array $warnedUndigested = [];

    /**
     * @param array<string, string> $imports From ModuleRegistry::getImports()
     */
    public function getMap(array $imports = []): array
    {
        $imports = $this->getSharedImports() + $imports;
        return ['imports' => $imports ?: new stdClass()];
    }

    /**
     * @return array<string, string>
     */
    public function getSharedImports(): array
    {
        if ($this->sharedImports !== null) {
            return $this->sharedImports;
        }
        $manifest = LoaderAssets::singleton()->getManifest();
        $shared = is_array($manifest['shared'] ?? null) ? $manifest['shared'] : [];
        if (!$shared) {
            $this->warn(
                "The loader build's manifest.json is missing or lists no shared files, so the import map is empty and "
                . 'no module can load; run npm run build in client/loader'
            );
            return $this->sharedImports = [];
        }
        $base = LoaderAssets::singleton()->getReleaseBaseURL();
        $imports = [];
        foreach ($shared as $specifier => $path) {
            if (!ImportMap::isBuildFile($path)) {
                continue;
            }
            $digest = $manifest['files'][$path] ?? null;
            if (!is_string($digest) || !str_starts_with($digest, 'sha384-')) {
                $this->warnUndigestedOnce((string) $specifier, $path);
                $imports[(string) $specifier] = $base . $path;
                continue;
            }
            $imports[(string) $specifier] = $base . $path . ImportMap::cacheBuster($digest);
        }
        return $this->sharedImports = $imports;
    }

    /**
     * Only `/`-separated segments of letters, digits, `.`, `_` and `-` that start with a letter or digit, so a
     * browser's URL parser cannot resolve the path outside the build folder
     */
    private static function isBuildFile(mixed $file): bool
    {
        if (!is_string($file) || strlen($file) > 255) {
            return false;
        }
        foreach (explode('/', $file) as $segment) {
            if (!preg_match('#^[A-Za-z0-9][A-Za-z0-9._-]*\z#', $segment)) {
                return false;
            }
        }
        return true;
    }

    private function warnUndigestedOnce(string $specifier, string $path): void
    {
        if (isset(ImportMap::$warnedUndigested[$path])) {
            return;
        }
        ImportMap::$warnedUndigested[$path] = true;
        $this->warn(sprintf(
            'Shared module "%s" (%s) has no digest in the loader build\'s manifest.json, so its URL carries '
            . 'no cache buster; rebuild the loader',
            $specifier,
            $path
        ));
    }

    private static function cacheBuster(string $digest): string
    {
        $hash = (string) base64_decode(substr($digest, strlen('sha384-')));
        return '?v=' . substr(bin2hex($hash), 0, 8);
    }

    private function warn(string $message): void
    {
        Injector::inst()->get(LoggerInterface::class)->warning($message);
    }
}
