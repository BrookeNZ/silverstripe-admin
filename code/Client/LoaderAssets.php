<?php

namespace SilverStripe\Admin\Client;

use SilverStripe\Control\Director;
use SilverStripe\Core\Config\Configurable;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Core\Manifest\ModuleResource;
use SilverStripe\Core\Manifest\ModuleResourceLoader;

/**
 * Locates the client loader's build in client/dist/loader/. A build without the entry file still renders a chrome
 * page, with no loader script.
 *
 * @internal
 */
class LoaderAssets
{
    use Injectable;
    use Configurable;

    public const string ENTRY_FILE = 'main.js';

    public const string MANIFEST_FILE = 'manifest.json';

    public const string ADMIN_SPECIFIER = '@silverstripe/admin';

    // Keep in step with the keys of sharedFiles in client/loader/shared.js
    public const array SHARED_SPECIFIERS = [
        LoaderAssets::ADMIN_SPECIFIER,
        'react',
        'react/jsx-runtime',
        'react-dom',
        'react-dom/client',
    ];

    /**
     * The build's folder as a module resource reference
     */
    private static string $release_dir = 'silverstripe/admin:client/dist/loader/';

    private ?array $manifest = null;

    private bool $manifestRead = false;

    public function getScriptURL(): ?string
    {
        return $this->releaseFileURL(LoaderAssets::ENTRY_FILE);
    }

    /**
     * The flag is separate because null, for a build without a manifest, is a valid cached result
     */
    public function getManifest(): ?array
    {
        if (!$this->manifestRead) {
            $this->manifestRead = true;
            $path = $this->getReleaseFilePath(LoaderAssets::MANIFEST_FILE);
            $manifest = $path ? json_decode((string) file_get_contents($path), true) : null;
            $this->manifest = is_array($manifest) ? $manifest : null;
        }
        return $this->manifest;
    }

    public function getReleaseBaseURL(): string
    {
        return rtrim(Director::absoluteURL(ModuleResourceLoader::resourceURL($this->releaseDir())), '/') . '/';
    }

    /**
     * @throws \InvalidArgumentException for an unknown module or a path with `..` segments
     */
    public function getReleaseFilePath(string $path): ?string
    {
        $resource = ModuleResourceLoader::singleton()->resolveResource($this->releaseDir() . ltrim($path, '/'));
        if (!$resource instanceof ModuleResource || !is_file($resource->getPath())) {
            return null;
        }
        return $resource->getPath();
    }

    private function releaseDir(): string
    {
        return rtrim((string) $this->config()->get('release_dir'), '/') . '/';
    }

    private function releaseFileURL(string $file): ?string
    {
        if ($this->getReleaseFilePath($file) === null) {
            return null;
        }
        return Director::absoluteURL(ModuleResourceLoader::resourceURL($this->releaseDir() . $file));
    }
}
