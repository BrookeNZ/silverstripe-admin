<?php

namespace SilverStripe\Admin\UserInterface\LinkModal;

use SilverStripe\Admin\Forms\LinkFormFactory;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\UserInterface\ShellSubmission;
use SilverStripe\AssetAdmin\Controller\AssetAdmin;
use SilverStripe\Assets\File;
use SilverStripe\Assets\Folder;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Control\RequestHandler;
use SilverStripe\Forms\CheckboxField;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\FormFactory;
use SilverStripe\Forms\TextField;
use SilverStripe\Forms\Validation\RequiredFieldsValidator;
use SilverStripe\Security\Permission;

/**
 * The shell editor's "Link to a file" form. The legacy editor picked the file in asset-admin's gallery modal
 * and then loaded `fileEditorLinkForm`; until the shell has a file picker, the file is chosen from the files
 * tree, where folders open but cannot be chosen.
 *
 * Only for the shell and a member who may use the Files section, as the gallery was; the tree lists only what
 * the member may view. LeftAndMainLinkFormsExtension leaves it out of the client config otherwise.
 *
 * Departures: the form is built here, not by asset-admin's FileFormFactory with its insert-link context, so
 * extensions of FileFormFactory (`updateFormFields`, `updateFormActions`, `updateForm`) do not run on it.
 * Extend this factory instead.
 */
class FileLinkFormFactory extends LinkFormFactory
{
    public const NAME = 'EditorFileLink';

    public static function isAvailable(): bool
    {
        return LeftAndMain::config()->get('piral_shell')
            && class_exists(AssetAdmin::class)
            && Permission::check('CMS_ACCESS_AssetAdmin');
    }

    public function getForm(?RequestHandler $controller = null, $name = FormFactory::DEFAULT_NAME, $context = [])
    {
        if (!static::isAvailable()) {
            $message = _t(__CLASS__ . '.NOT_AVAILABLE', 'Linking to a file is not available');
            throw new HTTPResponse_Exception(
                ShellSubmission::isShellRequest($controller?->getRequest())
                    ? ShellSubmission::jsonError(403, $message)
                    : $message,
                403
            );
        }
        return parent::getForm($controller, $name, $context);
    }

    protected function getFormFields($controller, $name, $context)
    {
        $fields = FieldList::create([
            ViewableTreeDropdownField::create('FileID', _t(__CLASS__ . '.SELECT_FILE', 'Select a file'), File::class)
                ->setTitleField('Name')
                ->setHasEmptyDefault(true)
                ->setDisableFunction(fn ($node) => $node instanceof Folder)
                ->setFilterFunction(fn ($node) => $node->canView()),
            TextField::create('Description', _t(__CLASS__ . '.LINKDESCR', 'Link description')),
            CheckboxField::create('TargetBlank', _t(__CLASS__ . '.LINKOPENNEWWIN', 'Open in new window/tab')),
        ]);

        if ($context['RequireLinkText']) {
            $fields->insertAfter('FileID', TextField::create('Text', _t(__CLASS__ . '.LINKTEXT', 'Link text')));
        }

        $this->extend('updateFormFields', $fields, $controller, $name, $context);

        return $fields;
    }

    protected function getValidator($controller, $name, $context)
    {
        return RequiredFieldsValidator::create($context['RequireLinkText'] ? ['FileID', 'Text'] : ['FileID']);
    }
}
