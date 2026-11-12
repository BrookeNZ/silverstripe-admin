<?php

namespace SilverStripe\Admin\Tests\HierarchyTreeControllerTest;

use SilverStripe\Admin\HierarchyTreeController;
use SilverStripe\Dev\TestOnly;

class TestController extends HierarchyTreeController implements TestOnly
{
    private static $url_segment = 'hierarchy-tree-test';

    private static $model_class = TreeNode::class;

    private static $allowed_actions = [
        'EditForm',
    ];

    private static $url_handlers = [
        'EditForm/$ID' => 'EditForm',
    ];
}
