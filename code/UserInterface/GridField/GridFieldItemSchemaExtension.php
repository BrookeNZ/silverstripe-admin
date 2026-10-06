<?php

namespace SilverStripe\Admin\UserInterface\GridField;

use SilverStripe\Admin\FormSchemaController;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Core\Extension;
use SilverStripe\Core\Validation\ValidationResult;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\GridField\GridFieldDetailForm_ItemRequest;
use SilverStripe\Forms\Schema\FormSchema;
use SilverStripe\Model\ModelData;

/**
 * Serves a GridField detail form to the Piral shell, at `GET <item link>/schema`, with the same
 * FormSchema envelope and shell decorations (component candidates, server HTML fallbacks) as a section's
 * EditForm. `<item link>/ItemEditForm/schema`, which FormRequestHandler already answers, skips those
 * decorations, so the shell does not use it.
 *
 * A shell submission is a POST to the form's own action with `X-Formschema-Request`. For one, the CSRF
 * token is checked up front (a failure is a JSON 400 rather than the framework's redirect back) and a
 * validation failure answers with the FormSchema state and errors instead of a PJAX fragment. The
 * success envelope is GridFieldItemSubmissionExtension's.
 *
 * Only while `LeftAndMain.piral_shell` is on and the grid sits under a FormSchemaController.
 *
 * @extends Extension<GridFieldDetailForm_ItemRequest>
 */
class GridFieldItemSchemaExtension extends Extension
{
    private static array $allowed_actions = [
        'schema',
    ];

    public function schema(HTTPRequest $request): HTTPResponse
    {
        $itemRequest = $this->getOwner();
        $controller = static::schemaController($itemRequest);
        if (!$controller || !LeftAndMain::config()->get('piral_shell')) {
            throw static::jsonError(404, 'This form has no schema endpoint');
        }
        if (!$request->isGET()) {
            throw static::jsonError(405, 'The schema endpoint only answers GET');
        }
        $record = $itemRequest->getRecord();
        if (!static::canOpen($itemRequest, $record)) {
            throw static::jsonError(403, $record->ID ? 'You cannot view this record' : 'You cannot create this record');
        }
        $form = $itemRequest->ItemEditForm();
        if (!$form instanceof Form) {
            throw static::jsonError(404, 'This record has no edit form');
        }
        return $controller->getSchemaResponse($itemRequest->Link('schema'), $form, null, [
            'record' => static::recordSummary($itemRequest, (bool) $record->ID),
        ]);
    }

    protected function updateItemEditForm(Form $form): void
    {
        $itemRequest = $this->getOwner();
        $request = $itemRequest->getRequest();
        $controller = static::schemaController($itemRequest);
        if (!$controller || !static::isShellSubmission($request)) {
            return;
        }
        if (!$form->getSecurityToken()->checkRequest($request)) {
            throw static::jsonError(400, 'The security token is missing or has expired');
        }
        $schemaId = $itemRequest->Link('schema');
        $form->setValidationResponseCallback(
            fn (ValidationResult $errors) => $controller->getSchemaResponse($schemaId, $form, $errors)
        );
    }

    /**
     * A form submission from the shell: a POST asking for FormSchema parts while the shell is on
     */
    public static function isShellSubmission(?HTTPRequest $request): bool
    {
        return $request
            && $request->isPOST()
            && $request->getHeader(FormSchema::SCHEMA_HEADER)
            && LeftAndMain::config()->get('piral_shell');
    }

    /**
     * The controller at the top of a (possibly nested) detail form chain, when it can send FormSchema
     */
    public static function schemaController(GridFieldDetailForm_ItemRequest $itemRequest): ?FormSchemaController
    {
        $controller = $itemRequest->getController();
        while ($controller instanceof GridFieldDetailForm_ItemRequest) {
            $controller = $controller->getController();
        }
        return $controller instanceof FormSchemaController ? $controller : null;
    }

    /**
     * canView for a saved record, canCreate in the grid's create context for a new one
     */
    public static function canOpen(GridFieldDetailForm_ItemRequest $itemRequest, ModelData $record): bool
    {
        if ($record->ID) {
            return !$record->hasMethod('canView') || $record->canView();
        }
        return static::canCreate($itemRequest, $record);
    }

    public static function canCreate(GridFieldDetailForm_ItemRequest $itemRequest, ModelData $record): bool
    {
        if (!$record->hasMethod('canCreate')) {
            return false;
        }
        // getCreateContext() is protected; it carries the parent record for a has_many list
        $context = (fn () => $this->getCreateContext())->call($itemRequest);
        return (bool) $record->canCreate(null, $context);
    }

    /**
     * What the shell shows of the record beside its form: the section header's title, the singular name
     * for "New <name>", the class for the records-changed event, and the edit link, which is null for a
     * new record or one no longer in the grid's list
     */
    public static function recordSummary(GridFieldDetailForm_ItemRequest $itemRequest, bool $inList): array
    {
        $record = $itemRequest->getRecord();
        $id = (int) ($record->ID ?: $record->OldID);
        return [
            'id' => $id ?: null,
            'className' => get_class($record),
            'title' => $record->ID && $record->hasMethod('getTitle') ? (string) $record->getTitle() : null,
            'singularName' => $record->hasMethod('i18n_singular_name') ? $record->i18n_singular_name() : null,
            'link' => $inList ? $itemRequest->Link('edit') : null,
        ];
    }

    /**
     * The envelope AdminController::jsonError() sends, built here because an item request is no controller
     */
    public static function jsonError(int $code, string $message): HTTPResponse_Exception
    {
        $body = json_encode([
            'status' => 'error',
            'errors' => [['type' => 'error', 'code' => $code, 'value' => $message]],
        ]);
        $response = HTTPResponse::create($body, $code)
            ->addHeader('Content-Type', 'application/json')
            ->addHeader('Cache-Control', 'no-store');
        return new HTTPResponse_Exception($response);
    }
}
