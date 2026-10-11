<?php

namespace SilverStripe\Admin\UserInterface;

use ReflectionClass;
use SilverStripe\CMS\Forms\SiteTreeURLSegmentField;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\FormField;
use SilverStripe\Forms\ToggleCompositeField;

/**
 * Adds `componentCandidates` to each field of a FormSchema schema: the ordered list of registry names
 * the Piral shell tries for the field.
 *
 * Walking from the field's own class towards FormField, each level adds its class name, so a pilet can
 * target a PHP class and its subclasses. The walk stops at the first class that declares a
 * `$schemaComponent`: when that is the field's own component, its name is added after the class, so a
 * pilet can also register the short name a class family shares; a parent's component is a different
 * UI, so it is never offered. A component name set on the instance with `setSchemaComponent()` (or
 * computed by an overridden `getSchemaComponent()`, as HTMLEditorField does) is the only candidate.
 *
 * For a field with no component the list is class names only, and the shell tries the field's
 * `schemaType` default straight after the field's own class, so a parent class registration never
 * outranks the type default (a pilet registering TextField's class does not take over DatetimeField).
 *
 * The framework's `FormField::getSchemaDataDefaults()` has no extension hook, so this decorates the
 * finished schema array instead, matching schema entries to form fields by id. A schema entry with no
 * matching form field (one a field's own getSchemaData() invented) gets no candidates and resolves by
 * `component` and `schemaType` alone.
 *
 * The same walk gives a ToggleCompositeField `data.headingLevel` and `data.startClosed`, which its schema
 * leaves out (the start state is only in its class attribute), and a SiteTreeURLSegmentField the URL prefix,
 * suffix and help text its template drew, the default segment its `data-default-url` carried, and the URL
 * of its `suggest` action when it is editable. The CMS
 * module is optional, and `instanceof` an absent class is simply false.
 *
 * Departures: legacy sends only `component` and the field's short class name in `extraClass`;
 * `componentCandidates`, sent only on shell schema requests, also exposes the field's class names up to
 * FormField.
 */
class FieldComponentCandidates
{
    use Injectable;

    /**
     * @return string[]
     */
    public function forField(FormField $field): array
    {
        $component = $field->getSchemaComponent();
        if ($component && $component !== $this->declaredComponent(get_class($field))) {
            return [$component];
        }

        $candidates = [];
        $class = new ReflectionClass($field);
        while ($class) {
            $declared = $this->declaredAt($class);
            if ($declared && $declared !== $component) {
                break;
            }
            $candidates[] = $class->getName();
            if ($declared) {
                $candidates[] = $declared;
                break;
            }
            if ($class->getName() === FormField::class) {
                break;
            }
            $class = $class->getParentClass();
        }

        return $candidates;
    }

    public function addToSchema(array $schema, Form $form): array
    {
        $fieldsById = [];
        foreach ([$form->Fields(), $form->Actions()] as $list) {
            foreach ($list->flattenFields() as $field) {
                $fieldsById[$field->ID()] ??= $field;
            }
        }

        foreach (['fields', 'actions'] as $key) {
            if (isset($schema[$key]) && is_array($schema[$key])) {
                $schema[$key] = $this->decorate($schema[$key], $fieldsById);
            }
        }
        return $schema;
    }

    /**
     * @param array<string, FormField> $fieldsById
     */
    private function decorate(array $entries, array $fieldsById): array
    {
        foreach ($entries as $index => $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $field = $fieldsById[$entry['id'] ?? ''] ?? null;
            if ($field) {
                $entries[$index]['componentCandidates'] = $this->forField($field);
            }
            if ($field instanceof ToggleCompositeField) {
                $entries[$index]['data'] = array_merge((array) ($entry['data'] ?? []), [
                    'headingLevel' => (int) $field->getHeadingLevel(),
                    'startClosed' => (bool) $field->getStartClosed(),
                ]);
            }
            if ($field instanceof SiteTreeURLSegmentField) {
                $entries[$index]['data'] = array_merge((array) ($entry['data'] ?? []), $this->urlSegmentData($field));
            }
            if (isset($entry['children']) && is_array($entry['children'])) {
                $entries[$index]['children'] = $this->decorate($entry['children'], $fieldsById);
            }
        }
        return $entries;
    }

    private function urlSegmentData(SiteTreeURLSegmentField $field): array
    {
        $data = [
            'urlPrefix' => $field->getURLPrefix(),
            'urlSuffix' => (string) $field->getURLSuffix(),
            'defaultUrl' => (string) $field->getDefaultURL(),
            // The help text is built by concatenation and can start with a space
            'helpText' => trim((string) $field->getHelpText()),
        ];
        if (!$field->isReadonly() && $field->getForm()) {
            $data['suggestUrl'] = $field->Link('suggest');
        }
        return $data;
    }

    private function declaredComponent(string $class): ?string
    {
        return (new ReflectionClass($class))->getDefaultProperties()['schemaComponent'] ?? null;
    }

    /**
     * The `$schemaComponent` a class declares itself, not one it inherits unchanged
     */
    private function declaredAt(ReflectionClass $class): ?string
    {
        $own = $class->getDefaultProperties()['schemaComponent'] ?? null;
        $parent = $class->getParentClass();
        $inherited = $parent ? ($parent->getDefaultProperties()['schemaComponent'] ?? null) : null;
        return $own !== $inherited ? $own : null;
    }
}
