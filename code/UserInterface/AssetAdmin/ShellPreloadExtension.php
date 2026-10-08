<?php

namespace SilverStripe\Admin\UserInterface\AssetAdmin;

use SilverStripe\AssetAdmin\Controller\AssetAdmin;
use SilverStripe\Core\Extension;

/**
 * Preloads a file's edit form schema on a page load of the shell's file edit route, `assets/edit/<id>`, which
 * reads the client config's `fileEditForm` schema URL with the ID appended (FileEditPage in client/shell/src/assets.tsx)
 *
 * @extends Extension<AssetAdmin>
 */
class ShellPreloadExtension extends Extension
{
    protected function updatePiralFirstSchemaUrl(?string &$url, array $segments): void
    {
        if (count($segments) === 2 && $segments[0] === 'edit' && preg_match('/^[1-9][0-9]*$/', $segments[1])) {
            $url = $this->getOwner()->Link('schema/fileEditForm') . $segments[1];
        }
    }
}
