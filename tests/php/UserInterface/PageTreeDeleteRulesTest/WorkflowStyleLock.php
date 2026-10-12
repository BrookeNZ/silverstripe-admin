<?php

namespace SilverStripe\Admin\Tests\UserInterface\PageTreeDeleteRulesTest;

use SilverStripe\Core\Extension;
use SilverStripe\Dev\TestOnly;

class WorkflowStyleLock extends Extension implements TestOnly
{
    protected function canEdit($member)
    {
        return $this->owner->Title === 'Locked by workflow' ? false : null;
    }
}
