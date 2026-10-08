<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\SecurityToken;
use SilverStripe\Versioned\Versioned;
use SilverStripe\VersionedAdmin\ArchiveAdmin;

class ArchiveRulesTest extends FunctionalTest
{
    protected $usesDatabase = true;

    private const TOKEN = 'valid-token';

    private const PAGES = 'admin/archive/SilverStripe-CMS-Model-SiteTree/EditForm/field/Pages/item/';

    protected function setUp(): void
    {
        parent::setUp();
        if (!class_exists(ArchiveAdmin::class) || !class_exists(SiteTree::class)) {
            $this->markTestSkipped('Needs silverstripe/versioned-admin and silverstripe/cms');
        }
        $this->autoFollowRedirection = false;
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        SecurityToken::enable();
    }

    public function testRestoreFromTheItemFormReportsWhatHappened(): void
    {
        $this->logInWithPermission('ADMIN');
        $this->session()->set('SecurityID', static::TOKEN);
        $id = $this->archivedPage();

        $response = $this->restore($id);

        $this->assertLessThan(300, $response->getStatusCode(), (string) $response->getBody());
        $this->assertNotNull(Versioned::get_by_stage(SiteTree::class, Versioned::DRAFT)->byID($id), 'Restored to draft');
        $body = json_decode((string) $response->getBody(), true);
        $this->assertNotSame('', $body['message'] ?? '', 'Legacy shows "Successfully restored the page"');
    }

    public function testArchiveTabsAreNotSentToAMemberWithoutArchiveAccess(): void
    {
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
        $controller = LeftAndMain::create();
        $request = (new HTTPRequest('GET', 'admin/pages'))->setSession($this->session());
        // SudoModeController's client config reads the request from the injector, as HTTPApplication registers it
        Injector::inst()->registerService($request, HTTPRequest::class);
        $controller->setRequest($request);
        $controller->pushCurrent();
        try {
            $sections = json_decode($controller->getCombinedClientConfig(), true)['sections'];
        } finally {
            $controller->popCurrent();
        }
        $archive = array_values(array_filter($sections, fn ($s) => ($s['name'] ?? '') === ArchiveAdmin::class))[0];

        $this->assertSame([], $archive['modelTabs'] ?? [], json_encode($archive['modelTabs'] ?? null));
    }

    private function archivedPage(): int
    {
        $page = SiteTree::create(['Title' => 'Gone', 'URLSegment' => 'gone']);
        $page->write();
        $page->publishRecursive();
        $id = $page->ID;
        $page->doArchive();
        return $id;
    }

    private function restore(int $id): HTTPResponse
    {
        return $this->post(
            static::PAGES . $id . '/ItemEditForm',
            ['action_doRestore' => 1, 'ID' => $id],
            ['X-Formschema-Request' => 'state,errors', 'X-SecurityID' => static::TOKEN, 'Accept' => 'application/json']
        );
    }
}
