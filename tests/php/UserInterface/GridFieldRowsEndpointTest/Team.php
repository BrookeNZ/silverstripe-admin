<?php

namespace SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest;

use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\Forms\GridField\GridFieldConfig_Base;
use SilverStripe\Forms\GridField\GridFieldConfig_RecordEditor;
use SilverStripe\Forms\TextField;
use SilverStripe\ORM\DataObject;
use SilverStripe\Versioned\GridFieldRestoreAction;
use SilverStripe\Versioned\Versioned;

class Team extends DataObject implements TestOnly
{
    private static string $table_name = 'GridFieldRowsEndpointTest_Team';

    private static array $db = [
        'Name' => 'Varchar',
        'City' => 'Varchar',
    ];

    private static array $has_many = [
        'Players' => Player::class,
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

    public function getCMSFields()
    {
        return FieldList::create(
            TextField::create('Name'),
            GridField::create('Players', 'Players', $this->Players(), GridFieldConfig_RecordEditor::create()),
            GridField::create(
                'ArchivedShips',
                'Archived ships',
                Versioned::getRemovedFromDraft(Ship::class),
                GridFieldConfig_Base::create()->addComponent(new GridFieldRestoreAction())
            )->setModelClass(Ship::class)
        );
    }

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
