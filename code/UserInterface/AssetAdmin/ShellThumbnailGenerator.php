<?php

namespace SilverStripe\Admin\UserInterface\AssetAdmin;

use SilverStripe\Admin\UserInterface\ShellSubmission;
use SilverStripe\AssetAdmin\Model\ThumbnailGenerator;
use SilverStripe\Assets\Storage\AssetContainer;
use SilverStripe\Assets\Storage\AssetStore;
use SilverStripe\Control\Controller;

/**
 * The `ThumbnailGenerator.assetadmin` service, which serves UploadFields and AssetAdmin's own file edit form,
 * and for a shell FormSchema request links a protected thumbnail by URL instead of inlining it as a base64
 * data URI.
 *
 * Inlining put about 60 kB into a page's edit schema for one draft hero image and cost the encode on every form
 * open, though the shell lazy-loads the thumbnail. The URL carries the framework's default file grant
 * (AssetStore::grant(), as File::getURL() does by default): once the member has passed the file's `canView`,
 * this session may fetch the original and every variant of that file from ProtectedFileController, not only
 * the thumbnail. Legacy requests and public thumbnails keep the parent's behaviour.
 */
class ShellThumbnailGenerator extends ThumbnailGenerator
{
    public function generateLink(?AssetContainer $thumbnail = null)
    {
        if (!$thumbnail || !$this->linksProtectedByUrl($thumbnail)) {
            return parent::generateLink($thumbnail);
        }
        if (!$thumbnail->exists()
            || !$thumbnail->getIsImage()
            || $thumbnail->getAbsoluteSize() > $this->config()->get('max_thumbnail_bytes')
        ) {
            return null;
        }
        return $thumbnail->getURL(true);
    }

    private function linksProtectedByUrl(AssetContainer $thumbnail): bool
    {
        return $thumbnail->getVisibility() === AssetStore::VISIBILITY_PROTECTED
            && ShellSubmission::isFormSchemaRequest(Controller::curr()?->getRequest());
    }
}
