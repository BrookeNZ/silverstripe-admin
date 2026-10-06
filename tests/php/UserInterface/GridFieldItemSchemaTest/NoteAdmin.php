<?php

namespace SilverStripe\Admin\Tests\UserInterface\GridFieldItemSchemaTest;

use SilverStripe\Admin\ModelAdmin;
use SilverStripe\Control\Controller;
use SilverStripe\Dev\TestOnly;

class NoteAdmin extends ModelAdmin implements TestOnly
{
    private static string $url_segment = 'noteadmin';

    private static array $managed_models = [
        'notes' => ['dataClass' => Note::class, 'title' => 'Notes'],
        'notices' => ['dataClass' => Notice::class, 'title' => 'Notices'],
    ];

    // FunctionalTest routes extra controllers by their short class name
    public function Link($action = null)
    {
        if (!$action) {
            $action = $this->sanitiseClassName($this->modelTab);
        }
        return Controller::join_links('NoteAdmin', $action, '/');
    }
}
