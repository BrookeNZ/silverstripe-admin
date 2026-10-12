<?php

namespace SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest;

use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\GridField\AbstractGridFieldComponent;
use SilverStripe\Forms\GridField\GridField_ColumnProvider;

class BadgeColumn extends AbstractGridFieldComponent implements GridField_ColumnProvider, TestOnly
{
    public function augmentColumns($gridField, &$columns)
    {
        $columns[] = 'Badge';
    }

    public function getColumnsHandled($gridField)
    {
        return ['Badge'];
    }

    public function getColumnContent($gridField, $record, $columnName)
    {
        return '<b class="badge">' . $record->City . '</b>';
    }

    public function getColumnAttributes($gridField, $record, $columnName)
    {
        return [];
    }

    public function getColumnMetadata($gridField, $columnName)
    {
        return ['title' => 'Badge'];
    }
}
