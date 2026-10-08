<?php

namespace SilverStripe\Admin\UserInterface\LinkModal;

use SilverStripe\Admin\ModalController;
use SilverStripe\Admin\UserInterface\ShellSubmission;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\Form;

/**
 * The `insert` action of the link dialogs' forms, for the shell only: the form has passed its validator by
 * the time this runs, and the answer is its FormSchema state, which carries the values the server accepted.
 * The shell's HTML editor builds the link from that state; nothing is saved here.
 *
 * `insert` is not in `allowed_actions`: FormRequestHandler runs a controller method named by one of the form's
 * actions without it, and listing it would also route `admin/modals/insert`.
 *
 * A shell request is refused in the JSON error envelope, including a post whose security token fails, which the
 * framework answers with plain text or a redirect back.
 *
 * @extends Extension<ModalController>
 */
class ModalControllerShellExtension extends Extension
{
    public function insert(array $data, Form $form): HTTPResponse
    {
        $request = $this->getOwner()->getRequest();
        if (!ShellSubmission::isShellSubmission($request)) {
            if (ShellSubmission::isShellRequest($request)) {
                return ShellSubmission::jsonError(404, _t(__CLASS__ . '.NOT_FOUND', 'Not found'));
            }
            return $this->getOwner()->httpError(404);
        }
        LinkFormShellExtension::withholdUnviewableRecords($form);
        return $this->getOwner()->getSchemaResponse(static::schemaId($form), $form);
    }

    /**
     * Runs once the link form is built and before FormRequestHandler checks the post's security token
     */
    protected function afterCallActionHandler(HTTPRequest $request, string $action, $result): ?HTTPResponse
    {
        if ($action !== 'linkModalForm'
            || !$result instanceof Form
            || $request->remaining() !== ''
            || !ShellSubmission::isShellSubmission($request)
        ) {
            return null;
        }
        return ShellSubmission::tokenFailure($request, $result->getSecurityToken());
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
