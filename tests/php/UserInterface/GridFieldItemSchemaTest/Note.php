<?php

namespace SilverStripe\Admin\Tests\UserInterface\GridFieldItemSchemaTest;

use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\Validation\CompositeValidator;
use SilverStripe\Forms\Validation\RequiredFieldsValidator;
use SilverStripe\ORM\DataObject;

class Note extends DataObject implements TestOnly
{
    /**
     * Permissions the tests withhold: any of view, edit, delete, create, publish, unpublish
     */
    public static array $denied = [];

    private static string $table_name = 'GridFieldItemSchemaTest_Note';

    private static array $db = [
        'Title' => 'Varchar',
        'Body' => 'Text',
    ];

    public function getCMSCompositeValidator(): CompositeValidator
    {
        return parent::getCMSCompositeValidator()->addValidator(RequiredFieldsValidator::create(['Title']));
    }

    public function canView($member = null)
    {
        return !in_array('view', static::$denied);
    }

    public function canEdit($member = null)
    {
        return !in_array('edit', static::$denied);
    }

    public function canDelete($member = null)
    {
        return !in_array('delete', static::$denied);
    }

    public function canCreate($member = null, $context = [])
    {
        return !in_array('create', static::$denied);
    }
}
