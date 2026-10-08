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
 * and renders HTML fragments; EditFormActionExtension handles the actions, this class the answers given
 * before any action runs:
 *
 * - a failed CSRF check is a JSON 400 with the framework's wording, technical problem for a missing token and
 *   session expired for a stale one (the framework redirects back for a stale token, which the shell cannot
 *   follow, and answers plain text for a missing one)
 * - an action the form does not offer is a JSON 403 with neutral wording, as the framework's "Action not
 *   allowed" is
 * - a posted ID that is not a saved page's (a missing one, or the `new-<class>-<parent>` form) is a JSON 400
 * - a failed validation is the FormSchema `state,errors` envelope with a 200, as AssetAdmin's file form
 *   answers, in place of LeftAndMain's PJAX validation callback
 * - the schema of a page the member cannot view is a JSON 403
 *
 * Departures: the framework runs an action the form does not offer when the controller allows it, where the
 * shell refuses it, since CMSMain withholds an action the member may not run or that no longer applies to the
 * page. Legacy creates a page from a `new-` ID; under the shell PageCreateController creates pages, so this
 * form only saves existing ones. The schema of a page the member cannot view is a 500 in legacy, from
 * LeftAndMain::getEditForm() returning null against CMSMain::getEditForm()'s return type.
 *
 * @extends Extension<CMSMain>
 */
class EditFormSubmissionExtension extends Extension
{
    protected function beforeCallActionHandler(HTTPRequest $request, string $action): ?HTTPResponse
    {
        $id = $request->param('ItemID');
        if ($action !== 'schema' || $request->param('FormName') !== 'EditForm' || !is_numeric($id)) {
            return null;
        }
        $record = $this->getOwner()->getRecord((int) $id);
        if ($record && !$record->canView()) {
            return ShellSubmission::jsonError(
                403,
                _t(__CLASS__ . '.CANNOT_VIEW', 'You do not have permission to view this page.'),
                'forbidden'
            );
        }
        return null;
    }

    protected function afterCallActionHandler(HTTPRequest $request, string $action, $result): ?HTTPResponse
    {
        if ($action !== 'EditForm' || !$result instanceof Form || $request->remaining() !== '') {
            return null;
        }
        if (!ShellSubmission::isShellSubmission($request)) {
            return null;
        }

        $token = $result->getSecurityToken();
        if (!$token->checkRequest($request)) {
            $message = $request->postVar($token->getName())
                ? ShellSubmission::sessionExpiredMessage()
                : ShellSubmission::missingTokenMessage();
            return ShellSubmission::jsonError(400, $message, 'invalidToken');
        }

        if (!ShellSubmission::offersClickedAction($request, $result)) {
            return ShellSubmission::jsonError(403, ShellSubmission::actionNotAvailableMessage(), 'actionNotAvailable');
        }

        $id = $request->postVar('ID');
        if (!is_scalar($id) || !ctype_digit((string) $id) || (int) $id < 1) {
            return ShellSubmission::jsonError(
                400,
                _t(__CLASS__ . '.NOT_A_SAVED_PAGE', 'This form can only save an existing page.'),
                'invalid'
            );
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
