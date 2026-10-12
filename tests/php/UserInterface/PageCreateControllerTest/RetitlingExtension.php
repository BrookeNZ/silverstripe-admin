<?php

namespace SilverStripe\Admin\Tests\UserInterface\PageCreateControllerTest;

use SilverStripe\Core\Extension;
use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;

class RetitlingExtension extends Extension implements TestOnly
{
    protected function updateCreatedPage(DataObject $record): void
    {
        $record->Title = 'Retitled by extension';
    }
}
