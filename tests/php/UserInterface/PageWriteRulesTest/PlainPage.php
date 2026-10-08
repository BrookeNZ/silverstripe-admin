<?php

namespace SilverStripe\Admin\Tests\UserInterface\PageWriteRulesTest;

use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Dev\TestOnly;

/**
 * A page type other than the base class, which the type lists leave out
 */
class PlainPage extends SiteTree implements TestOnly
{
    private static string $table_name = 'PageWriteRulesTest_PlainPage';
}
