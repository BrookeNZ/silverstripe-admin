<?php

namespace SilverStripe\Admin\UserInterface\GridField;

use ReflectionMethod;
use SilverStripe\Control\Controller;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\Forms\GridField\GridFieldAddNewButton;
use SilverStripe\Forms\GridField\GridFieldComponent;

/**
 * Declares GridFieldAddNewButton as a `GridField.AddNewButton` component with a label and the new item
 * URL, without changing the framework class. A subclass that overrides getHTMLFragments() is not
 * adapted and keeps sending its HTML.
 */
class GridFieldAddNewButtonSchema implements GridField_SchemaProvider
{
    use Injectable;

    public const COMPONENT = 'GridField.AddNewButton';

    public function __construct(private readonly GridFieldAddNewButton $button)
    {
    }

    public static function adapts(GridFieldComponent $component): bool
    {
        return $component instanceof GridFieldAddNewButton
            && (new ReflectionMethod($component, 'getHTMLFragments'))->getDeclaringClass()->getName() === GridFieldAddNewButton::class;
    }

    public function getSlotSchema(GridField $gridField): array
    {
        // Rendering the fragment runs the button's canCreate() check and sets its default label
        $fragments = $this->button->getHTMLFragments($gridField);
        if (!$fragments) {
            return [];
        }
        // GridFieldAddNewButton has no getter for its label
        $label = (fn () => $this->buttonName)->call($this->button);

        return [
            strtolower((string) array_key_first($fragments)) => [[
                'component' => static::COMPONENT,
                'props' => [
                    'label' => (string) $label,
                    // The shape GridFieldEditButton gives existing records, so new and saved records share a route
                    'url' => Controller::join_links($gridField->Link('item'), 'new', 'edit'),
                ],
            ]],
        ];
    }
}
