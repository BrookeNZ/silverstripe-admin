<?php

namespace SilverStripe\Admin\UserInterface\LinkModal;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\ModalController;
use SilverStripe\Admin\UserInterface\ShellSubmission;
use SilverStripe\Control\Controller;
use SilverStripe\Control\RequestHandler;
use SilverStripe\Core\Extension;
use SilverStripe\Core\Validation\ValidationResult;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\HasOneRelationFieldInterface;
use SilverStripe\Forms\TreeDropdownField;
use SilverStripe\ORM\DataObject;

/**
 * What the shell's HTML editor needs from the link dialogs' forms (ModalController::linkModalForm()).
 *
 * The legacy editor never posted these forms: it read the values on the client and wrote the link itself, so
 * the server's validators (an email address, required link text) only ran as their client-side copies. The
 * shell posts them with `action_insert`, answered by ModalControllerShellExtension::insert() with the form's
 * state, and a failed validation answers as FormSchema with the errors.
 *
 * Editing a link, the shell sends the link's current values as query parameters on the schema request; the
 * form's data fields load them, so the dialog opens filled in, and `editing` names the action "Save link".
 *
 * Departures: a tree field holding a record the member may not view keeps the id but answers no `valueObject`,
 * on the schema GET and on `action_insert`, so the dialog names no record for it where the framework's state
 * would give its title. The id stays so a description-only edit of a link to a restricted page keeps its
 * `[sitetree_link,id=N]`, as legacy did.
 *
 * @extends Extension<\SilverStripe\Admin\Forms\LinkFormFactory>
 */
class LinkFormShellExtension extends Extension
{
    protected function updateForm(Form $form, ?RequestHandler $controller, string $name, array $context): void
    {
        if (!$controller instanceof ModalController || !LeftAndMain::config()->get('piral_shell')) {
            return;
        }
        $action = Controller::join_links($controller->Link($name), $context['ItemID'] ?? 0);
        // The form only has its link text field (and requires it) when asked for one, so the post must ask too
        if (!empty($context['RequireLinkText'])) {
            $form->setFormAction(Controller::join_links($action, '?requireLinkText=1'));
        }
        $schemaId = ModalControllerShellExtension::schemaIdFor($action);
        $form->setValidationResponseCallback(function (ValidationResult $result) use ($form, $controller, $schemaId) {
            if (!ShellSubmission::isShellSubmission($controller->getRequest())) {
                return null;
            }
            static::withholdUnviewableRecords($form);
            return $controller->getSchemaResponse($schemaId, $form, $result);
        });

        $request = $controller->getRequest();
        if (!$request->isGET()) {
            return;
        }
        if ($request->getVar('editing')) {
            $form->Actions()->fieldByName('action_insert')?->setTitle(_t(__CLASS__ . '.SAVE_LINK', 'Save link'));
        }
        $fields = $form->Fields()->dataFields();
        $values = array_intersect_key($request->getVars(), $fields);
        unset($values[$form->getSecurityToken()->getName()]);
        foreach ($values as $name => $value) {
            // A record id, as the record would give it; the tree field matches its selected node by type
            if ($fields[$name] instanceof HasOneRelationFieldInterface && is_numeric($value)) {
                $values[$name] = (int) $value;
            }
        }
        if ($values) {
            $form->loadDataFrom($values);
        }
        static::withholdUnviewableRecords($form);
    }

    /**
     * Leaves the selected record's title out of each tree field's schema state when the member may not view
     * that record. The field keeps the id as its value. Call once the form holds its final values
     */
    public static function withholdUnviewableRecords(Form $form): void
    {
        foreach ($form->Fields()->dataFields() as $field) {
            if (!$field instanceof TreeDropdownField || !$field->getValue()) {
                continue;
            }
            $data = $field->getSchemaStateDefaults()['data'] ?? [];
            $viewable = function ($id) use ($field): bool {
                $record = DataObject::get($field->getSourceObject())->filter($field->getKeyField(), $id)->first();
                return (bool) $record?->canView();
            };
            if (isset($data['valueObject']['id']) && !$viewable($data['valueObject']['id'])) {
                unset($data['valueObject']);
            } elseif (isset($data['valueObjects'])) {
                $data['valueObjects'] = array_values(array_filter(
                    $data['valueObjects'],
                    fn ($item) => !isset($item['id']) || $viewable($item['id'])
                ));
            } else {
                continue;
            }
            $field->setSchemaState(['data' => $data]);
        }
    }
}
