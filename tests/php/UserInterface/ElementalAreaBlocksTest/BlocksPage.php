<?php

namespace SilverStripe\Admin\Tests\UserInterface\ElementalAreaBlocksTest;

use DNADesign\Elemental\Extensions\ElementalPageExtension;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Dev\TestOnly;

class BlocksPage extends SiteTree implements TestOnly
{
    private static string $table_name = 'ElementalAreaBlocksTest_BlocksPage';

    private static array $extensions = [
        ElementalPageExtension::class,
    ];
}
