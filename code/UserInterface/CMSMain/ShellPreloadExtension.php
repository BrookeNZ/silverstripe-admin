<?php

namespace SilverStripe\Admin\UserInterface\CMSMain;

use SilverStripe\CMS\Controllers\CMSMain;
use SilverStripe\Core\Extension;

/**
 * Preloads the pages section's first data requests, the root of the page tree and the move hints, so they
 * start with the page instead of after the pages pilet runs.
 *
 * The URLs mirror client/pilets/pages, which resolves them with `new URL()` and so never adds the trailing slash
 * Link() may: the tree API resolves against the section link plus `tree/`, the first
 * page of children asks for `page=1&limit=50` (treeStore's firstLimit) and the move API reads `move/hints`.
 * A change there that this does not follow costs a wasted request, not a broken page.
 *
 * @extends Extension<CMSMain>
 */
class ShellPreloadExtension extends Extension
{
    protected function updatePiralPreloads(array &$urls): void
    {
        $section = rtrim(CMSMain::singleton()->Link(), '/');
        $urls[] = $section . '/tree/children/0?page=1&limit=50';
        $urls[] = $section . '/move/hints';
    }
}
