<?php

namespace SilverStripe\Admin\Tests\UserInterface\SchemaFallbackRulesTest;

use RuntimeException;
use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\FormField;

class ThrowingTemplateField extends FormField implements TestOnly
{
    public function FieldHolder($properties = [])
    {
        throw new RuntimeException('Template failed');
    }
}
