<?php

namespace SilverStripe\Admin\UserInterface;

use SilverStripe\Admin\AdminController;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;

/**
 * Serves the pilet feed at admin/pilets for the Piral app shell
 */
class PiletFeedController extends AdminController
{
    private static ?string $url_segment = 'pilets';

    private static string $url_rule = '/$Action';

    private static array $allowed_actions = [
        'index',
    ];

    private static string|array $required_permission_codes = 'CMS_ACCESS';

    public function index(HTTPRequest $request): HTTPResponse
    {
        $body = json_encode(['items' => PiletFeed::singleton()->getItems()], JSON_THROW_ON_ERROR);

        return HTTPResponse::create($body)
            ->addHeader('Content-Type', 'application/json')
            ->addHeader('Cache-Control', 'no-store');
    }
}
