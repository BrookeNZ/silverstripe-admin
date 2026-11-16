<?php

namespace SilverStripe\Admin\Tests\HierarchyTreeControllerTest;

use SilverStripe\ORM\DataObject;

class ListAllTestController extends TestController
{
    private static $url_segment = 'hierarchy-tree-list-all-test';

    protected function canListTreeNode(DataObject $node): bool
    {
        return true;
    }
}
