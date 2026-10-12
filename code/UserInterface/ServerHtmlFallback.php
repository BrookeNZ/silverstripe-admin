<?php

namespace SilverStripe\Admin\UserInterface;

use Psr\Log\LoggerInterface;
use SilverStripe\Admin\UserInterface\GridField\GridFieldRowsEndpoint;
use ReflectionMethod;
use ReflectionProperty;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Forms\CompositeField;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\FormField;
use SilverStripe\Forms\GridField\GridField;
use Throwable;
use WeakMap;

/**
 * Lets the Piral shell render a field that has no React component from its server HTML, instead of
 * the whole schema failing.
 *
 * FormSchema throws a LogicException for any field whose schema data names neither a `schemaType` nor a
 * `component` (a GridField, a project field with only a template), so the schema of a form holding one
 * is a 500. Before the schema is built, mark() gives each such field a placeholder component name, and
 * restore() takes it away again straight after, so the form is left as it was. mark() reads the field's
 * emitted getSchemaData(), the same data FormSchema checks, so a component supplied through
 * setSchemaData() or an overridden getSchemaDataDefaults() keeps the field out of the fallback. A plain
 * CompositeField's data already holds each child's getSchemaData() under `children`, so mark() reads a
 * nested field's data from there instead of rebuilding the subtree once per ancestor; children of a
 * composite that overrides either method, or was given `children` through setSchemaData(), are asked
 * directly. All data is read before any field is marked.
 * addToSchema() then sets the entry's `component` back to null and adds `fallback.html`, the field's
 * FieldHolder() HTML, which the shell's transitional ServerHtmlField renders. Only fields the
 * framework would reject get the fallback: a field naming a component the shell lacks still shows the
 * shell's missing-field notice, because rendering every field's template for every schema request
 * would cost a template render per field to cover a gap that porting closes.
 *
 * A field whose FieldHolder() throws is logged as a warning and left without `fallback`, so the shell
 * shows its missing-field notice for that field and the rest of the form still renders.
 *
 * A GridField whose config has GridFieldRowsEndpoint gets `data.rowsUrl` instead of its HTML, because
 * the shell's grid component reads its rows from that endpoint; rendering FieldHolder() for it would
 * cost a full grid render per schema request.
 *
 * Departures: legacy answers a schema holding such a field with a 500; the shell gets the field's server
 * HTML instead. A throwing template, which legacy would never reach, now fails only that field.
 */
class ServerHtmlFallback
{
    use Injectable;

    public const PLACEHOLDER_COMPONENT = 'ServerHtmlField';

    private static array $dependencies = [
        'logger' => '%$' . LoggerInterface::class,
    ];

    private ?LoggerInterface $logger = null;

    private WeakMap $originalComponents;

    /**
     * @var array<class-string, bool>
     */
    private array $passesChildrenThrough = [];

    public function __construct()
    {
        $this->originalComponents = new WeakMap();
    }

    public function setLogger(LoggerInterface $logger): static
    {
        $this->logger = $logger;
        return $this;
    }

    /**
     * @return array<string, FormField> The fields marked, by id
     */
    public function mark(Form $form): array
    {
        $emitted = $this->emittedSchemaData($form->Fields(), new WeakMap());
        $marked = [];
        foreach ($form->Fields()->flattenFields() as $field) {
            $data = $emitted[$field] ?? $field->getSchemaData();
            if (empty($data['schemaType']) && empty($data['component'])) {
                $this->originalComponents[$field] = $field->getSchemaComponent();
                $field->setSchemaComponent(static::PLACEHOLDER_COMPONENT);
                $marked[$field->ID()] = $field;
            }
        }
        return $marked;
    }

    /**
     * @param WeakMap<FormField, array> $emitted
     * @param array<int, array>|null $fromParent The parent's emitted `children`, when they can be trusted
     * @return WeakMap<FormField, array>
     */
    private function emittedSchemaData(FieldList $fields, WeakMap $emitted, ?array $fromParent = null): WeakMap
    {
        $index = 0;
        foreach ($fields as $field) {
            $childData = $fromParent[$index++] ?? null;
            $data = is_array($childData) && ($childData['id'] ?? null) === $field->ID()
                ? $childData
                : $field->getSchemaData();
            $emitted[$field] = $data;
            if ($field instanceof CompositeField) {
                $children = $field->getChildren();
                $trusted = $this->passesChildrenThrough($field)
                    && is_array($data['children'] ?? null)
                    && count($data['children']) === $children->count();
                $this->emittedSchemaData($children, $emitted, $trusted ? $data['children'] : null);
            }
        }
        return $emitted;
    }

    /**
     * Whether the composite's `children` are exactly its children's getSchemaData(), in order
     */
    private function passesChildrenThrough(CompositeField $field): bool
    {
        $class = get_class($field);
        $this->passesChildrenThrough[$class] ??=
            (new ReflectionMethod($class, 'getSchemaDataDefaults'))->class === CompositeField::class
            && (new ReflectionMethod($class, 'getSchemaData'))->class === FormField::class;
        if (!$this->passesChildrenThrough[$class]) {
            return false;
        }
        $assigned = (new ReflectionProperty(FormField::class, 'schemaData'))->getValue($field);
        return !array_key_exists('children', (array) $assigned);
    }

    /**
     * @param array<string, FormField> $marked
     */
    public function restore(array $marked): void
    {
        foreach ($marked as $field) {
            $field->setSchemaComponent($this->originalComponents[$field] ?? null);
            unset($this->originalComponents[$field]);
        }
    }

    /**
     * @param array<string, FormField> $marked
     */
    public function addToSchema(array $schema, array $marked): array
    {
        if ($marked && isset($schema['fields']) && is_array($schema['fields'])) {
            $schema['fields'] = $this->decorate($schema['fields'], $marked);
        }
        return $schema;
    }

    /**
     * @param array<string, FormField> $marked
     */
    private function decorate(array $entries, array $marked): array
    {
        foreach ($entries as $index => $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $field = $marked[$entry['id'] ?? ''] ?? null;
            if ($field) {
                $entries[$index]['component'] = null;
                $rowsUrl = $field instanceof GridField ? GridFieldRowsEndpoint::rowsUrl($field) : null;
                if ($rowsUrl) {
                    $entries[$index]['data']['rowsUrl'] = $rowsUrl;
                } else {
                    $html = $this->holderHtml($field);
                    if ($html !== null) {
                        $entries[$index]['fallback'] = ['html' => $html];
                    }
                }
            }
            if (isset($entry['children']) && is_array($entry['children'])) {
                $entries[$index]['children'] = $this->decorate($entry['children'], $marked);
            }
        }
        return $entries;
    }

    private function holderHtml(FormField $field): ?string
    {
        try {
            return (string) $field->FieldHolder();
        } catch (Throwable $exception) {
            $this->logger?->warning(
                sprintf(
                    'Field "%s" of form "%s" could not render its server HTML fallback: %s',
                    $field->getName(),
                    $field->getForm()?->getName() ?? '',
                    $exception->getMessage()
                ),
                ['exception' => $exception]
            );
            return null;
        }
    }
}
