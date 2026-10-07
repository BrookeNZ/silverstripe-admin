<?php

namespace SilverStripe\Admin\UserInterface\CMSMain;

use SilverStripe\Admin\UserInterface\ShellSubmission;
use SilverStripe\CMS\Controllers\CMSMain;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\FormRequestHandler;
use SilverStripe\ORM\DataObject;

/**
 * Answers a shell submission of a page's edit form (see EditFormSubmissionExtension) with JSON.
 *
 * CMSMain's actions (save, publish, unpublish, archive and the rest) end with the PJAX negotiator, which
 * answers an XHR without `X-Pjax` with a 400 after the action has already written. So the action runs with
 * `X-Pjax: ValidationResult`, the smallest fragment, and its answer is replaced:
 *
 * - success: the FormSchema state of the form rebuilt from the saved record, with `record`, `deleted`
 *   (false) and `message` (the action's `X-Status` text) beside it; an action that removed the draft
 *   (archive, delete) answers `{"deleted": true, "message": ...}` with no state
 * - an error status (CMSMain's permission failures are an empty 403): a JSON error with the same status
 *   and any `X-Reauthenticate` header
 *
 * A redirect passes through. A new record (an ID of `new-<class>-<parent>`) is not handled: the shell has no
 * add page flow yet.
 *
 * @extends Extension<FormRequestHandler>
 */
class EditFormActionExtension extends Extension
{
    private const PJAX_HEADER = 'X-Pjax';

    protected function beforeCallFormHandler(HTTPRequest $request, string $funcName, array $vars, Form $form, $subject): void
    {
        if ($this->handles($request, $vars, $form, $subject)) {
            $request->addHeader(static::PJAX_HEADER, 'ValidationResult');
        }
    }

    protected function afterCallFormHandler(HTTPRequest $request, string $funcName, array $vars, Form $form, $subject, &$result): void
    {
        if (!$this->handles($request, $vars, $form, $subject) || !$result instanceof HTTPResponse) {
            return;
        }
        $request->removeHeader(static::PJAX_HEADER);
        if ($result->isRedirect()) {
            return;
        }
        $result = $result->isError()
            ? $this->errorResponse($result)
            : $this->successResponse($subject, $form, (int) $vars['ID']);
    }

    private function handles(?HTTPRequest $request, array $vars, Form $form, $subject): bool
    {
        return $subject instanceof CMSMain
            && $form->getName() === 'EditForm'
            && is_numeric($vars['ID'] ?? null)
            && (int) $vars['ID'] > 0
            && ShellSubmission::isShellSubmission($request);
    }

    private function errorResponse(HTTPResponse $result): HTTPResponse
    {
        $code = $result->getStatusCode();
        $reauthenticate = $result->getHeader('X-Reauthenticate');
        $message = match (true) {
            $code === 403 && (bool) $reauthenticate => ShellSubmission::loggedOutMessage(),
            $code === 403 => EditFormSubmissionExtension::permissionMessage(),
            default => trim(strip_tags((string) $result->getBody())) ?: $result->getStatusDescription(),
        };
        $response = ShellSubmission::jsonError($code, (string) $message);
        if ($reauthenticate) {
            $response->addHeader('X-Reauthenticate', $reauthenticate);
        }
        return $response;
    }

    private function successResponse(CMSMain $controller, Form $form, int $id): HTTPResponse
    {
        $message = $this->statusMessage($controller->getResponse());
        $form->clearMessage();
        $form->clearFormState();

        $record = DataObject::get($controller->getModelClass())->byID($id);
        if (!$record) {
            return HTTPResponse::create(json_encode(['deleted' => true, 'message' => $message]))
                ->addHeader('Content-Type', 'application/json')
                ->addHeader('Cache-Control', 'no-store');
        }

        $freshForm = $controller->getEditForm($id);
        $envelope = [
            'record' => [
                'id' => (int) $record->ID,
                'className' => $record->ClassName,
                'title' => $record->getTitle(),
                'singularName' => $record->i18n_singular_name(),
                'link' => $record->hasMethod('CMSEditLink') ? $record->CMSEditLink() : null,
            ],
            'deleted' => false,
            'message' => $message,
        ];
        return $controller
            ->getSchemaResponse(EditFormSubmissionExtension::schemaId($controller, $freshForm), $freshForm, null, $envelope)
            ->addHeader('Cache-Control', 'no-store');
    }

    private function statusMessage(HTTPResponse $response): string
    {
        $status = rawurldecode((string) $response->getHeader('X-Status'));
        return trim(html_entity_decode(strip_tags($status), ENT_QUOTES | ENT_HTML5));
    }
}
