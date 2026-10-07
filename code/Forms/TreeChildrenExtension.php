<?php

namespace SilverStripe\Admin\Forms;

use SilverStripe\Core\Extension;
use SilverStripe\Model\List\ArrayList;
use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\Hierarchy\Hierarchy;

/**
 * Hierarchy::getChildrenForTree() stops caching children once node_threshold_total records are cached,
 * and a parent it never reached then reads as childless. A TreeDropdownField search marks matches below
 * such a parent, so they were dropped from the result. This loads the children of a parent the cache
 * missed.
 *
 * @extends Extension<DataObject&Hierarchy>
 */
class TreeChildrenExtension extends Extension
{
    protected function updateGetChildrenForTree(bool $includeDeleted, ArrayList $children): void
    {
        $owner = $this->getOwner();
        if ($children->count() || !$owner->numChildren()) {
            return;
        }
        foreach ($owner->stageChildren() as $child) {
            $children->push($child);
        }
    }
}
