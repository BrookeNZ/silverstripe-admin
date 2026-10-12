<?php

namespace SilverStripe\Admin\Tests\UserInterface\ServerHtmlFallbackTest;

use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\FormField;

class CountingField extends FormField implements TestOnly
{
    public static int $renders = 0;

    public function FieldHolder($properties = [])
    {
        static::$renders++;
        return parent::FieldHolder($properties);
    }
}
