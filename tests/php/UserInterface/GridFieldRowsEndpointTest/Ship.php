<?php

namespace SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest;

use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\Hierarchy\Hierarchy;
use SilverStripe\Versioned\Versioned;

class Ship extends DataObject implements TestOnly
{
    private static string $table_name = 'GridFieldRowsEndpointTest_Ship';

    private static array $db = [
        'Name' => 'Varchar',
    ];

    private static array $summary_fields = [
        'Name' => 'Name',
    ];

    private static array $extensions = [
        Versioned::class,
        Hierarchy::class,
    ];

    private static string $default_sort = '"Name" ASC';

    public function CMSEditLink(): string
    {
        return 'admin/ships/edit/' . $this->ID;
    }

    public function canView($member = null)
    {
        return true;
    }

    public function canEdit($member = null)
    {
        return $this->Name !== 'Locked';
    }

    public function canDelete($member = null)
    {
        return $this->Name !== 'Locked';
    }

    public function canCreate($member = null, $context = [])
    {
        return true;
    }
}
