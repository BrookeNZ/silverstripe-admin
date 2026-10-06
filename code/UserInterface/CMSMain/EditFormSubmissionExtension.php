<?php

namespace SilverStripe\Admin\UserInterface\CMSMain;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\CMS\Controllers\CMSMain;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Extension;
use SilverStripe\Core\Validation\ValidationResult;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\FormAction;
use SilverStripe\Forms\Schema\FormSchema;

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
        if (!static::isShellSubmission($request)) {
            return null;
        }

        if (!$result->getSecurityToken()->checkRequest($request)) {
            return static::jsonError(400, _t(
                Form::class . '.CSRF_EXPIRED_MESSAGE',
                'Your session has expired. Please re-submit the form.'
            ));
        }

        if (!$this->offersClickedAction($request, $result)) {
            return static::jsonError(403, static::permissionMessage());
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

    private function offersClickedAction(HTTPRequest $request, Form $form): bool
    {
        $clicked = null;
        foreach (array_keys($request->postVars()) as $name) {
            if (str_starts_with((string) $name, 'action_')) {
                $clicked = (string) $name;
                break;
            }
        }
        if ($clicked === null) {
            return true;
        }
        foreach ($form->Actions()->flattenFields() as $field) {
            if ($field instanceof FormAction && $field->getName() === $clicked) {
                return true;
            }
        }
        return false;
    }

    public static function permissionMessage(): string
    {
        return _t(__CLASS__ . '.NO_PERMISSION', 'You do not have permission to do that to this page.');
    }

    public static function isShellSubmission(?HTTPRequest $request): bool
    {
        return $request
            && $request->isPOST()
            && $request->getHeader(FormSchema::SCHEMA_HEADER)
            && LeftAndMain::config()->get('piral_shell');
    }

    /**
     * The id the shell loaded the form with (`<section link>/schema/EditForm/<record id>`)
     */
    public static function schemaId(CMSMain $controller, Form $form): string
    {
        $id = (int) $form->getRecord()?->ID ?: (int) $controller->currentRecordID();
        return rtrim($controller->Link('schema/EditForm/' . $id), '/');
    }

    public static function jsonError(int $code, string $message): HTTPResponse
    {
        $body = json_encode([
            'status' => 'error',
            'errors' => [['type' => 'error', 'code' => $code, 'value' => $message]],
        ]);
        return HTTPResponse::create($body, $code)
            ->addHeader('Content-Type', 'application/json')
            ->addHeader('Cache-Control', 'no-store');
    }
}
