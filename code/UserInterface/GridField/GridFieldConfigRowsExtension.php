<?php

namespace SilverStripe\Admin\UserInterface\GridField;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\GridField\GridFieldConfig;

/**
 * Adds the JSON rows endpoint to the framework's stock configs while the Piral shell is on.
 *
 * Only GridFieldConfig_Base, _RecordEditor, _RecordViewer and _RelationEditor call `updateConfig`; a
 * config built from a bare GridFieldConfig gets no endpoint, so the shell renders that grid from its
 * server HTML. A hook on GridFieldConfig itself is the upstream ask.
 *
 * @extends Extension<GridFieldConfig>
 */
class GridFieldConfigRowsExtension extends Extension
{
    protected function updateConfig(): void
    {
        $config = $this->getOwner();
        if (LeftAndMain::config()->get('piral_shell') && !$config->getComponentByType(GridFieldRowsEndpoint::class)) {
            $config->addComponent(GridFieldRowsEndpoint::create());
        }
    }
}
