<?php

namespace SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest;

use SilverStripe\Control\Controller;
use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\Forms\GridField\GridFieldConfig_RecordEditor;
use SilverStripe\Forms\GridField\GridFieldDataColumns;

class TestController extends Controller implements TestOnly
{
    public static bool $withBadge = false;

    public static ?string $nameFormat = null;

    private static string $url_segment = 'GridFieldRowsEndpointTest';

    private static array $allowed_actions = ['Form'];

    public function Form(): Form
    {
        $config = GridFieldConfig_RecordEditor::create(2);
        if (static::$withBadge) {
            $config->addComponent(BadgeColumn::create());
        }
        if (static::$nameFormat !== null) {
            $config->getComponentByType(GridFieldDataColumns::class)->setFieldFormatting(['Name' => static::$nameFormat]);
        }
        $grid = GridField::create('Teams', 'Teams', Team::get(), $config);
        return Form::create($this, 'Form', FieldList::create($grid), FieldList::create());
    }
}
