<?php

namespace SilverStripe\Admin\Tests\Client\ClientRegistryTest;

use SilverStripe\Core\Extension;
use SilverStripe\Dev\TestOnly;

class UpdateEntriesExtension extends Extension implements TestOnly
{
    protected function updateEntries(array &$items): void
    {
        $items[] = ['name' => 'acme/stray/main', 'specifier' => 'acme/stray/main'];
        $items[] = ['name' => 'acme/again/main', 'specifier' => 'acme/hello/main'];
    }
}
