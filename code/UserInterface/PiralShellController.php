<?php

namespace SilverStripe\Admin\UserInterface;

use SilverStripe\Admin\LeftAndMain;

/**
 * A blank CMS section at admin/shell, the stable entry URL for the Piral app shell. With the flag on
 * every LeftAndMain section renders the shell, so this one exists to have a URL that carries no
 * legacy section behaviour
 */
class PiralShellController extends LeftAndMain
{
    private static ?string $url_segment = 'shell';

    private static bool $ignore_menuitem = true;

    private static bool $skip_permission_generation = true;

    private static string|array $required_permission_codes = 'CMS_ACCESS_LeftAndMain';
}
