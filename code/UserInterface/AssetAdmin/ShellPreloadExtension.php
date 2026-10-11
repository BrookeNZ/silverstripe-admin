<?php

namespace SilverStripe\Admin\UserInterface\AssetAdmin;

use SilverStripe\AssetAdmin\Controller\AssetAdmin;
use SilverStripe\Core\Extension;

/**
 * Preloads a file's edit form schema on a page load of the files pilet's details panel route,
 * `assets/show/<folderId>/edit/<fileId>`, which reads the client config's `fileEditForm` schema URL with the file
 * ID appended (FileDetails.tsx in client/pilets/files). `assets/edit/<id>` only redirects there, reading the
 * form state alone, so it preloads nothing
 *
 * @extends Extension<AssetAdmin>
 */
class ShellPreloadExtension extends Extension
{
    protected function updatePiralFirstSchemaUrl(?string &$url, array $segments): void
    {
        if (count($segments) === 4
            && $segments[0] === 'show'
            && preg_match('/^[0-9]+$/', $segments[1])
            && $segments[2] === 'edit'
            && preg_match('/^[1-9][0-9]*$/', $segments[3])
        ) {
            $url = $this->getOwner()->Link('schema/fileEditForm') . $segments[3];
        }
    }
}
