<?php

namespace SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest;

use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;

class Team extends DataObject implements TestOnly
{
    private static string $table_name = 'GridFieldRowsEndpointTest_Team';

    private static array $db = [
        'Name' => 'Varchar',
        'City' => 'Varchar',
    ];

    private static array $summary_fields = [
        'Name' => 'Name',
        'City' => 'City',
    ];

    private static array $searchable_fields = [
        'Name',
        'City',
    ];

    private static string $default_sort = '"Name" ASC';

    public function canView($member = null)
    {
        return $this->Name !== 'Hidden';
    }

    public function canEdit($member = null)
    {
        return true;
    }

    public function canDelete($member = null)
    {
        return true;
    }

    public function canCreate($member = null, $context = [])
    {
        return true;
    }
}
