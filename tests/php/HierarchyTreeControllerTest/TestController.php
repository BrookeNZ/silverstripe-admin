<?php

namespace SilverStripe\Admin\Tests\HierarchyTreeControllerTest;

use SilverStripe\Admin\HierarchyTreeController;
use SilverStripe\Dev\TestOnly;

class TestController extends HierarchyTreeController implements TestOnly
{
    private static $url_segment = 'hierarchy-tree-test';

    private static ?string $model_class = TreeNode::class;
}
