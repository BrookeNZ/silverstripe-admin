<?php

namespace SilverStripe\Admin\UserInterface\CMSMain;

use SilverStripe\CMS\Controllers\CMSMain;
use SilverStripe\Core\Extension;

/**
 * Preloads the pages section's first data requests: the root of the page tree, and on a page load of a page's
 * edit, settings or history view (or a block's edit page) that view's schema. The move hints are left out
 * because the tree fetches them when the pointer or focus first reaches it.
 *
 * The URLs mirror client/pilets/pages, which resolves them with `new URL()` and so never adds the trailing slash
 * Link() may: the tree API resolves against the section link plus `tree/`, the first page of children asks for
 * `page=1&limit=50` (treeStore's firstLimit), a view at `<view section>/show/<id>` (PagesSection's viewTail)
 * reads `<view section>/schema/EditForm/<id>`, and the elemental pilet's block edit page reads the block's
 * item schema. A change there that this does not follow costs a wasted request, not a broken page.
 *
 * @extends Extension<CMSMain>
 */
class ShellPreloadExtension extends Extension
{
    protected function updatePiralPreloads(array &$urls): void
    {
        $section = rtrim(CMSMain::singleton()->Link(), '/');
        $urls[] = $section . '/tree/children/0?page=1&limit=50';
    }

    protected function updatePiralFirstSchemaUrl(?string &$url, array $segments): void
    {
        $owner = $this->getOwner();
        $section = rtrim($owner->Link(), '/');
        // CMSMain itself is the tree; the views are its subclasses (CMSPageEditController and the like)
        if (get_class($owner) !== CMSMain::class
            && count($segments) === 2
            && $segments[0] === 'show'
            && preg_match('/^[1-9][0-9]*$/', $segments[1])
        ) {
            $url = $section . '/schema/EditForm/' . $segments[1];
        } elseif (count($segments) >= 6
            && [$segments[0], $segments[2], $segments[4]] === ['EditForm', 'field', 'item']
            && preg_match('/^[1-9][0-9]*$/', $segments[1])
            && preg_match('/^[1-9][0-9]*$/', $segments[5])
        ) {
            $url = $section . '/' . implode('/', array_slice($segments, 0, 6)) . '/schema';
        }
    }
}
