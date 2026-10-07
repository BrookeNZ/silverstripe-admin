<?php

namespace SilverStripe\Admin\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Core\Extension;
use SilverStripe\Security\CMSSecurity;
use SilverStripe\Security\Security;

/**
 * Gives a shell request that AdminController::init() refused the JSON error envelope. Security::permissionFailure()
 * answers an XHR with a 403 ("Not logged in" as plain text with `X-Reauthenticate`, or an empty body for a member
 * without access) and any other request with a redirect to the login form, which a FormSchema request sent without
 * `X-Requested-With` cannot follow. Both become a JSON 403, with `X-Reauthenticate` when nobody is logged in. init()
 * returns before any action or form handler runs, so the form extensions never see these requests.
 *
 * @extends Extension<LeftAndMain>
 */
class ShellPermissionFailureExtension extends Extension
{
    protected function onAfterInit(): void
    {
        $controller = $this->getOwner();
        $response = $controller->getResponse();
        $member = Security::getCurrentUser();
        $refused = $response->getStatusCode() === 403 || (!$member && $response->isRedirect());
        if (!$refused
            || str_contains((string) $response->getHeader('Content-Type'), 'json')
            || !ShellSubmission::isShellRequest($controller->getRequest())
        ) {
            return;
        }
        $message = $member
            ? _t(__CLASS__ . '.NO_ACCESS', 'You do not have permission to open this section.')
            : ShellSubmission::loggedOutMessage();
        $json = ShellSubmission::jsonError(403, $message);
        $response->setStatusCode(403)->setBody($json->getBody())->removeHeader('Location');
        foreach ($json->getHeaders() as $name => $value) {
            $response->addHeader($name, $value);
        }
        if (!$member && CMSSecurity::singleton()->enabled()) {
            $response->addHeader('X-Reauthenticate', '1');
        }
    }
}
