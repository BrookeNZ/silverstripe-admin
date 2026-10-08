<?php

namespace SilverStripe\Admin\Tests\UserInterface\GridFieldRulesTest;

use SilverStripe\Admin\ModelAdmin;
use SilverStripe\Admin\Tests\UserInterface\GridFieldItemSchemaTest\Note;
use SilverStripe\Control\Controller;
use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\GridField\GridFieldConfig;
use SilverStripe\Forms\GridField\GridFieldConfig_RecordViewer;

class ViewOnlyNoteAdmin extends ModelAdmin implements TestOnly
{
    private static string $url_segment = 'viewonlynoteadmin';

    private static array $managed_models = [
        'notes' => ['dataClass' => Note::class, 'title' => 'Notes'],
    ];

    public function Link($action = null)
    {
        if (!$action) {
            $action = $this->sanitiseClassName($this->modelTab);
        }
        return Controller::join_links('ViewOnlyNoteAdmin', $action, '/');
    }

    protected function getGridFieldConfig(): GridFieldConfig
    {
        return GridFieldConfig_RecordViewer::create();
    }
}
