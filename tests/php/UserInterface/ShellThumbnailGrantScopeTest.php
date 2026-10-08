<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\AssetAdmin\Model\ThumbnailGenerator;
use SilverStripe\Assets\Dev\TestAssetStore;
use SilverStripe\Assets\Image;
use SilverStripe\Control\Controller;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Forms\Schema\FormSchema;

class ShellThumbnailGrantScopeTest extends FunctionalTest
{
    protected $usesDatabase = true;

    private Image $image;

    protected function setUp(): void
    {
        parent::setUp();
        if (!class_exists(ThumbnailGenerator::class)) {
            $this->markTestSkipped('Needs silverstripe/asset-admin');
        }
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        TestAssetStore::activate('ShellThumbnailGrantScopeTest');
        $canvas = imagecreatetruecolor(120, 80);
        ob_start();
        imagepng($canvas);
        $this->image = Image::create();
        $this->image->setFromString((string) ob_get_clean(), 'ShellThumbnailGrantScopeTest/hero.png');
        $this->image->write();
    }

    protected function tearDown(): void
    {
        TestAssetStore::reset();
        parent::tearDown();
    }

    private function generator(): ThumbnailGenerator
    {
        return Injector::inst()->get(ThumbnailGenerator::class . '.assetadmin');
    }

    private function grantThumbnail(): string
    {
        $request = new HTTPRequest('GET', 'admin/pages/edit/schema/EditForm/1');
        $request->addHeader(FormSchema::SCHEMA_HEADER, 'schema,state,errors');
        $request->setSession($this->session());
        $controller = Controller::create();
        $controller->setRequest($request);
        $controller->pushCurrent();
        try {
            return $this->generator()->generateThumbnailLink($this->image, 60, 60);
        } finally {
            $controller->popCurrent();
        }
    }

    public function testTheThumbnailGrantAlsoOpensTheOriginalAndOtherVariants(): void
    {
        $this->logOut();
        $original = $this->image->getURL(false);
        $other = $this->image->ScaleWidth(30)->getURL(false);
        $this->assertContains($this->get($original)->getStatusCode(), [403, 404], 'No grant yet');

        $thumbnail = $this->grantThumbnail();
        $this->assertSame(200, $this->get($thumbnail)->getStatusCode());
        $this->assertSame(200, $this->get($original)->getStatusCode(), 'The grant is per file, not per variant');
        $this->assertSame(200, $this->get($other)->getStatusCode(), 'The grant is per file, not per variant');
    }

    public function testNoCurrentControllerFallsBackToTheParentWithoutAFatal(): void
    {
        $stack = [];
        while (Controller::curr()) {
            $stack[] = Controller::curr();
            Controller::curr()->popCurrent();
        }
        $this->assertNull(Controller::curr());
        try {
            $link = $this->generator()->generateThumbnailLink($this->image, 60, 60);
            $this->assertStringStartsWith('data:image/png;base64,', (string) $link);
        } finally {
            foreach (array_reverse($stack) as $controller) {
                $controller->pushCurrent();
            }
        }
    }
}
