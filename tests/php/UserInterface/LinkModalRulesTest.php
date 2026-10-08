<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Assets\File;
use SilverStripe\Assets\Folder;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\InheritedPermissions;
use SilverStripe\Security\SecurityToken;

class LinkModalRulesTest extends FunctionalTest
{
    protected $usesDatabase = true;

    private const SCHEMA = [
        'X-Requested-With' => 'XMLHttpRequest',
        'Accept' => 'application/json',
        'X-Formschema-Request' => 'schema,state,errors',
    ];

    private const SUBMIT = [
        'X-Requested-With' => 'XMLHttpRequest',
        'Accept' => 'application/json',
        'X-Formschema-Request' => 'state,errors',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        SecurityToken::disable();
    }

    protected function tearDown(): void
    {
        SecurityToken::enable();
        parent::tearDown();
    }

    public function testInsertDoesNotNameAPageTheMemberMayNotView(): void
    {
        $hidden = SiteTree::create(['Title' => 'LinkModalRulesTest secret page', 'CanViewType' => InheritedPermissions::ONLY_THESE_USERS]);
        $hidden->write();
        $this->logInWithPermission(['CMS_ACCESS_CMSMain']);
        $this->assertFalse($hidden->canView());

        $response = $this->post(
            'admin/modals/linkModalForm/editorInternalLink/0',
            ['PageID' => $hidden->ID, 'action_insert' => 1],
            static::SUBMIT
        );

        $this->assertStringNotContainsString('secret page', (string) $response->getBody());
        $this->assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $state = array_column(json_decode($response->getBody(), true)['state']['fields'], 'value', 'name');
        $this->assertSame($hidden->ID, (int) $state['PageID']);
    }

    public function testInsertDoesNotNameAFileTheMemberMayNotView(): void
    {
        $hidden = $this->hiddenFolder();

        $response = $this->post(
            'admin/modals/linkModalForm/EditorFileLink/0',
            ['FileID' => $hidden->ID, 'action_insert' => 1],
            static::SUBMIT
        );

        $this->assertStringNotContainsString($hidden->Name, (string) $response->getBody());
    }

    public function testInsertActionIsNotAControllerUrl(): void
    {
        $this->logInWithPermission('ADMIN');

        $response = $this->get('admin/modals/insert', null, static::SCHEMA);

        $this->assertLessThan(500, $response->getStatusCode(), (string) $response->getBody());
    }

    private function hiddenFolder(): Folder
    {
        $hidden = Folder::find_or_make('LinkModalRulesTest-hidden');
        $hidden->CanViewType = InheritedPermissions::ONLY_THESE_USERS;
        $hidden->write();
        $file = File::create(['Name' => 'LinkModalRulesTest-inner.txt', 'ParentID' => $hidden->ID]);
        $file->write();
        $this->logInWithPermission(['CMS_ACCESS_AssetAdmin', 'CMS_ACCESS_CMSMain']);
        $this->assertFalse($hidden->canView());
        return $hidden;
    }
}
