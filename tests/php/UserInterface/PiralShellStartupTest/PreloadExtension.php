<?php

namespace SilverStripe\Admin\Tests\UserInterface\PiralShellStartupTest;

use SilverStripe\Core\Extension;
use SilverStripe\Dev\TestOnly;

class PreloadExtension extends Extension implements TestOnly
{
    protected function updatePiralPreloads(array &$urls): void
    {
        $urls[] = 'admin/example/schema?id=1';
    }
}
