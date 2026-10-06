<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;

class PiralShellNavigationTest extends FunctionalTest
{
    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $this->logInWithPermission('ADMIN');
    }

    public function testPageNavigationsRenderTheShellWhateverTheAction(): void
    {
        $urls = [
            'admin/shell/',
            'admin/shell/hello/',
            'admin/security/',
            'admin/security/users/EditForm/field/users/item/1/edit/',
            'admin/security/EditForm/field/Members/item/1/edit/',
            'admin/settings/EditForm/field/SocialLinks/item/1/edit/',
            'admin/nothing-here/',
        ];
        foreach ($urls as $url) {
            $response = $this->get($url, null, ['Accept' => 'text/html']);

            $this->assertSame(200, $response->getStatusCode(), $url);
            $this->assertStringContainsString('id="ss-admin-shell"', $response->getBody(), $url);
            $this->assertStringNotContainsString('client/dist/js/bundle.js', $response->getBody(), $url);
        }
    }

    public function testDataRequestsKeepTheirActions(): void
    {
        $response = $this->get('admin/pilets/', null, ['Accept' => 'application/json']);

        $this->assertSame('application/json', $response->getHeader('Content-Type'));
        $this->assertStringNotContainsString('ss-admin-shell', $response->getBody());
    }
}
