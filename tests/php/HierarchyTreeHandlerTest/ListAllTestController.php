<?php

namespace SilverStripe\Admin\Tests\HierarchyTreeHandlerTest;

use SilverStripe\Admin\HierarchyTreeHandler;

class ListAllTestController extends TestController
{
    private static $url_segment = 'hierarchy-tree-list-all-test';

    private static $allowed_actions = [
        'tree',
    ];

    public function tree(): HierarchyTreeHandler
    {
        return ListAllTreeHandler::create($this, 'tree', $this->getModelClass());
    }
}
