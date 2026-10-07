<?php

namespace SilverStripe\Admin\UserInterface\CMSMain;

use SilverStripe\Admin\UserInterface\ShellSubmission;
use SilverStripe\CMS\Controllers\CMSMain;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Extension;
use SilverStripe\Core\Validation\ValidationResult;
use SilverStripe\Forms\Form;

/**
 * Lets the shell post a page's edit form (CMSMain and its edit and settings controllers) and get FormSchema
 * JSON back. CMSMain's actions answer through the PJAX negotiator, which refuses an XHR without `X-Pjax`
 * and renders HTML fragments; EditFormActionExtension handles the actions, this class the two answers
 * given before any action runs:
 *
 * - a failed CSRF check is a JSON 400 (the framework redirects back for a stale token, which the shell
 *   cannot follow, and answers plain text for a missing one)
 * - an action the form does not offer, which is how CMSMain withholds an action the member may not run,
 *   is a JSON 403 (the framework's is plain text naming the controller class)
 * - a failed validation is the FormSchema `state,errors` envelope with a 200, as AssetAdmin's file form
 *   answers, in place of LeftAndMain's PJAX validation callback
 *
 * @extends Extension<CMSMain>
 */
class EditFormSubmissionExtension extends Extension
{
    protected function afterCallActionHandler(HTTPRequest $request, string $action, $result): ?HTTPResponse
    {
        if ($action !== 'EditForm' || !$result instanceof Form || $request->remaining() !== '') {
            return null;
        }
        if (!ShellSubmission::isShellSubmission($request)) {
            return null;
        }

        if (!$result->getSecurityToken()->checkRequest($request)) {
            return ShellSubmission::jsonError(400, ShellSubmission::sessionExpiredMessage());
        }

        if (!ShellSubmission::offersClickedAction($request, $result)) {
            return ShellSubmission::jsonError(403, static::permissionMessage());
        }

        $controller = $this->getOwner();
        $result->setValidationResponseCallback(
            function (ValidationResult $errors) use ($controller, $result): HTTPResponse {
                $response = $controller->getSchemaResponse(static::schemaId($controller, $result), $result, $errors);
                return $response->addHeader('Cache-Control', 'no-store');
            }
        );
        return null;
    }

    public static function permissionMessage(): string
    {
        return _t(__CLASS__ . '.NO_PERMISSION', 'You do not have permission to do that to this page.');
    }

    /**
     * The id the shell loaded the form with (`<section link>/schema/EditForm/<record id>`)
     */
    public static function schemaId(CMSMain $controller, Form $form): string
    {
        $id = (int) $form->getRecord()?->ID ?: (int) $controller->currentRecordID();
        return rtrim($controller->Link('schema/EditForm/' . $id), '/');
    }
}
