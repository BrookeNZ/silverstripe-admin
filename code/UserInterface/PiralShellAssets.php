<?php

namespace SilverStripe\Admin\UserInterface;

use Psr\Log\LoggerInterface;
use SilverStripe\Control\Director;
use SilverStripe\Core\Environment;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\View\Requirements;

/**
 * Requires the Piral shell's script and stylesheet: the committed release build, or in dev the bundle a
 * `piral debug` server on the host serves when `SS_PIRAL_SHELL_DEV_URL` names it.
 *
 * The dev bundle carries React development builds and the Piral debug bridge, so the variable is ignored, with a
 * logged warning, outside dev. The page CSP must allow the dev server's origin; the site's dev CSP does that.
 * See client/shell/README.md for the dev loop.
 */
class PiralShellAssets
{
    use Injectable;

    public const DEV_URL_ENV = 'SS_PIRAL_SHELL_DEV_URL';

    public function includeRequirements(): void
    {
        $devUrl = $this->getDevUrl();
        if ($devUrl !== null) {
            // The dev bundle injects its styles from the script, so there is no stylesheet to link
            Requirements::javascript($devUrl . 'main.js');
            return;
        }
        Requirements::javascript('silverstripe/admin: client/dist/shell/main.js');
        Requirements::css('silverstripe/admin: client/dist/shell/main.css');
    }

    /**
     * The dev server's base URL with a trailing slash, or null when the release build applies
     */
    public function getDevUrl(): ?string
    {
        $url = Environment::getEnv(PiralShellAssets::DEV_URL_ENV);
        if (!is_string($url) || $url === '') {
            return null;
        }
        if (!Director::isDev()) {
            $this->warn(PiralShellAssets::DEV_URL_ENV . ' is set outside dev; serving the release build');
            return null;
        }
        if (!preg_match('#^https?://[^/]+#', $url)) {
            $this->warn(PiralShellAssets::DEV_URL_ENV . " must be an absolute http(s) URL, got \"$url\"");
            return null;
        }
        return rtrim($url, '/') . '/';
    }

    protected function warn(string $message): void
    {
        Injector::inst()->get(LoggerInterface::class)->warning($message);
    }
}
