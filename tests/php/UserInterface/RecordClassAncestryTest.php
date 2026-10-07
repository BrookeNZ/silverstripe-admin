<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use Page;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\Session;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\SapphireTest;
use SilverStripe\ORM\DataObject;

class RecordClassAncestryTest extends SapphireTest
{
    protected $usesDatabase = true;

    public function testTheClientConfigMapsPageToItsAncestorsUpToDataObject(): void
    {
        if (!class_exists(Page::class)) {
            $this->markTestSkipped('The site has no Page class');
        }
        $this->logInWithPermission('ADMIN');
        $request = (new HTTPRequest('GET', 'admin'))->setSession(new Session([]));
        Injector::inst()->registerService($request, HTTPRequest::class);
        $config = json_decode(LeftAndMain::create()->getCombinedClientConfig(), true, 512, JSON_THROW_ON_ERROR);

        $this->assertArrayHasKey('recordClasses', $config);
        $ancestors = $config['recordClasses'][Page::class];
        $this->assertContains(SiteTree::class, $ancestors);
        $this->assertSame(DataObject::class, end($ancestors));
        $this->assertNotContains(Page::class, $ancestors);
    }
}
