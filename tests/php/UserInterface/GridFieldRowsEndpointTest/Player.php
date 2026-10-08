<?php

namespace SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest;

use SilverStripe\Core\Validation\ValidationException;
use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;

class Player extends DataObject implements TestOnly
{
    public static bool $deletable = true;

    /**
     * A business rule onBeforeDelete() enforces with a ValidationException when set
     */
    public static ?string $deleteRefusal = null;

    private static string $table_name = 'GridFieldRowsEndpointTest_Player';

    private static array $db = [
        'Name' => 'Varchar',
    ];

    private static array $has_one = [
        'Team' => Team::class,
    ];

    private static array $summary_fields = [
        'Name' => 'Name',
    ];

    public function canView($member = null)
    {
        return true;
    }

    public function canEdit($member = null)
    {
        return true;
    }

    public function canDelete($member = null)
    {
        return static::$deletable;
    }

    protected function onBeforeDelete()
    {
        if (static::$deleteRefusal !== null) {
            throw new ValidationException(static::$deleteRefusal);
        }
        parent::onBeforeDelete();
    }
}
