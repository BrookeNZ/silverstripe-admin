<?php

namespace SilverStripe\Admin\Tests\HierarchyTreeHandlerTest;

use SilverStripe\Admin\HierarchyTreeHandler;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Dev\TestOnly;

class TestController extends LeftAndMain implements TestOnly
{
    private static $url_segment = 'hierarchy-tree-test';

    private static $model_class = TreeNode::class;

    private static $allowed_actions = [
        'EditForm',
        'tree',
    ];

    private static $url_handlers = [
        'EditForm/$ID' => 'EditForm',
    ];

    public function tree(): HierarchyTreeHandler
    {
        return HierarchyTreeHandler::create($this, 'tree', $this->getModelClass());
    }
}
