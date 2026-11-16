<?php

namespace SilverStripe\Admin\Tests\HierarchyTreeHandlerTest;

use SilverStripe\Core\Extension;
use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;

class TreeNodeDataExtension extends Extension implements TestOnly
{
    protected function updateTreeNodeData(array &$data, DataObject $node, DataObject $parent): void
    {
        $data['parentTitle'] = $parent->Title;
        $data['sectionLink'] = $this->getOwner()->getParentController()->Link();
        $data['modelClass'] = $this->getOwner()->getModelClass();
    }
}
