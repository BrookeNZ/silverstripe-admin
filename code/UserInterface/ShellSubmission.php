<?php

namespace SilverStripe\Admin\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\FormAction;
use SilverStripe\Forms\Schema\FormSchema;
use SilverStripe\Security\CMSSecurity;
use SilverStripe\Security\Security;
use SilverStripe\Security\SecurityToken;

/**
 * What the shell's server endpoints have in common: recognising a shell request, the JSON error envelope
 * (AdminController::jsonError()'s, built without throwing, with a `reason` and an optional `field`), the
 * refusals for a failed access or token check, wrapping a plain-text error in the envelope, the messages the
 * forms answer with, and the check for an action a form withholds.
 *
 * AdminController::jsonError() is not used because it reads an undefined $request, which raises a warning that
 * dev mode prints into the JSON body.
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
     * @param string|null $reason Defaults to the reason the page endpoints give the same status
     * @param string|null $field The request parameter or body key at fault
     * @param array<string, string> $headers
     */
    public static function jsonError(
        int $code,
        string $message,
        ?string $reason = null,
        ?string $field = null,
        array $headers = []
    ): HTTPResponse {
        $error = [
            'type' => 'error',
            'code' => $code,
            'value' => $message,
            'reason' => $reason ?? static::defaultReason($code),
        ];
        if ($field !== null) {
            $error['field'] = $field;
        }
        $response = static::jsonResponse($code, ['status' => 'error', 'errors' => [$error]]);
        foreach ($headers as $name => $value) {
            $response->addHeader($name, $value);
        }
        return $response;
    }

    /**
     * @param array<string, string> $headers
     */
    public static function jsonException(
        int $code,
        string $message,
        ?string $reason = null,
        ?string $field = null,
        array $headers = []
    ): HTTPResponse_Exception {
        return new HTTPResponse_Exception(static::jsonError($code, $message, $reason, $field, $headers));
    }

    /**
     * Sent `no-store`: every answer depends on the member and the moment
     */
    public static function jsonResponse(int $code, array $data, int $flags = 0): HTTPResponse
    {
        return HTTPResponse::create(json_encode($data, $flags | JSON_THROW_ON_ERROR), $code)
            ->addHeader('Content-Type', 'application/json')
            ->addHeader('Cache-Control', 'no-store');
    }

    /**
     * A JSON 403 for a request AdminController::init() refused, with `X-Reauthenticate` when nobody is
     * logged in, which Security::permissionFailure() sets for an XHR only
     */
    public static function refusal(string $deniedMessage, string $loggedOutMessage): HTTPResponse
    {
        if (Security::getCurrentUser()) {
            return static::jsonError(403, $deniedMessage);
        }
        $headers = CMSSecurity::singleton()->enabled() ? ['X-Reauthenticate' => '1'] : [];
        return static::jsonError(403, $loggedOutMessage, 'notLoggedIn', null, $headers);
    }

    /**
     * Null when the token passes. The framework redirects back for a stale token, which the shell cannot
     * follow, and answers plain text for a missing one; both become a JSON 400 in the framework's wording
     */
    public static function tokenFailure(HTTPRequest $request, SecurityToken $token): ?HTTPResponse
    {
        if ($token->checkRequest($request)) {
            return null;
        }
        $name = $token->getName();
        $sent = $request->postVar($name) || $request->getHeader('X-' . $name);
        return static::jsonError(
            400,
            $sent ? static::sessionExpiredMessage() : static::missingTokenMessage(),
            'invalidToken'
        );
    }

    /**
     * An error response in the JSON envelope: a JSON body is kept as it is, anything else is wrapped,
     * keeping the headers the shell acts on
     */
    public static function asJsonError(HTTPResponse $response, ?string $message = null): HTTPResponse
    {
        if (str_contains((string) $response->getHeader('Content-Type'), 'json')) {
            return $response;
        }
        $headers = array_filter([
            'X-Reauthenticate' => $response->getHeader('X-Reauthenticate'),
            'Allow' => $response->getHeader('Allow'),
        ]);
        return static::jsonError(
            $response->getStatusCode(),
            $message ?? static::errorText($response),
            null,
            null,
            $headers
        );
    }

    /**
     * The first line of a plain-text or HTML error body, or the status description when it has none
     */
    public static function errorText(HTTPResponse $response): string
    {
        $lines = preg_split('/\R/', trim(strip_tags((string) $response->getBody())));
        return trim($lines[0] ?? '') ?: (string) $response->getStatusDescription();
    }

    /**
     * An action's `X-Status` text, which LeftAndMain sends URL-encoded and may hold markup
     */
    public static function statusMessage(HTTPResponse $response): string
    {
        return static::plainText(rawurldecode((string) $response->getHeader('X-Status')));
    }

    public static function plainText(string $html): string
    {
        return trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5));
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
