<?php

namespace SilverStripe\Admin\Tests\UserInterface\ServerHtmlFallbackTest;

use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\CompositeField;

/**
 * Emits its children with a component they do not declare themselves
 */
class ComponentMaskingComposite extends CompositeField implements TestOnly
{
    public function getSchemaDataDefaults()
    {
        $defaults = parent::getSchemaDataDefaults();
        foreach ($defaults['children'] ?? [] as $index => $child) {
            $defaults['children'][$index]['component'] = 'MaskedField';
        }
        return $defaults;
    }
}
