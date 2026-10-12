<?php

namespace SilverStripe\Admin\Tests\UserInterface\ElementalAreaBlocksTest;

use SilverStripe\Core\Extension;
use SilverStripe\Dev\TestOnly;

class VersionCacheSpy extends Extension implements TestOnly
{
    public static array $prepopulated = [];

    protected function updatePrePopulateVersionNumberCache(array $versions, string $class, string $stage, ?array $ids): void
    {
        $ids ??= [];
        sort($ids);
        static::$prepopulated[$stage] = $ids;
    }
}
