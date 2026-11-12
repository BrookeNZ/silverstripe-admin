<?php

namespace SilverStripe\Admin\Tests\HierarchyTreeControllerTest;

use SilverStripe\Core\Convert;
use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\Hierarchy\Hierarchy;

class TreeNode extends DataObject implements TestOnly
{
    private static $table_name = 'HierarchyTreeControllerTest_TreeNode';

    private static $db = [
        'Title' => 'Varchar',
        'Sort' => 'Int',
        'Access' => "Enum('Edit,View,None', 'Edit')",
        'Flagged' => 'Boolean',
    ];

    private static $extensions = [
        Hierarchy::class,
    ];

    private static $default_sort = '"Sort"';

    public function canView($member = null)
    {
        return $this->Access !== 'None';
    }

    public function canEdit($member = null)
    {
        return $this->Access === 'Edit';
    }

    public function canCreate($member = null, $context = [])
    {
        return true;
    }

    public function getCMSEditLink(): ?string
    {
        return 'tree-node/edit/' . $this->ID;
    }

    public function getStatusFlags(bool $cached = true): array
    {
        $flags = parent::getStatusFlags($cached);
        if ($this->Flagged) {
            $flags['review'] = ['text' => 'Review', 'title' => 'Waiting for review'];
            $flags['new'] = 'New';
        }
        return $flags;
    }

    // Wraps the title in markup, as the page tree title does
    public function getTreeTitle(): string
    {
        return '<span class="item">' . Convert::raw2xml($this->Title) . '</span>';
    }
}
