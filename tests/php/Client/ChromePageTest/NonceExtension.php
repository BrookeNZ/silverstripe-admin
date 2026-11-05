<?php

namespace SilverStripe\Admin\Tests\Client\ChromePageTest;

use SilverStripe\Core\Extension;
use SilverStripe\Dev\TestOnly;

class NonceExtension extends Extension implements TestOnly
{
    public const string NONCE = 'n0nce+/=';

    public const string POLICY = "script-src 'nonce-" . NonceExtension::NONCE . "'";

    protected function onAfterInit(): void
    {
        $this->getOwner()->getResponse()->addHeader('Content-Security-Policy', NonceExtension::POLICY);
    }

    protected function updateChromeNonce(string &$nonce): void
    {
        $nonce = NonceExtension::NONCE;
    }
}
