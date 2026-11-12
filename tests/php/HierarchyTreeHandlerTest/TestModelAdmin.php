<?php

namespace SilverStripe\Admin\Tests\HierarchyTreeHandlerTest;

use SilverStripe\Admin\HierarchyTreeHandler;
use SilverStripe\Admin\ModelAdmin;
use SilverStripe\Dev\TestOnly;

class TestModelAdmin extends ModelAdmin implements TestOnly
{
    private static $url_segment = 'hierarchy-tree-model-admin-test';

    private static $managed_models = [
        TreeNode::class,
    ];

    private static $allowed_actions = [
        'tree',
    ];

    public function tree(): HierarchyTreeHandler
    {
        return HierarchyTreeHandler::create($this, 'tree', $this->getModelClass());
    }
}
