<?php

namespace SilverStripe\Admin\UserInterface\GridField;

use SilverStripe\Forms\GridField\GridField;
use SilverStripe\Forms\GridField\GridField_ColumnProvider;
use SilverStripe\Model\ModelData;

/**
 * A column provider whose cells are JSON values rendered by a named client component, instead of the
 * HTML that getColumnContent() returns.
 *
 * Defined in admin until framework carries it; a framework component gets it through an adapter
 * registered in GridFieldRowsEndpoint's `schema_adapters` config.
 */
interface GridField_ColumnSchemaProvider extends GridField_ColumnProvider
{
    /**
     * @return array{component: string, props: array}
     */
    public function getColumnCellSchema(GridField $gridField, string $columnName): array;

    /**
     * One cell: `['value' => <JSON-safe scalar or null>]`, or `['html' => <string>]` when this record's
     * cell can only be expressed as server HTML
     *
     * @return array{value?: scalar|null, html?: string}
     */
    public function getColumnCell(GridField $gridField, ModelData $record, string $columnName): array;
}
