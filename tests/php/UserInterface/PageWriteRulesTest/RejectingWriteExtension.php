<?php

namespace SilverStripe\Admin\Tests\UserInterface\PageWriteRulesTest;

use SilverStripe\Core\Extension;
use SilverStripe\Core\Validation\ValidationException;
use SilverStripe\Dev\TestOnly;

class RejectingWriteExtension extends Extension implements TestOnly
{
    protected function onBeforeWrite(): void
    {
        throw new ValidationException('Rejected by write');
    }
}
