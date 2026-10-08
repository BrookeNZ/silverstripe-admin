<?php

namespace SilverStripe\Admin\UserInterface;

use SilverStripe\Admin\UserInterface\GridField\GridFieldItemSchemaExtension;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\RequestHandler;
use SilverStripe\Core\Extension;

/**
 * Turns a 404 raised while answering a shell FormSchema request into the JSON error envelope. The case that
 * matters is GridFieldDetailForm::handleItem()'s plain-text "That record was not found" for a missing record,
 * which then reads exactly like GridFieldItemSchemaExtension's answer for a record the member cannot view.
 *
 * @extends Extension<RequestHandler>
 */
class SchemaRequestErrorExtension extends Extension
{
    private const FRAMEWORK_NOT_FOUND = 'That record was not found';

    protected function onBeforeHTTPError404(?HTTPRequest $request, $errorMessage = null): void
    {
        if (!ShellSubmission::isFormSchemaRequest($request) || !$request->isGET()) {
            return;
        }
        $message = $errorMessage === static::FRAMEWORK_NOT_FOUND || !$errorMessage
            ? GridFieldItemSchemaExtension::notFoundMessage()
            : (string) $errorMessage;
        throw ShellSubmission::jsonException(404, $message);
    }
}
