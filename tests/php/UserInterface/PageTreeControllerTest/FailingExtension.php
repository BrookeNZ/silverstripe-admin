<?php

namespace SilverStripe\Admin\Tests\UserInterface\PageTreeControllerTest;

use RuntimeException;
use SilverStripe\Core\Extension;
use SilverStripe\Dev\TestOnly;

class FailingExtension extends Extension implements TestOnly
{
    protected function updateApiChildren(array &$data, int $id): void
    {
        throw new RuntimeException('Children failed');
    }
}
