<?php

namespace SilverStripe\Admin\Tests\UserInterface\FirstSchemaPreloadRulesTest;

use SilverStripe\Core\Extension;
use SilverStripe\Dev\TestOnly;

class ClientConfigCallLog extends Extension implements TestOnly
{
    public static array $calls = [];

    protected function updateClientConfig(array &$clientConfig): void
    {
        static::$calls[] = get_class($this->getOwner());
    }
}
