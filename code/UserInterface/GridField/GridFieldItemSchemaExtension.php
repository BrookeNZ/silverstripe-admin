<?php

namespace SilverStripe\Admin\UserInterface\GridField;

use SilverStripe\Admin\FormSchemaController;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\UserInterface\ShellSubmission;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Core\Extension;
use SilverStripe\Core\Validation\ValidationResult;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\GridField\GridFieldDetailForm_ItemRequest;
use SilverStripe\Model\ModelData;

/**
 * Serves a GridField detail form to the Piral shell, at `GET <item link>/schema`, with the same
 * FormSchema envelope and shell decorations (component candidates, server HTML fallbacks) as a section's
 * EditForm. `<item link>/ItemEditForm/schema`, which FormRequestHandler already answers, skips those
 * decorations, so the shell does not use it.
 *
 * A shell submission is a POST to the form's own action with `X-Formschema-Request`. Before the form handles
 * one, three refusals answer JSON in place of the framework's: a failed CSRF check is a 400 (the framework
 * redirects back), a form that wants sudo mode is a 403 (the framework makes it read only, so a save would
 * answer "saved" and change nothing), and an action the form withholds is a 403 (the framework's is plain
 * text naming the controller class). A validation failure answers with the FormSchema state and errors
 * instead of a PJAX fragment. The success envelope is GridFieldItemSubmissionExtension's.
 *
 * A record the member cannot view answers the schema request with the same 404 as a missing one, so the
 * endpoint does not reveal which IDs exist.
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
            throw static::jsonError(404, _t(__CLASS__ . '.NO_SCHEMA', 'This form has no schema endpoint.'));
        }
        if (!$request->isGET()) {
            throw static::jsonError(405, _t(__CLASS__ . '.GET_ONLY', 'The schema endpoint only answers GET.'));
        }
        $record = $itemRequest->getRecord();
        if (!static::canOpen($itemRequest, $record)) {
            throw $record->ID
                ? static::jsonError(404, static::notFoundMessage())
                : static::jsonError(403, _t(__CLASS__ . '.CANNOT_CREATE', 'You do not have permission to create this record.'));
        }
        $form = $itemRequest->ItemEditForm();
        if (!$form instanceof Form) {
            throw static::jsonError(404, _t(__CLASS__ . '.NO_FORM', 'This record has no edit form.'));
        }
        return $controller->getSchemaResponse($itemRequest->Link('schema'), $form, null, [
            'record' => static::recordSummary($itemRequest, (bool) $record->ID),
        ]);
    }

    protected function updateItemEditForm(Form $form): void
    {
        $itemRequest = $this->getOwner();
        $controller = static::schemaController($itemRequest);
        if (!$controller || !ShellSubmission::isShellSubmission($itemRequest->getRequest())) {
            return;
        }
        $schemaId = $itemRequest->Link('schema');
        $form->setValidationResponseCallback(
            fn (ValidationResult $errors) => $controller->getSchemaResponse($schemaId, $form, $errors)
        );
    }

    /**
     * Runs once the form is built and before FormRequestHandler handles the post, where the framework's own
     * refusals would come from
     */
    protected function afterCallActionHandler(HTTPRequest $request, string $action, $result): void
    {
        if ($action !== 'ItemEditForm' || !$result instanceof Form || $request->remaining() !== '') {
            return;
        }
        if (!static::schemaController($this->getOwner()) || !ShellSubmission::isShellSubmission($request)) {
            return;
        }
        if (!$result->getSecurityToken()->checkRequest($request)) {
            throw static::jsonError(400, ShellSubmission::sessionExpiredMessage());
        }
        if (ShellSubmission::clickedAction($request) && $result->getFormRequiresSudoMode()) {
            throw static::jsonError(403, _t(
                __CLASS__ . '.SUDO_MODE',
                'Confirm your password before you change this record. The new admin cannot ask for it yet.'
            ));
        }
        if (!ShellSubmission::offersClickedAction($request, $result)) {
            throw static::jsonError(403, static::permissionMessage());
        }
    }

    public static function permissionMessage(): string
    {
        return _t(__CLASS__ . '.NO_PERMISSION', 'You do not have permission to do that to this record.');
    }

    public static function notFoundMessage(): string
    {
        return _t(__CLASS__ . '.NOT_FOUND', 'That record was not found.');
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
     * for "New <name>", the class for the records-changed event, the edit link, which is null for a
     * new record or one no longer in the grid's list, and for a nested record its parent's title
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
            'parentTitle' => static::parentTitle($itemRequest),
        ];
    }

    /**
     * The title of the record whose form holds this record's grid, for the shell's back link
     */
    private static function parentTitle(GridFieldDetailForm_ItemRequest $itemRequest): ?string
    {
        $parent = $itemRequest->getController();
        if (!$parent instanceof GridFieldDetailForm_ItemRequest) {
            return null;
        }
        $record = $parent->getRecord();
        return $record->hasMethod('getTitle') ? (string) $record->getTitle() : null;
    }

    public static function jsonError(int $code, string $message): HTTPResponse_Exception
    {
        return new HTTPResponse_Exception(ShellSubmission::jsonError($code, $message));
    }
}
