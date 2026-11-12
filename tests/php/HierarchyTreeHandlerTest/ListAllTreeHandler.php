<?php

namespace SilverStripe\Admin\Tests\HierarchyTreeHandlerTest;

use SilverStripe\Admin\HierarchyTreeHandler;
use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;

class ListAllTreeHandler extends HierarchyTreeHandler implements TestOnly
{
    protected function canListTreeNode(DataObject $node): bool
    {
        return true;
    }
}
