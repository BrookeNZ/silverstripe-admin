<?php

namespace SilverStripe\Admin\UserInterface\Elemental;

use DNADesign\Elemental\Models\BaseElement;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Core\Extension;
use SilverStripe\Versioned\Versioned;

/**
 * Loads the draft and published version numbers of an area's blocks in one query per stage before
 * ElementalAreaController::apiReadElements() runs, which otherwise reads each block's two version numbers
 * one row at a time (through canView() and getStatusFlags()).
 *
 * The readElements endpoint triggers this through beforeCallActionHandler. ElementalAreaBlocksExtension
 * calls apiReadElements() directly, so it calls prepopulateFor() itself.
 *
 * @extends Extension<\DNADesign\Elemental\Controllers\ElementalAreaController>
 */
class ElementVersionsExtension extends Extension
{
    public static function prepopulateFor(int $areaId): void
    {
        // The cache matches IDs strictly against integer keys, so a string ID would cache as unpublished
        $ids = array_map('intval', BaseElement::get()->filter('ParentID', $areaId)->column('ID'));
        if (!$ids) {
            return;
        }
        Versioned::prepopulateVersionNumberCacheForStage(BaseElement::class, Versioned::DRAFT, $ids);
        Versioned::prepopulateVersionNumberCacheForStage(BaseElement::class, Versioned::LIVE, $ids);
    }

    protected function beforeCallActionHandler(HTTPRequest $request, string $action): void
    {
        if ($action === 'apiReadElements') {
            static::prepopulateFor((int) $request->param('elementalAreaID'));
        }
    }
}
