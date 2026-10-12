<?php

namespace SilverStripe\Admin\UserInterface\GridField;

use SilverStripe\Forms\GridField\GridField;
use SilverStripe\Forms\GridField\GridFieldComponent;

/**
 * A GridField component that declares the UI it adds around the grid as named components with props,
 * instead of the HTML fragments of GridField_HTMLProvider.
 *
 * Defined in admin until framework carries it; a framework component gets it through an adapter
 * registered in GridFieldRowsEndpoint's `schema_adapters` config.
 */
interface GridField_SchemaProvider extends GridFieldComponent
{
    /**
     * @return array<string, array<int, array{component: string, props: array}>> Declarations by slot name,
     * using the fragment names of GridField_HTMLProvider (`before`, `buttons-before-left`, ...)
     */
    public function getSlotSchema(GridField $gridField): array;
}
