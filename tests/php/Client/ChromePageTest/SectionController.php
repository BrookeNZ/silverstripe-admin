<?php

namespace SilverStripe\Admin\Tests\Client\ChromePageTest;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Dev\TestOnly;

class SectionController extends LeftAndMain implements TestOnly
{
    public const string MENU_TITLE = 'Chrome Test Section';

    private static $url_segment = 'chrome-test-section';

    private static $menu_title = SectionController::MENU_TITLE;
}
