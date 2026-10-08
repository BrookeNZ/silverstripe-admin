<?php

namespace SilverStripe\Admin\UserInterface\GridField;

use SilverStripe\Admin\UserInterface\ShellSubmission;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\FormRequestHandler;
use SilverStripe\Forms\GridField\GridFieldDetailForm_ItemRequest;
use SilverStripe\Model\ModelData;
use SilverStripe\ORM\DataObject;

/**
 * Answers a shell submission of a GridField detail form (see GridFieldItemSchemaExtension) with JSON.
 *
 * Before the action runs, the member's permission for it is checked and a refusal is a JSON 403: canEdit
 * to save a record, canCreate to save a new one, canDelete to delete or archive, canPublish to publish
 * and canUnpublish to unpublish. Publishing needs no canEdit, as in VersionedGridFieldItemRequest: without
 * it the form is read only, so the publish saves none of the posted values. The stock item requests leave
 * such an action out of the form, so GridFieldItemSchemaExtension usually refuses first; this covers item
 * requests that allow an action the form does not show. Creating without canCreate is refused for every
 * submission, legacy ones included (plain text for those), because the framework's doSave lets it through.
 *
 * The item request's actions end by rendering the form as a PJAX fragment or redirecting, and an XHR
 * without `X-Pjax` makes the fragment render fail, so the action runs with `X-Pjax: ValidationResult`
 * (the smallest fragment, as doDelete itself sets `X-Pjax` on the request) and its response is replaced
 * by the success envelope: `record` (GridFieldItemSchemaExtension::recordSummary(), whose `link` is
 * null once the record is no longer in the grid's list), `deleted`, `message` (the action's `X-Status`
 * text, else the message it left on the section's edit form, as versioned-admin's restore does) and, for a
 * record still in the list, the `state` of a form built afresh for the record. A new record answers 201
 * with a `Location` header. The form's session message is cleared, because the shell shows the message
 * itself. An error response the action returns rather than throws is passed on as the JSON error envelope.
 *
 * @extends Extension<FormRequestHandler>
 */
class GridFieldItemSubmissionExtension extends Extension
{
    private const PJAX_HEADER = 'X-Pjax';

    private bool $creating = false;

    protected function beforeCallFormHandler(HTTPRequest $request, string $funcName, array $vars, Form $form, $subject): void
    {
        $this->refuseCreateWithoutPermission($subject, $funcName);
        if (!$this->handles($request, $subject)) {
            return;
        }
        if (!$this->allows($subject, $subject->getRecord(), $funcName)) {
            throw GridFieldItemSchemaExtension::jsonError(403, GridFieldItemSchemaExtension::permissionMessage());
        }
        $this->creating = !$subject->getRecord()->ID;
        $request->addHeader(static::PJAX_HEADER, 'ValidationResult');
    }

    protected function afterCallFormHandler(HTTPRequest $request, string $funcName, array $vars, Form $form, $subject, &$result): void
    {
        if (!$this->handles($request, $subject)) {
            return;
        }
        $request->removeHeader(static::PJAX_HEADER);
        if ($result instanceof HTTPResponse && $result->isError()) {
            if (!str_contains((string) $result->getHeader('Content-Type'), 'application/json')) {
                $result = ShellSubmission::jsonError($result->getStatusCode(), ShellSubmission::errorText($result));
            }
            return;
        }
        $result = $this->successResponse($subject, $form);
    }

    /**
     * doSave checks canEdit on an unsaved record, not canCreate, and its read-only form still writes a blank one
     */
    private function refuseCreateWithoutPermission($subject, string $funcName): void
    {
        if (!$subject instanceof GridFieldDetailForm_ItemRequest
            || !in_array($funcName, ['doSave', 'doPublish'], true)
            || $subject->getRecord()->ID
            || GridFieldItemSchemaExtension::canCreate($subject, $subject->getRecord())
        ) {
            return;
        }
        $message = _t(__CLASS__ . '.CANNOT_CREATE', 'You do not have permission to create this record.');
        throw new HTTPResponse_Exception(
            ShellSubmission::isShellSubmission($subject->getRequest())
                ? ShellSubmission::jsonError(403, $message)
                : HTTPResponse::create($message, 403)
        );
    }

    private function handles(?HTTPRequest $request, $subject): bool
    {
        return $subject instanceof GridFieldDetailForm_ItemRequest
            && ShellSubmission::isShellSubmission($request)
            && GridFieldItemSchemaExtension::schemaController($subject);
    }

    private function allows(GridFieldDetailForm_ItemRequest $itemRequest, ModelData $record, string $action): bool
    {
        $canSave = $record->ID
            ? $this->can($record, 'canEdit')
            : GridFieldItemSchemaExtension::canCreate($itemRequest, $record);
        return match ($action) {
            'doSave' => $canSave,
            'doDelete', 'doArchive' => $this->can($record, 'canDelete'),
            'doPublish' => $this->can($record, 'canPublish'),
            'doUnpublish' => $this->can($record, 'canUnpublish'),
            default => true,
        };
    }

    private function can(ModelData $record, string $permission): bool
    {
        return $record->hasMethod($permission) && $record->$permission();
    }

    private function successResponse(GridFieldDetailForm_ItemRequest $itemRequest, Form $form): HTTPResponse
    {
        $controller = GridFieldItemSchemaExtension::schemaController($itemRequest);
        $record = $itemRequest->getRecord();
        $id = (int) ($record->ID ?: $record->OldID);
        $listed = $id ? $itemRequest->getGridField()->getList()->byID($id) : null;
        $inList = (bool) $listed;
        $deleted = !$id || !DataObject::get($record->ClassName)->byID($id);
        $editForm = $controller->hasMethod('getEditForm') ? $controller->getEditForm() : null;
        $message = $this->statusMessage($controller->getResponse()) ?: $this->sessionMessage($editForm);

        $form->clearMessage();
        $form->clearFormState();
        // doDelete and doRestore leave their message on the section's form, which the shell would show on its next load
        $editForm?->clearFormState();

        $envelope = [
            'record' => GridFieldItemSchemaExtension::recordSummary($itemRequest, $inList),
            'deleted' => $deleted,
            'message' => $message,
        ];
        if (!$inList) {
            $response = HTTPResponse::create(json_encode($envelope))
                ->addHeader('Content-Type', 'application/json');
        } else {
            // Loaded from the stored record, as the schema endpoint does: the saved object keeps the posted values
            $fresh = $itemRequest->ItemEditForm();
            $fresh->loadDataFrom($listed);
            $response = $controller->getSchemaResponse($itemRequest->Link('schema'), $fresh, null, $envelope);
        }
        $response->addHeader('Cache-Control', 'no-store');
        if ($this->creating && $inList) {
            $response->setStatusCode(201)->addHeader('Location', $itemRequest->Link('edit'));
        }
        return $response;
    }

    private function statusMessage(HTTPResponse $response): string
    {
        return $this->plainText(rawurldecode((string) $response->getHeader('X-Status')));
    }

    private function sessionMessage(?Form $editForm): string
    {
        foreach ($editForm?->getSessionValidationResult()?->getMessages() ?? [] as $message) {
            if (empty($message['fieldName']) && ($message['message'] ?? '') !== '') {
                return $this->plainText((string) $message['message']);
            }
        }
        return '';
    }

    private function plainText(string $html): string
    {
        return trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5));
    }
}
