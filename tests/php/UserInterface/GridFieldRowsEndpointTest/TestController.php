<?php

namespace SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest;

use SilverStripe\Control\Controller;
use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\Forms\GridField\GridFieldConfig_Base;
use SilverStripe\Forms\GridField\GridFieldConfig_RecordEditor;
use SilverStripe\Forms\GridField\GridFieldConfig_RelationEditor;
use SilverStripe\Forms\GridField\GridFieldDataColumns;
use SilverStripe\Versioned\GridFieldRestoreAction;
use SilverStripe\Versioned\Versioned;

class TestController extends Controller implements TestOnly
{
    public static bool $withBadge = false;

    public static ?string $nameFormat = null;

    private static string $url_segment = 'GridFieldRowsEndpointTest';

    private static array $allowed_actions = ['Form', 'Fleet', 'Archive', 'Roster'];

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

    public function Fleet(): Form
    {
        // Reads draft as LeftAndMain does
        Versioned::set_stage(Versioned::DRAFT);
        $grid = GridField::create('Ships', 'Ships', Ship::get(), GridFieldConfig_RecordEditor::create());
        return Form::create($this, 'Fleet', FieldList::create($grid), FieldList::create());
    }

    public function Roster(): Form
    {
        $team = Team::get()->find('Name', 'Alpha');
        $grid = GridField::create('Players', 'Players', $team->Players(), GridFieldConfig_RelationEditor::create());
        return Form::create($this, 'Roster', FieldList::create($grid), FieldList::create());
    }

    public function Archive(): Form
    {
        Versioned::set_stage(Versioned::DRAFT);
        $config = GridFieldConfig_Base::create()->addComponent(new GridFieldRestoreAction());
        $grid = GridField::create('Ships', 'Ships', Versioned::getRemovedFromDraft(Ship::class), $config);
        $grid->setModelClass(Ship::class);
        return Form::create($this, 'Archive', FieldList::create($grid), FieldList::create());
    }
}
