<?php

namespace SilverStripe\Admin\UserInterface;

use SilverStripe\Admin\AdminController;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;

/**
 * Serves the pilet feed at admin/pilets for the Piral app shell.
 *
 * The body stays the Piral feed service shape, `{"items": [...]}`. The response carries an ETag of the body
 * and answers a matching If-None-Match with 304. It is sent `private, no-cache` rather than `no-store`: the
 * list depends on the member's permissions, so no shared cache may keep it, and the browser must revalidate
 * on every load, but it may keep a copy so the revalidation can come back as an empty 304.
 *
 * A request sent with `X-Requested-With: XMLHttpRequest` that fails the access check gets the shell's JSON 403
 * (ShellSubmission::refusal(), with `X-Reauthenticate` when nobody is logged in) instead of the framework's
 * plain-text 403. A plain request still gets the redirect to the login form.
 */
class PiletFeedController extends AdminController
{
    private static ?string $url_segment = 'pilets';

    private static string $url_rule = '/$Action';

    private static array $allowed_actions = [
        'index',
    ];

    private static string|array $required_permission_codes = 'CMS_ACCESS';

    protected function init()
    {
        parent::init();

        $response = $this->getResponse();
        if ($response->isError() && $this->getRequest()->isAjax()) {
            $this->setResponse(ShellSubmission::refusal('Permission denied', 'Not logged in'));
        }
    }

    public function index(HTTPRequest $request): HTTPResponse
    {
        $response = $this->jsonSuccess(200, ['items' => PiletFeed::singleton()->getItems()]);
        $etag = sprintf('"%s"', md5($response->getBody()));
        $response
            ->addHeader('ETag', $etag)
            ->addHeader('Cache-Control', 'private, no-cache');

        if ($this->etagMatches($request->getHeader('If-None-Match'), $etag)) {
            $response->setStatusCode(304)->setBody('');
            $response->removeHeader('Content-Type');
        }
        return $response;
    }

    /**
     * If-None-Match uses the weak comparison, and a proxy that compresses the body may have weakened the tag
     */
    private function etagMatches(?string $ifNoneMatch, string $etag): bool
    {
        if (!$ifNoneMatch) {
            return false;
        }
        foreach (explode(',', $ifNoneMatch) as $candidate) {
            $candidate = trim($candidate);
            if ($candidate === '*' || preg_replace('#^W/#', '', $candidate) === $etag) {
                return true;
            }
        }
        return false;
    }
}
