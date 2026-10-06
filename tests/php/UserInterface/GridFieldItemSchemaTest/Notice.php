<?php

namespace SilverStripe\Admin\Tests\UserInterface\GridFieldItemSchemaTest;

use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;
use SilverStripe\Versioned\Versioned;

/**
 * A versioned model, which gets VersionedGridFieldItemRequest and its publish actions; it reads the
 * permissions Note::$denied withholds
 */
class Notice extends DataObject implements TestOnly
{
    private static string $table_name = 'GridFieldItemSchemaTest_Notice';

    private static array $db = [
        'Title' => 'Varchar',
    ];

    private static array $extensions = [
        Versioned::class,
    ];

    public function canView($member = null)
    {
        return !in_array('view', Note::$denied);
    }

    public function canEdit($member = null)
    {
        return !in_array('edit', Note::$denied);
    }

    public function canDelete($member = null)
    {
        return !in_array('delete', Note::$denied);
    }

    public function canCreate($member = null, $context = [])
    {
        return !in_array('create', Note::$denied);
    }

    public function canPublish($member = null)
    {
        return !in_array('publish', Note::$denied);
    }

    public function canUnpublish($member = null)
    {
        return !in_array('unpublish', Note::$denied);
    }
}
