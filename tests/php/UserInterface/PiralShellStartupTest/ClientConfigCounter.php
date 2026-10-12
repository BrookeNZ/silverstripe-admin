<?php

namespace SilverStripe\Admin\Tests\UserInterface\PiralShellStartupTest;

use SilverStripe\Core\Extension;
use SilverStripe\Dev\TestOnly;

class ClientConfigCounter extends Extension implements TestOnly
{
    public static int $calls = 0;

    public static array $classes = [];

    protected function updateClientConfig(array &$clientConfig): void
    {
        static::$calls++;
        static::$classes[] = get_class($this->getOwner());
    }
}
