<?php

namespace SilverStripe\Admin\Tests\UserInterface\GridFieldRulesTest;

use SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest\Team;
use SilverStripe\Control\Controller;
use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\Forms\GridField\GridFieldConfig_RecordEditor;
use SilverStripe\Versioned\GridFieldArchiveAction;

class ArchiveTeamsController extends Controller implements TestOnly
{
    private static string $url_segment = 'GridFieldRulesTest';

    private static array $allowed_actions = ['Form'];

    public function Form(): Form
    {
        $config = GridFieldConfig_RecordEditor::create()->addComponent(new GridFieldArchiveAction());
        $grid = GridField::create('Teams', 'Teams', Team::get(), $config);
        return Form::create($this, 'Form', FieldList::create($grid), FieldList::create());
    }
}
