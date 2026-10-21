<?php

namespace SilverStripe\Admin\Tests\Client\ModuleRegistryTest;

use SilverStripe\Core\Extension;
use SilverStripe\Dev\TestOnly;

class UpdateModuleItemsExtension extends Extension implements TestOnly
{
    protected function updateModuleItems(array &$items): void
    {
        $items[] = ['name' => 'acme/stray', 'specifier' => 'acme/stray'];
        $items[] = ['name' => 'acme/again', 'specifier' => 'acme/hello'];
    }
}
