<?php

namespace SilverStripe\Admin\UserInterface\LinkModal;

use SilverStripe\Admin\ModalController;
use SilverStripe\Admin\UserInterface\ShellSubmission;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\Form;

/**
 * The `insert` action of the link dialogs' forms, for the shell only: the form has passed its validator by
 * the time this runs, and the answer is its FormSchema state, which carries the values the server accepted.
 * The shell's HTML editor builds the link from that state; nothing is saved here.
 *
 * @extends Extension<ModalController>
 */
class ModalControllerShellExtension extends Extension
{
    private static array $allowed_actions = [
        'insert',
    ];

    public function insert(array $data, Form $form): HTTPResponse
    {
        if (!ShellSubmission::isShellSubmission($this->getOwner()->getRequest())) {
            return $this->getOwner()->httpError(404);
        }
        return $this->getOwner()->getSchemaResponse(static::schemaId($form), $form);
    }

    /**
     * The id the link form's schema endpoint gives the form (`admin/modals/linkModalFormSchema/<name>/<item>`)
     */
    public static function schemaId(Form $form): string
    {
        return static::schemaIdFor($form->FormAction());
    }

    public static function schemaIdFor(string $formAction): string
    {
        $path = parse_url($formAction, PHP_URL_PATH) ?: $formAction;
        return rtrim(preg_replace('#/linkModalForm/#', '/linkModalFormSchema/', $path, 1), '/');
    }
}
