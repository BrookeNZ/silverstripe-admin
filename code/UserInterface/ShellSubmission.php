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
 * throwing, with the `reason` key PageTreeController's envelope carries), the messages both answer with, and
 * the check for an action the form withholds.
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

    /**
     * Any request carrying FormSchema parts while the shell is on: a schema GET or a shell submission
     */
    public static function isFormSchemaRequest(?HTTPRequest $request): bool
    {
        return $request
            && $request->getHeader(FormSchema::SCHEMA_HEADER)
            && LeftAndMain::config()->get('piral_shell');
    }

    /**
     * @param string|null $reason Defaults to the reason PageTreeController gives the same status
     */
    public static function jsonError(int $code, string $message, ?string $reason = null): HTTPResponse
    {
        $body = json_encode([
            'status' => 'error',
            'errors' => [[
                'type' => 'error',
                'code' => $code,
                'value' => $message,
                'reason' => $reason ?? static::defaultReason($code),
            ]],
        ]);
        return HTTPResponse::create($body, $code)
            ->addHeader('Content-Type', 'application/json')
            ->addHeader('Cache-Control', 'no-store');
    }

    /**
     * The first line of a plain-text or HTML error body, or the status description when it has none
     */
    public static function errorText(HTTPResponse $response): string
    {
        $lines = preg_split('/\R/', trim(strip_tags((string) $response->getBody())));
        return trim($lines[0] ?? '') ?: (string) $response->getStatusDescription();
    }

    private static function defaultReason(int $code): string
    {
        return match (true) {
            $code === 400 => 'invalid',
            $code === 403 => 'forbidden',
            $code === 404 => 'notFound',
            $code === 405 => 'methodNotAllowed',
            $code >= 500 => 'serverError',
            default => 'error',
        };
    }

    /**
     * The framework's own wording for a stale token, which it shows after redirecting back
     */
    public static function sessionExpiredMessage(): string
    {
        return _t(Form::class . '.CSRF_EXPIRED_MESSAGE', 'Your session has expired. Please re-submit the form.');
    }

    /**
     * The framework's wording for a submission sent with no token at all
     */
    public static function missingTokenMessage(): string
    {
        return _t(
            Form::class . '.CSRF_FAILED_MESSAGE',
            'There seems to have been a technical problem. Please click the back button, '
            . 'refresh your browser, and try again.'
        );
    }

    /**
     * Legacy refuses an action the form does not offer as "not allowed", not as a permission failure
     */
    public static function actionNotAvailableMessage(): string
    {
        return _t(
            __CLASS__ . '.ACTION_NOT_AVAILABLE',
            'That action is no longer available for this page. Reload to see its current actions.'
        );
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

    /**
     * The clicked `action_*` name, without the query string or image button `_x`/`_y` suffix that
     * FormRequestHandler::httpSubmission() also strips
     */
    public static function clickedAction(HTTPRequest $request): ?string
    {
        foreach (array_keys($request->postVars()) as $name) {
            if (str_starts_with((string) $name, 'action_')) {
                $name = explode('?', (string) $name, 2)[0];
                return (string) preg_replace('/_x$|_y$/', '', $name);
            }
        }
        return null;
    }
}
