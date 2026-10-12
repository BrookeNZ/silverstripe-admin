<?php

namespace SilverStripe\Admin\Tests\UserInterface\ServerHtmlFallbackTest;

use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\FormField;

class SchemaDataCountingField extends FormField implements TestOnly
{
    public static int $builds = 0;

    public function getSchemaDataDefaults()
    {
        static::$builds++;
        return parent::getSchemaDataDefaults();
    }
}
