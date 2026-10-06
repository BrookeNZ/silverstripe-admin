<?php

namespace SilverStripe\Admin\Tests\UserInterface\CMSMainEditFormSubmissionTest;

use SilverStripe\Core\Extension;
use SilverStripe\Core\Validation\ValidationResult;
use SilverStripe\Dev\TestOnly;

class RejectingExtension extends Extension implements TestOnly
{
    protected function updateValidate(ValidationResult $result): void
    {
        if ($this->getOwner()->Title === 'Rejected') {
            $result->addFieldError('Title', 'This title is rejected');
        }
    }
}
