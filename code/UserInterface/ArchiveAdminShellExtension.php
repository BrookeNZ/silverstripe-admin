<?php

namespace SilverStripe\Admin\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Control\Controller;
use SilverStripe\Control\Director;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\Form;
use SilverStripe\VersionedAdmin\ArchiveAdmin;

/**
 * Gives the shell the Archive section's legacy views instead of one model tab per versioned class: Pages,
 * Blocks and Files, then "Other", whose type dropdown (the archive pilet's ArchiveTypeField) loads the chosen
 * type. "Other" points at the type of the current request, else the dropdown's first type, so every type the
 * dropdown reaches is a model tab the shell resolves on that page load. A member who cannot view the section is
 * sent no tabs, as legacy's client config listed no classes.
 *
 * Departures: the Other tab opens the first other type's archive grid, where legacy's `?others=1` showed the type
 * dropdown over an empty list. A page navigation to legacy's `?others=1` URL is redirected to the Other tab.
 *
 * @extends Extension<ArchiveAdmin>
 */
class ArchiveAdminShellExtension extends Extension
{
    // The schemaComponent the archive pilet registers
    public const TYPE_FIELD_COMPONENT = 'ArchiveTypeField';

    protected function updateClientConfig(array &$clientConfig): void
    {
        $admin = $this->getOwner();
        $clientConfig['modelTabs'] = [];
        if (!$admin->canView()) {
            return;
        }
        $mainClasses = array_keys($admin->getVersionedModels('main', true));
        $otherClasses = array_keys($admin->getVersionedModels('other', true));
        $requested = $this->requestedClass();
        $otherClass = in_array($requested, $otherClasses, true) ? $requested : ($otherClasses[0] ?? null);

        foreach ($admin->getManagedModelTabs() as $tab) {
            $class = in_array($tab->ClassName, $mainClasses, true) ? $tab->ClassName : $otherClass;
            if ($class) {
                $clientConfig['modelTabs'][] = [
                    'tab' => str_replace('\\', '-', $class),
                    'title' => $tab->Title,
                ];
            }
        }
    }

    /**
     * The model tab segment of the current request's URL as a class name. The section config comes from a
     * singleton, and a shell page navigation below the tab never parses `$ModelClass`, so the URL is read
     */
    private function requestedClass(): string
    {
        $path = trim((string) Controller::curr()?->getRequest()->getURL(), '/') . '/';
        $prefix = trim(Director::makeRelative($this->getOwner()->Link()), '/') . '/';
        if (!str_starts_with($path, $prefix)) {
            return '';
        }
        return str_replace('-', '\\', explode('/', substr($path, strlen($prefix)))[0]);
    }

    protected function onAfterInit(): void
    {
        $admin = $this->getOwner();
        $request = $admin->getRequest();
        if (!LeftAndMain::config()->get('piral_shell')
            || $admin->getResponse()->isFinished()
            || !$request->isGET()
            || $request->isAjax()
            || !$request->getVar('others')
            || $request->param('ModelClass')
        ) {
            return;
        }
        $otherClass = array_key_first($admin->getVersionedModels('other', true));
        if ($otherClass) {
            $admin->redirect($admin->Link(str_replace('\\', '-', $otherClass)));
        }
    }

    protected function updateEditForm(Form $form): void
    {
        if (LeftAndMain::config()->get('piral_shell')) {
            $form->Fields()->dataFieldByName('OtherDropdown')?->setSchemaComponent(static::TYPE_FIELD_COMPONENT);
        }
    }
}
