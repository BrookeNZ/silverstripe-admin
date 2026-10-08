<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\AssetAdmin\Forms\UploadField;
use SilverStripe\AssetAdmin\Model\ThumbnailGenerator;
use SilverStripe\Assets\Dev\TestAssetStore;
use SilverStripe\Assets\Flysystem\FlysystemAssetStore;
use SilverStripe\Assets\Image;
use SilverStripe\Assets\Storage\AssetStore;
use SilverStripe\Control\Controller;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Forms\Schema\FormSchema;

class ShellThumbnailGeneratorTest extends FunctionalTest
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
        TestAssetStore::activate('ShellThumbnailGeneratorTest');
        $this->image = Image::create();
        $this->image->setFromString($this->png(), 'ShellThumbnailGeneratorTest/hero.png');
        $this->image->write();
    }

    protected function tearDown(): void
    {
        TestAssetStore::reset();
        parent::tearDown();
    }

    public function testAnUploadFieldSchemaLinksAProtectedThumbnailByUrlOnlyForTheShell(): void
    {
        $this->logInWithPermission('ADMIN');
        $field = UploadField::create('Hero')->setValue($this->image);

        $shell = $this->during($this->request(true), fn () => $field->getSchemaStateDefaults());
        $legacy = $this->during($this->request(false), fn () => $field->getSchemaStateDefaults());

        $this->assertStringStartsWith('/assets/', $shell['data']['files'][0]['thumbnail']);
        $this->assertStringStartsWith('data:image/png;base64,', $legacy['data']['files'][0]['thumbnail']);
    }

    public function testAShellSchemaRequestLinksAProtectedThumbnailByUrl(): void
    {
        $this->assertSame(AssetStore::VISIBILITY_PROTECTED, $this->image->getVisibility());
        $session = new Session([]);

        $link = $this->linkDuring($this->request(true, $session));

        $this->assertStringStartsWith('/assets/', $link);
        $this->assertStringNotContainsString('data:', $link);
        $this->assertNotEmpty($session->get(FlysystemAssetStore::GRANTS_SESSION));
    }

    public function testALegacyRequestKeepsTheInlineThumbnail(): void
    {
        $this->assertStringStartsWith('data:image/png;base64,', $this->linkDuring($this->request(false)));

        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);
        $this->assertStringStartsWith('data:image/png;base64,', $this->linkDuring($this->request(true)));
    }

    public function testOnlyTheGrantedSessionMayFetchTheThumbnail(): void
    {
        $this->logOut();
        $link = $this->linkDuring($this->request(true, new Session([])));

        $this->assertContains($this->get($link)->getStatusCode(), [403, 404], 'Another session has no grant');

        $this->linkDuring($this->request(true, $this->session()));
        $response = $this->get($link);
        $this->assertSame(200, $response->getStatusCode());
        $this->assertStringStartsWith('image/png', (string) $response->getHeader('Content-Type'));
    }

    private function linkDuring(HTTPRequest $request): ?string
    {
        return $this->during(
            $request,
            fn () => Injector::inst()
                ->get(ThumbnailGenerator::class . '.assetadmin')
                ->generateThumbnailLink($this->image, 60, 60)
        );
    }

    private function during(HTTPRequest $request, callable $callback): mixed
    {
        $controller = Controller::create();
        $controller->setRequest($request);
        $controller->pushCurrent();
        try {
            return $callback();
        } finally {
            $controller->popCurrent();
        }
    }

    private function request(bool $schema, ?Session $session = null): HTTPRequest
    {
        $request = new HTTPRequest('GET', 'admin/pages/edit/schema/EditForm/1');
        if ($schema) {
            $request->addHeader(FormSchema::SCHEMA_HEADER, 'schema,state,errors');
        }
        $request->setSession($session ?? new Session([]));
        return $request;
    }

    private function png(): string
    {
        $canvas = imagecreatetruecolor(120, 80);
        ob_start();
        imagepng($canvas);
        return (string) ob_get_clean();
    }
}
