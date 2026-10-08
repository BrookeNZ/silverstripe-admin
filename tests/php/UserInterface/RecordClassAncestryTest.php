<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use Page;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\UserInterface\RecordClassAncestry;
use SilverStripe\Assets\File;
use SilverStripe\Assets\Folder;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\SapphireTest;
use SilverStripe\ORM\DataObject;

class RecordClassAncestryTest extends SapphireTest
{
    protected $usesDatabase = true;

    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
    }

    public function testTheClientConfigMapsPageToItsAncestorsUpToDataObject(): void
    {
        if (!class_exists(Page::class)) {
            $this->markTestSkipped('The site has no Page class');
        }
        $config = $this->combinedClientConfig();

        $this->assertArrayHasKey('recordClasses', $config);
        $ancestors = $config['recordClasses'][Page::class];
        $this->assertContains(SiteTree::class, $ancestors);
        $this->assertSame(DataObject::class, end($ancestors));
        $this->assertNotContains(Page::class, $ancestors);
    }

    public function testFolderWithoutItsOwnTableIsMappedToFile(): void
    {
        $map = RecordClassAncestry::create()->getMap();

        $this->assertSame([File::class, DataObject::class], $map[Folder::class]);
    }

    public function testLegacyClientConfigHasNoMap(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);

        $this->assertArrayNotHasKey('recordClasses', $this->combinedClientConfig());
    }

    private function combinedClientConfig(): array
    {
        $this->logInWithPermission('ADMIN');
        $request = (new HTTPRequest('GET', 'admin'))->setSession(new Session([]));
        Injector::inst()->registerService($request, HTTPRequest::class);
        return json_decode(LeftAndMain::create()->getCombinedClientConfig(), true, 512, JSON_THROW_ON_ERROR);
    }
}
