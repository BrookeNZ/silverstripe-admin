<?php

namespace SilverStripe\Admin\UserInterface;

use Psr\Log\LoggerInterface;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Control\Director;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Core\Extension;
use SilverStripe\Core\Injector\Injector;
use Throwable;

/**
 * Gives an error that escapes a shell FormSchema request (a schema GET or a shell submission) the JSON error
 * envelope. The form extensions only see what an action returns, so an action that throws, such as CMSMain's
 * "Bad record ID" 404, or anything else that ends the request early, answers the framework's plain text or an
 * uncaught exception. Both arrive here through LeftAndMain::handleRequest()'s `updateRequestResponse`.
 * A 404 raised through httpError() during a schema GET is already JSON, from SchemaRequestErrorExtension.
 *
 * Departures: an uncaught exception is logged and answered as a 500, with its message only in dev, where legacy
 * leaves it to the framework's error handler.
 *
 * @extends Extension<LeftAndMain>
 */
class ShellErrorResponseExtension extends Extension
{
    protected function updateRequestResponse(
        HTTPRequest $request,
        ?HTTPResponse &$response,
        ?Throwable $exception = null
    ): void {
        if (!ShellSubmission::isFormSchemaRequest($request)) {
            return;
        }
        if ($exception instanceof HTTPResponse_Exception) {
            $response = $exception->getResponse();
        } elseif ($exception) {
            Injector::inst()->get(LoggerInterface::class)->error($exception->getMessage(), ['exception' => $exception]);
            $response = ShellSubmission::jsonError(500, $this->serverErrorMessage($exception->getMessage()));
            return;
        }
        if (!$response
            || !$response->isError()
            || str_contains((string) $response->getHeader('Content-Type'), 'json')
        ) {
            return;
        }
        $response = $this->envelope($response);
    }

    private function envelope(HTTPResponse $response): HTTPResponse
    {
        $code = $response->getStatusCode();
        $text = ShellSubmission::errorText($response);
        $message = $code >= 500 ? $this->serverErrorMessage($text) : $text;
        $json = ShellSubmission::jsonError($code, $message);
        foreach (['X-Reauthenticate', 'Allow'] as $header) {
            if ($response->getHeader($header)) {
                $json->addHeader($header, $response->getHeader($header));
            }
        }
        return $json;
    }

    private function serverErrorMessage(string $detail): string
    {
        return Director::isDev() && $detail !== ''
            ? $detail
            : _t(__CLASS__ . '.SERVER_ERROR', 'Something went wrong on the server. Try again, or reload the page.');
    }
}
