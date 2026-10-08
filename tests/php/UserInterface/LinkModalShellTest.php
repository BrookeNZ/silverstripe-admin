<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Assets\Folder;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\InheritedPermissions;
use SilverStripe\Security\SecurityToken;

class LinkModalShellTest extends FunctionalTest
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
        $this->logInWithPermission('ADMIN');
    }

    protected function tearDown(): void
    {
        SecurityToken::enable();
        parent::tearDown();
    }

    public function testSchemaLoadsTheLinkValuesFromTheQuery(): void
    {
        SecurityToken::enable();
        $response = $this->get(
            'admin/modals/linkModalFormSchema/EditorExternalLink/0?Link=https%3A%2F%2Fexample.com&Description=Ex&TargetBlank=1&SecurityID=forged',
            null,
            static::SCHEMA
        );
        $body = $this->json($response);

        $this->assertSame('https://example.com', $this->stateValue($body, 'Link'));
        $this->assertSame('Ex', $this->stateValue($body, 'Description'));
        $this->assertSame(1, (int) $this->stateValue($body, 'TargetBlank'));
        $this->assertNotSame('forged', $this->stateValue($body, 'SecurityID'));
    }

    public function testAFormWithLinkTextPostsWithLinkText(): void
    {
        $body = $this->json($this->get('admin/modals/linkModalFormSchema/EditorExternalLink/0?requireLinkText=1', null, static::SCHEMA));
        $this->assertMatchesRegularExpression('#^admin/modals/linkModalForm/EditorExternalLink/0/?\?requireLinkText=1$#', $body['schema']['action']);

        $body = $this->json($this->get('admin/modals/linkModalFormSchema/EditorExternalLink/0', null, static::SCHEMA));
        $this->assertStringNotContainsString('requireLinkText', $body['schema']['action']);
    }

    public function testSchemaLoadsAFileIdAsARecordId(): void
    {
        $body = $this->json($this->get('admin/modals/linkModalFormSchema/EditorFileLink/0?FileID=9', null, static::SCHEMA));

        $this->assertSame(9, $this->stateValue($body, 'FileID'));
    }

    public function testEditingNamesTheActionSaveLink(): void
    {
        $actionTitle = fn (array $body) => $body['schema']['actions'][0]['title'];
        $this->assertSame('Insert link', $actionTitle($this->json($this->get('admin/modals/linkModalFormSchema/EditorExternalLink/0', null, static::SCHEMA))));
        $this->assertSame('Save link', $actionTitle($this->json($this->get('admin/modals/linkModalFormSchema/EditorExternalLink/0?editing=1', null, static::SCHEMA))));
    }

    public function testFileTreeListsOnlyWhatTheMemberMayView(): void
    {
        $open = Folder::find_or_make('LinkModalShellTest-open');
        $hidden = Folder::find_or_make('LinkModalShellTest-hidden');
        $hidden->CanViewType = InheritedPermissions::ONLY_THESE_USERS;
        $hidden->write();
        $this->logOut();
        $this->logInWithPermission(['CMS_ACCESS_AssetAdmin']);

        $response = $this->get('admin/modals/linkModalForm/EditorFileLink/0/field/FileID/tree?format=json', null, static::SCHEMA);
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $titles = array_column(json_decode($response->getBody(), true)['children'], 'title');

        $this->assertContains($open->Name, $titles);
        $this->assertNotContains($hidden->Name, $titles);
    }

    public function testSchemaLeavesOutAFileTheMemberMayNotView(): void
    {
        $hidden = $this->hiddenFolderForAFilesOnlyMember();

        $body = $this->json($this->get("admin/modals/linkModalFormSchema/EditorFileLink/0?FileID={$hidden->ID}", null, static::SCHEMA));

        $this->assertStringNotContainsString($hidden->Name, json_encode($body['state']));
        $this->assertSame($hidden->ID, $this->stateValue($body, 'FileID'));
    }

    public function testFileTreeRefusesToOpenAtAFolderTheMemberMayNotView(): void
    {
        $hidden = $this->hiddenFolderForAFilesOnlyMember();

        $response = $this->get("admin/modals/linkModalForm/EditorFileLink/0/field/FileID/tree/{$hidden->ID}?format=json", null, static::SCHEMA);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertStringNotContainsString($hidden->Name, (string) $response->getBody());
    }

    public function testFileLinkNeedsFilesAccessAndTheShell(): void
    {
        $this->logOut();
        $this->logInWithPermission(['CMS_ACCESS_CMSMain']);
        $this->assertSame(403, $this->get('admin/modals/linkModalFormSchema/EditorFileLink/0', null, static::SCHEMA)->getStatusCode());
        $this->assertArrayNotHasKey('EditorFileLink', LeftAndMain::singleton()->getClientConfig()['form'] ?? []);

        $this->logInWithPermission('ADMIN');
        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);
        $this->assertArrayNotHasKey('EditorFileLink', LeftAndMain::singleton()->getClientConfig()['form'] ?? []);
    }

    public function testInsertAnswersTheAcceptedState(): void
    {
        $response = $this->post(
            'admin/modals/linkModalForm/EditorEmailLink/0?requireLinkText',
            ['Link' => 'someone@example.com', 'Subject' => 'Hi there', 'Text' => 'Mail us', 'action_insert' => 1],
            static::SUBMIT
        );
        $body = $this->json($response);

        $this->assertSame([], $body['errors'] ?? []);
        $this->assertSame('admin/modals/linkModalFormSchema/EditorEmailLink/0', $body['id']);
        $this->assertSame('someone@example.com', $this->stateValue($body, 'Link'));
        $this->assertSame('Mail us', $this->stateValue($body, 'Text'));
    }

    public function testInvalidValuesAnswerFormSchemaErrors(): void
    {
        $response = $this->post(
            'admin/modals/linkModalForm/EditorEmailLink/0?requireLinkText',
            ['Link' => 'not an address', 'Text' => '', 'action_insert' => 1],
            static::SUBMIT
        );
        $body = $this->json($response);

        $fields = array_column($body['errors'], 'field');
        $this->assertContains('Link', $fields);
        $this->assertContains('Text', $fields);
    }

    public function testFileLinkNeedsAFile(): void
    {
        $response = $this->post(
            'admin/modals/linkModalForm/EditorFileLink/0',
            ['FileID' => '0', 'action_insert' => 1],
            static::SUBMIT
        );
        $body = $this->json($response);

        $this->assertSame(['FileID'], array_column($body['errors'], 'field'));
    }

    public function testFileLinkRefusesAFolderOrAMissingFile(): void
    {
        $folder = Folder::find_or_make('LinkModalShellTest-folder');
        foreach ([$folder->ID, $folder->ID + 1000] as $id) {
            $response = $this->post(
                'admin/modals/linkModalForm/EditorFileLink/0',
                ['FileID' => (string) $id, 'action_insert' => 1],
                static::SUBMIT
            );
            $body = $this->json($response);

            $this->assertSame(['FileID'], array_column($body['errors'], 'field'), "FileID $id");
        }
    }

    public function testAShellRequestIsRefusedInTheErrorEnvelope(): void
    {
        $this->logOut();
        $this->logInWithPermission(['CMS_ACCESS_CMSMain']);

        $response = $this->get('admin/modals/linkModalFormSchema/EditorFileLink/0', null, static::SCHEMA);
        $body = json_decode($response->getBody(), true);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertStringContainsString('application/json', (string) $response->getHeader('Content-Type'));
        $this->assertSame('error', $body['status']);
        $this->assertSame(403, $body['errors'][0]['code']);
        $this->assertSame('Linking to a file is not available', $body['errors'][0]['value']);
    }

    public function testInsertIsNotOfferedOutsideTheShell(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);
        $response = $this->post(
            'admin/modals/linkModalForm/EditorExternalLink/0',
            ['Link' => 'https://example.com', 'action_insert' => 1],
            static::SUBMIT
        );

        $this->assertSame(404, $response->getStatusCode());
    }

    public function testInsertNeedsCmsAccess(): void
    {
        $this->logOut();
        $this->logInWithPermission('SITETREE_VIEW_ALL');
        $response = $this->post(
            'admin/modals/linkModalForm/EditorExternalLink/0',
            ['Link' => 'https://example.com', 'action_insert' => 1],
            static::SUBMIT
        );

        $this->assertNotSame(200, $response->getStatusCode());
        $this->assertStringNotContainsString('https://example.com', (string) $response->getBody());
    }

    public function testInsertChecksTheSecurityToken(): void
    {
        SecurityToken::enable();
        $response = $this->post(
            'admin/modals/linkModalForm/EditorExternalLink/0',
            ['Link' => 'https://example.com', 'action_insert' => 1, 'SecurityID' => 'forged'],
            static::SUBMIT
        );

        $this->assertNotSame(200, $response->getStatusCode());
        $this->assertStringNotContainsString('https://example.com', (string) $response->getBody());
    }

    private function hiddenFolderForAFilesOnlyMember(): Folder
    {
        $hidden = Folder::find_or_make('LinkModalShellTest-hidden');
        $hidden->CanViewType = InheritedPermissions::ONLY_THESE_USERS;
        $hidden->write();
        $this->logOut();
        $this->logInWithPermission(['CMS_ACCESS_AssetAdmin']);
        return $hidden;
    }

    private function json(HTTPResponse $response): array
    {
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $this->assertStringContainsString('application/json', (string) $response->getHeader('Content-Type'));
        return json_decode($response->getBody(), true);
    }

    private function stateValue(array $body, string $name): mixed
    {
        foreach ($body['state']['fields'] as $field) {
            if ($field['name'] === $name) {
                return $field['value'];
            }
        }
        $this->fail("No state for $name");
    }
}
