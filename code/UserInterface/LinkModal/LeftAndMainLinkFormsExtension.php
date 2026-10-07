<?php

namespace SilverStripe\Admin\UserInterface\LinkModal;

use SilverStripe\Core\Extension;

/**
 * Leaves the file link form out of the link forms the client config lists (`form.<name>.schemaUrl`, added by
 * LeftAndMain::getClientConfig()) when FileLinkFormFactory is not available to the member
 *
 * @extends Extension<\SilverStripe\Admin\LeftAndMain>
 */
class LeftAndMainLinkFormsExtension extends Extension
{
    protected function updateClientConfig(array &$clientConfig): void
    {
        if (!FileLinkFormFactory::isAvailable()) {
            unset($clientConfig['form'][FileLinkFormFactory::NAME]);
        }
    }
}
