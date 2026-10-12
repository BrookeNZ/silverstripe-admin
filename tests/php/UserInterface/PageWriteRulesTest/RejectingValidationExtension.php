<?php

namespace SilverStripe\Admin\Tests\UserInterface\PageWriteRulesTest;

use SilverStripe\Core\Extension;
use SilverStripe\Core\Validation\ValidationResult;
use SilverStripe\Dev\TestOnly;

class RejectingValidationExtension extends Extension implements TestOnly
{
    protected function updateValidate(ValidationResult $result): void
    {
        $result->addError('Rejected by validation', ValidationResult::TYPE_ERROR, 'REJECTED');
    }
}
