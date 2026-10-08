<?php

namespace SilverStripe\Admin\Tests\UserInterface\SchemaFallbackRulesTest;

use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\FormField;

class DefaultsComponentField extends FormField implements TestOnly
{
    public function getSchemaDataDefaults()
    {
        $defaults = parent::getSchemaDataDefaults();
        $defaults['component'] = 'ProjectWidget';
        return $defaults;
    }
}
