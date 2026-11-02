<?php

namespace SilverStripe\Admin\Tests\Client\ChromePageTest;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Dev\TestOnly;
use SilverStripe\View\Requirements;

class SectionController extends LeftAndMain implements TestOnly
{
    public const string MENU_TITLE = 'Chrome Test Section';

    private static $url_segment = 'chrome-test-section';

    private static $menu_title = SectionController::MENU_TITLE;

    private static $allowed_actions = [
        'export',
    ];

    /**
     * Clears the requirements as a print view does, so the error page has only what afterHandleRequest()'s init() adds
     */
    public function export(): void
    {
        Requirements::clear();
        $this->httpError(500);
    }
}
