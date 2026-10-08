<?php

namespace SilverStripe\Admin\UserInterface;

use Psr\Log\LoggerInterface;
use SilverStripe\Admin\UserInterface\GridField\GridFieldRowsEndpoint;
use SilverStripe\Core\Injector\Injectable;
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
 * setSchemaData() or an overridden getSchemaDataDefaults() keeps the field out of the fallback.
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
        $marked = [];
        foreach ($form->Fields()->flattenFields() as $field) {
            $data = $field->getSchemaData();
            if (empty($data['schemaType']) && empty($data['component'])) {
                $this->originalComponents[$field] = $field->getSchemaComponent();
                $field->setSchemaComponent(static::PLACEHOLDER_COMPONENT);
                $marked[$field->ID()] = $field;
            }
        }
        return $marked;
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
