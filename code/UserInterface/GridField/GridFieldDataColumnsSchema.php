<?php

namespace SilverStripe\Admin\UserInterface\GridField;

use ReflectionMethod;
use SilverStripe\Core\Convert;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\Forms\GridField\GridFieldComponent;
use SilverStripe\Forms\GridField\GridFieldDataColumns;
use SilverStripe\Model\ModelData;
use SilverStripe\ORM\FieldType\DBField;
use SilverStripe\ORM\FieldType\DBGenerated;
use SilverStripe\ORM\FieldType\DBHTMLText;
use SilverStripe\ORM\FieldType\DBHTMLVarchar;

/**
 * Gives GridFieldDataColumns cell values as JSON without changing the framework class: it wraps the
 * component and reads the same display fields, callbacks, casting and formatting.
 *
 * A cell is a plain `value` (the field's Nice() text, a DBField's raw value, or a scalar) unless the
 * component would emit markup the client cannot rebuild: a `setFieldCasting()` entry, a callable
 * `setFieldFormatting()` entry, an HTML field, or status flag badges. Those cells are sent as `html`.
 * String formats from `setFieldFormatting()`, which the framework evaluates with eval(), are never run;
 * the cell carries the casted value instead.
 *
 * A subclass that overrides how content is built (GridFieldEditableColumns, GridFieldExternalLink) is
 * not adapted, so its cells keep coming from getColumnContent() as HTML.
 */
class GridFieldDataColumnsSchema implements GridField_ColumnSchemaProvider
{
    use Injectable;

    public const CELL_COMPONENT = 'GridField.cell.Text';

    public function __construct(private readonly GridFieldDataColumns $columns)
    {
    }

    public static function adapts(GridFieldComponent $component): bool
    {
        if (!$component instanceof GridFieldDataColumns) {
            return false;
        }
        foreach (['getColumnContent', 'castValue', 'formatValue', 'escapeValue'] as $method) {
            $declaredBy = (new ReflectionMethod($component, $method))->getDeclaringClass()->getName();
            if ($declaredBy !== GridFieldDataColumns::class) {
                return false;
            }
        }
        return true;
    }

    public function augmentColumns($gridField, &$columns)
    {
        $this->columns->augmentColumns($gridField, $columns);
    }

    public function getColumnsHandled($gridField)
    {
        return $this->columns->getColumnsHandled($gridField);
    }

    public function getColumnContent($gridField, $record, $columnName)
    {
        return $this->columns->getColumnContent($gridField, $record, $columnName);
    }

    public function getColumnAttributes($gridField, $record, $columnName)
    {
        return $this->columns->getColumnAttributes($gridField, $record, $columnName);
    }

    public function getColumnMetadata($gridField, $columnName)
    {
        return $this->columns->getColumnMetadata($gridField, $columnName);
    }

    public function getColumnCellSchema(GridField $gridField, string $columnName): array
    {
        return ['component' => static::CELL_COMPONENT, 'props' => []];
    }

    public function getColumnCell(GridField $gridField, ModelData $record, string $columnName): array
    {
        $formatting = $this->columns->getFieldFormatting()[$columnName] ?? null;
        if ($formatting !== null && !is_string($formatting) && is_callable($formatting)) {
            return ['html' => (string) $this->columns->getColumnContent($gridField, $record, $columnName)];
        }

        $value = $this->rawValue($gridField, $record, $columnName);
        $flags = $this->statusFlagMarkup($gridField, $record, $columnName);
        $casting = $this->columns->getFieldCasting()[$columnName] ?? null;
        if ($casting !== null) {
            return ['html' => (string) $gridField->getCastedValue($value, $casting) . $flags];
        }

        $cell = $this->cellFor($value);
        if ($flags === '') {
            return $cell;
        }
        $html = $cell['html'] ?? nl2br(Convert::raw2xml((string) ($cell['value'] ?? '')));
        return ['html' => $html . $flags];
    }

    private function rawValue(GridField $gridField, ModelData $record, string $columnName): mixed
    {
        $info = $this->columns->getDisplayFields($gridField)[$columnName] ?? null;
        if (is_array($info) && isset($info['callback'])) {
            return $info['callback']($record, $columnName, $gridField);
        }
        return $gridField->getDataFieldValue($record, $columnName);
    }

    /**
     * @return array{value?: scalar|null, html?: string}
     */
    private function cellFor(mixed $value): array
    {
        if ($value instanceof DBField && $this->isHtmlField($value)) {
            return ['html' => $value->forTemplate()];
        }
        if (is_object($value) && method_exists($value, 'Nice')) {
            return ['value' => $this->scalar($value->Nice())];
        }
        if ($value instanceof DBField) {
            return ['value' => $this->scalar($value->RAW())];
        }
        if (is_object($value) && method_exists($value, 'forTemplate')) {
            return ['html' => (string) $value->forTemplate()];
        }
        return ['value' => $this->scalar($value)];
    }

    private function scalar(mixed $value): string|int|float|bool|null
    {
        if ($value === null || is_scalar($value)) {
            return $value;
        }
        return is_object($value) && method_exists($value, '__toString') ? (string) $value : null;
    }

    private function statusFlagMarkup(GridField $gridField, ModelData $record, string $columnName): string
    {
        if (!$this->columns->getDisplayStatusFlags() || !$record->hasMethod('getStatusFlags')) {
            return '';
        }
        $flagColumn = null;
        foreach (array_keys($this->columns->getDisplayFields($gridField)) as $column) {
            if (in_array($column, $this->columns->getColumnsForStatusFlag())) {
                $flagColumn = $column;
                break;
            }
        }
        if ($flagColumn !== $columnName || !$record->getStatusFlags()) {
            return '';
        }
        return (string) $record->getStatusFlagMarkup('ss-gridfield-badge');
    }

    private function isHtmlField(DBField $field): bool
    {
        if ($field instanceof DBGenerated) {
            $field = $field->getChildField();
        }
        return $field instanceof DBHTMLText || $field instanceof DBHTMLVarchar;
    }
}
