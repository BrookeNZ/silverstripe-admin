<?php

namespace SilverStripe\Admin\Tests\Client\ChromePageTest;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Control\Controller;
use SilverStripe\Dev\TestOnly;

/**
 * A section nobody may view, whose init() skips the parent's permission gate as a section that forgets
 * parent::init() does
 */
class UngatedSectionController extends LeftAndMain implements TestOnly
{
    private static $url_segment = 'chrome-ungated-section';

    private static $menu_title = 'Chrome Ungated Section';

    protected function init(): void
    {
        Controller::init();
    }

    public function canView($member = null): bool
    {
        return false;
    }
}
