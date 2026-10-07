<?php

namespace SilverStripe\Admin\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\FormAction;
use SilverStripe\Forms\Schema\FormSchema;

/**
 * What the shell's form handling has in common across the page edit form (CMSMain) and GridField record
 * forms: recognising a shell request, the JSON error envelope (AdminController::jsonError()'s, built without
 * throwing), the messages both answer with, and the check for an action the form withholds.
 */
final class ShellSubmission
{
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
     * Any request the shell's code sends while the shell is on: a FormSchema request or an XHR
     */
    public static function isShellRequest(?HTTPRequest $request): bool
    {
        return $request
            && ($request->getHeader(FormSchema::SCHEMA_HEADER) || $request->isAjax())
            && LeftAndMain::config()->get('piral_shell');
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

    /**
     * The framework's own wording for a stale token, which it shows after redirecting back
     */
    public static function sessionExpiredMessage(): string
    {
        return _t(Form::class . '.CSRF_EXPIRED_MESSAGE', 'Your session has expired. Please re-submit the form.');
    }

    public static function loggedOutMessage(): string
    {
        return _t(__CLASS__ . '.LOGGED_OUT', 'Your session has ended. Log in again to continue.');
    }

    /**
     * Whether the clicked `action_*` is one the form offers. The framework leaves out an action the member
     * may not run and refuses it with a plain-text 403 naming the controller class
     */
    public static function offersClickedAction(HTTPRequest $request, Form $form): bool
    {
        $clicked = static::clickedAction($request);
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

    public static function clickedAction(HTTPRequest $request): ?string
    {
        foreach (array_keys($request->postVars()) as $name) {
            if (str_starts_with((string) $name, 'action_')) {
                return (string) $name;
            }
        }
        return null;
    }
}
