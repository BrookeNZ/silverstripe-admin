<?php

namespace SilverStripe\Admin\Tests\UserInterface\CMSMainEditFormSubmissionTest;

use RuntimeException;
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

    protected function onBeforeWrite(): void
    {
        if ($this->getOwner()->Title === 'Explode') {
            throw new RuntimeException('The write exploded');
        }
    }
}
