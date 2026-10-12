<?php

namespace SilverStripe\Admin\Tests\UserInterface\ElementalBlocksRulesTest;

use RuntimeException;
use SilverStripe\Core\Extension;
use SilverStripe\Dev\TestOnly;

class FailingReadExtension extends Extension implements TestOnly
{
    public static bool $fail = false;

    protected function updateApiReadElementalArea(array &$data): void
    {
        if (static::$fail) {
            throw new RuntimeException('Block list failed');
        }
    }
}
