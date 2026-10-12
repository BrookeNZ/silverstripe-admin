<?php

namespace SilverStripe\Admin\Tests\UserInterface\FieldComponentCandidatesTest;

use SilverStripe\Admin\FormSchemaController;
use SilverStripe\Dev\TestOnly;

class SchemaController extends FormSchemaController implements TestOnly
{
    private static string $url_segment = 'field-component-candidates-test';
}
