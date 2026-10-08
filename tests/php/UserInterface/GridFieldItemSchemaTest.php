<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\GridFieldItemSchemaTest\Note;
use SilverStripe\Admin\Tests\UserInterface\GridFieldItemSchemaTest\NoteAdmin;
use SilverStripe\Admin\Tests\UserInterface\GridFieldItemSchemaTest\Notice;
use SilverStripe\Admin\UserInterface\GridField\GridFieldItemSchemaExtension;
use SilverStripe\Control\Controller;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\FormRequestHandler;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\Forms\GridField\GridFieldConfig_RecordEditor;
use SilverStripe\Forms\GridField\GridFieldDetailForm;
use SilverStripe\Forms\GridField\GridFieldDetailForm_ItemRequest;
use SilverStripe\Security\SecurityToken;
use SilverStripe\Versioned\Versioned;

class GridFieldItemSchemaTest extends FunctionalTest
{
    use ShellResponseAssertions;

    protected static $fixture_file = 'GridFieldItemSchemaTest.yml';

    protected static $extra_dataobjects = [Note::class, Notice::class];

    private const NOTES = 'NoteAdmin/notes/EditForm/field/notes/item/';

    private const NOTICES = 'NoteAdmin/notices/EditForm/field/notices/item/';

    private const TOKEN = 'valid-token';

    // ModelAdmin reads its model tab from the route params during init(), as its admin url_rule supplies them
    protected function getExtraRoutes()
    {
        return ['NoteAdmin//$ModelClass/$Action' => NoteAdmin::class];
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->autoFollowRedirection = false;
        $this->setUpShell();
        SecurityToken::enable();
        Note::$denied = [];
        $this->logInWithPermission('ADMIN');
        $this->session()->set('SecurityID', static::TOKEN);
    }

    public function testSchemaServesTheItemFormWithShellDecorations(): void
    {
        $id = $this->idFromFixture(Note::class, 'first');
        $body = $this->getSchema(static::NOTES . $id);

        $this->assertStringEndsWith("item/{$id}/schema/", $body['id']);
        $this->assertStringEndsWith("item/{$id}/ItemEditForm/", $body['schema']['action']);
        $title = $this->findField($body['schema']['fields'], 'Title');
        $this->assertNotEmpty($title['componentCandidates'], 'The shell decorations are applied');
        $this->assertSame('First', $this->stateValue($body, 'Title'));
        $this->assertSame([], $body['state']['messages']);
        $this->assertSame($id, $body['record']['id']);
        $this->assertSame(Note::class, $body['record']['className']);
        $this->assertSame('First', $body['record']['title']);
        $this->assertStringEndsWith("item/{$id}/edit/", $body['record']['link']);
        $this->assertNull($body['record']['parentTitle'], 'A record in a section grid has no parent record');
    }

    public function testARecordInAGridOnARecordFormNamesThatRecordAsItsParent(): void
    {
        $controller = new Controller();
        $grid = GridField::create('Notes', 'Notes', Note::get(), GridFieldConfig_RecordEditor::create());
        $form = Form::create($controller, 'EditForm', FieldList::create($grid), FieldList::create());
        $item = Note::get()->byID($this->idFromFixture(Note::class, 'second'));
        $itemRequest = GridFieldDetailForm_ItemRequest::create(
            $grid,
            $grid->getConfig()->getComponentByType(GridFieldDetailForm::class),
            $item,
            $controller,
            'DetailForm'
        );

        $this->assertNull(
            GridFieldItemSchemaExtension::recordSummary($itemRequest, false)['parentTitle'],
            'A form with no record loaded names no parent'
        );
        $form->loadDataFrom(Note::get()->byID($this->idFromFixture(Note::class, 'first')));
        $this->assertSame('First', GridFieldItemSchemaExtension::recordSummary($itemRequest, false)['parentTitle']);
    }

    public function testNewItemSchemaNeedsCreatePermission(): void
    {
        $body = $this->getSchema(static::NOTES . 'new');
        $this->assertStringEndsWith('item/new/ItemEditForm/', $body['schema']['action']);
        $this->assertNull($body['record']['id']);
        $this->assertNull($body['record']['title']);
        $this->assertNull($body['record']['link']);
        $this->assertSame('Note', $body['record']['singularName']);

        Note::$denied = ['create'];
        $this->assertJsonError($this->requestSchema(static::NOTES . 'new'), 403);
    }

    public function testUnviewableAndMissingRecordsAnswerTheSame404(): void
    {
        Note::$denied = ['view'];
        $unviewable = $this->requestSchema(static::NOTES . $this->idFromFixture(Note::class, 'first'));
        $missing = $this->requestSchema(static::NOTES . '999999');

        $this->assertJsonError($unviewable, 404);
        $this->assertJsonError($missing, 404);
        $this->assertSame('That record was not found.', $this->errorMessage($unviewable));
        $this->assertSame($unviewable->getBody(), $missing->getBody());
    }

    public function testSchemaIsOnlyServedToGetWhileTheShellIsOn(): void
    {
        $item = static::NOTES . $this->idFromFixture(Note::class, 'first');
        $post = $this->post("{$item}/schema", [], $this->headers('schema'));
        $this->assertJsonError($post, 405);

        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);
        $this->assertJsonError($this->requestSchema($item), 404);
    }

    public function testMemberWithoutSectionAccessIsRefused(): void
    {
        $id = $this->idFromFixture(Note::class, 'first');
        $this->logOut();
        $this->logInWithPermission('CMS_ACCESS_SomeOtherAdmin');
        $this->session()->set('SecurityID', static::TOKEN);

        $this->assertSame(403, $this->requestSchema(static::NOTES . $id)->getStatusCode());
        $save = $this->submit(static::NOTES . $id, ['Title' => 'Changed', 'action_doSave' => 1]);
        $this->assertSame(403, $save->getStatusCode());
        $this->assertSame('First', Note::get()->byID($id)->Title);
    }

    public function testSaveAnswersWithTheSuccessEnvelope(): void
    {
        $id = $this->idFromFixture(Note::class, 'first');
        $response = $this->submit(static::NOTES . $id, ['Title' => 'Renamed', 'action_doSave' => 1]);

        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $this->assertNull($response->getHeader('Location'));
        $body = json_decode($response->getBody(), true);
        $this->assertSame($id, $body['record']['id']);
        $this->assertStringEndsWith("item/{$id}/edit/", $body['record']['link']);
        $this->assertFalse($body['deleted']);
        $this->assertStringContainsString('Renamed', $body['message']);
        $this->assertSame('Renamed', $body['record']['title']);
        $this->assertSame('Renamed', $this->stateValue($body, 'Title'));
        $this->assertSame([], $body['state']['messages'], 'The shell shows the message itself');
        $this->assertSame('Renamed', Note::get()->byID($id)->Title);

        $reloaded = $this->getSchema(static::NOTES . $id);
        $this->assertSame([], $reloaded['state']['messages'], 'No session message is left for the next load');
    }

    public function testCreateAnswers201WithTheNewItemLink(): void
    {
        $response = $this->submit(static::NOTES . 'new', ['Title' => 'Created', 'action_doSave' => 1]);

        $this->assertSame(201, $response->getStatusCode(), $response->getBody());
        $created = Note::get()->filter('Title', 'Created')->first();
        $this->assertNotNull($created);
        $body = json_decode($response->getBody(), true);
        $this->assertSame($created->ID, $body['record']['id']);
        $this->assertStringEndsWith("item/{$created->ID}/edit/", $body['record']['link']);
        $this->assertSame($body['record']['link'], $response->getHeader('Location'));
    }

    public function testValidationErrorsComeBackAsFormSchemaErrors(): void
    {
        $id = $this->idFromFixture(Note::class, 'first');
        $response = $this->submit(static::NOTES . $id, ['Title' => '', 'action_doSave' => 1]);

        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $body = json_decode($response->getBody(), true);
        $this->assertArrayNotHasKey('record', $body);
        $this->assertSame(['Title'], array_column($body['errors'], 'field'));
        $this->assertArrayHasKey('state', $body);
        $this->assertSame('First', Note::get()->byID($id)->Title);
    }

    public function testSubmissionNeedsTheSecurityToken(): void
    {
        $id = $this->idFromFixture(Note::class, 'first');
        $answers = [
            'There seems to have been a technical problem.' => [],
            'Your session has expired.' => ['X-SecurityID' => 'stolen'],
        ];
        foreach ($answers as $message => $token) {
            $response = $this->post(
                static::NOTES . "{$id}/ItemEditForm",
                ['Title' => 'Changed', 'action_doSave' => 1],
                array_merge($this->headers('state,errors'), $token)
            );
            $this->assertJsonError($response, 400, 'invalidToken');
            $this->assertStringStartsWith($message, $this->errorMessage($response));
        }
        $this->assertSame('First', Note::get()->byID($id)->Title);
    }

    /**
     * The form leaves out an action the member may not run, which the framework refuses as plain text
     * naming the controller class; the shell gets the JSON refusal before the form handles the post
     */
    public function testWithheldActionsAreRefusedAsJson(): void
    {
        $id = $this->idFromFixture(Note::class, 'first');

        Note::$denied = ['edit'];
        $viewOnlySave = $this->submit(static::NOTES . $id, ['Title' => 'Changed', 'action_doSave' => 1]);
        $this->assertWithheld($viewOnlySave);
        $this->assertSame('First', Note::get()->byID($id)->Title);

        Note::$denied = ['create'];
        $create = $this->submit(static::NOTES . 'new', ['Title' => 'Created', 'action_doSave' => 1]);
        $this->assertJsonError($create, 403);
        $this->assertSame('You do not have permission to create this record.', $this->errorMessage($create));
        $this->assertSame(0, Note::get()->filter('Title', 'Created')->count());

        Note::$denied = ['delete'];
        $editOnlyDelete = $this->submit(static::NOTES . $id, ['Title' => 'First', 'action_doDelete' => 1]);
        $this->assertWithheld($editOnlyDelete);
        $this->assertNotNull(Note::get()->byID($id));
    }

    public function testFormNeedingSudoModeRefusesASaveInsteadOfReportingSuccess(): void
    {
        Config::modify()->set(Note::class, 'require_sudo_mode', true);
        $id = $this->idFromFixture(Note::class, 'first');

        $response = $this->submit(static::NOTES . $id, ['Title' => 'Changed', 'action_doSave' => 1]);

        $this->assertJsonError($response, 403);
        $this->assertStringStartsWith('Confirm your password', $this->errorMessage($response));
        $this->assertSame('First', Note::get()->byID($id)->Title);
    }

    public function testLegacyPostCannotCreateWithoutCreatePermission(): void
    {
        Note::$denied = ['create'];
        $response = $this->post(
            static::NOTES . 'new/ItemEditForm',
            ['Title' => 'Created', 'action_doSave' => 1, 'SecurityID' => static::TOKEN],
            ['X-Requested-With' => 'XMLHttpRequest', 'X-Pjax' => 'CurrentForm']
        );

        $this->assertSame(403, $response->getStatusCode(), (string) $response->getBody());
        $this->assertSame(0, Note::get()->filter('Title', 'Created')->count());
        $this->assertSame(2, Note::get()->count());
    }

    public function testTheShellChecksThePermissionBeforeTheActionRuns(): void
    {
        $admin = NoteAdmin::create();
        $grid = GridField::create('notes', 'Notes', Note::get(), GridFieldConfig_RecordEditor::create());
        $form = Form::create($admin, 'EditForm', FieldList::create($grid), FieldList::create());
        $note = $this->objFromFixture(Note::class, 'first');
        $detailForm = $grid->getConfig()->getComponentByType(GridFieldDetailForm::class);
        $itemRequest = GridFieldDetailForm_ItemRequest::create($grid, $detailForm, $note, $admin, 'EditForm');
        $handler = FormRequestHandler::create($form);
        $request = new HTTPRequest('POST', 'item/1/ItemEditForm');
        $request->addHeader('X-Formschema-Request', 'state,errors');
        $vars = [];

        $action = 'doSave';
        $handler->extend('beforeCallFormHandler', $request, $action, $vars, $form, $itemRequest);
        $this->assertSame('ValidationResult', $request->getHeader('X-Pjax'));

        Note::$denied = ['edit'];
        try {
            $handler->extend('beforeCallFormHandler', $request, $action, $vars, $form, $itemRequest);
            $this->fail('A save without canEdit is refused');
        } catch (HTTPResponse_Exception $exception) {
            $this->assertJsonError($exception->getResponse(), 403);
        }
    }

    public function testDeleteAnswersWithNoLink(): void
    {
        $id = $this->idFromFixture(Note::class, 'first');
        $response = $this->submit(static::NOTES . $id, ['Title' => 'First', 'action_doDelete' => 1]);

        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $body = json_decode($response->getBody(), true);
        $this->assertSame($id, $body['record']['id']);
        $this->assertNull($body['record']['link']);
        $this->assertTrue($body['deleted']);
        $this->assertArrayNotHasKey('state', $body);
        $this->assertNull(Note::get()->byID($id));
    }

    public function testPublishActionsOnAVersionedModel(): void
    {
        $id = $this->idFromFixture(Notice::class, 'draft');

        Note::$denied = ['publish'];
        $this->assertWithheld($this->submit(static::NOTICES . $id, ['Title' => 'Draft', 'action_doPublish' => 1]));
        $this->assertFalse(Notice::get()->byID($id)->isPublished());

        Note::$denied = [];
        $published = $this->submit(static::NOTICES . $id, ['Title' => 'Live', 'action_doPublish' => 1]);
        $this->assertSame(200, $published->getStatusCode(), $published->getBody());
        $this->assertSame('Live', Versioned::get_by_stage(Notice::class, Versioned::LIVE)->byID($id)?->Title);

        Note::$denied = ['unpublish'];
        $this->assertWithheld($this->submit(static::NOTICES . $id, ['Title' => 'Live', 'action_doUnpublish' => 1]));
        $this->assertTrue(Notice::get()->byID($id)->isPublished());

        Note::$denied = [];
        $archived = $this->submit(static::NOTICES . $id, ['Title' => 'Live', 'action_doArchive' => 1]);
        $this->assertSame(200, $archived->getStatusCode(), $archived->getBody());
        $this->assertTrue(json_decode($archived->getBody(), true)['deleted']);
    }

    public function testLegacySubmissionIsUnchanged(): void
    {
        $id = $this->idFromFixture(Note::class, 'first');
        $response = $this->post(
            static::NOTES . "{$id}/ItemEditForm",
            ['Title' => 'Legacy', 'action_doSave' => 1, 'SecurityID' => static::TOKEN],
            ['X-Requested-With' => 'XMLHttpRequest', 'X-Pjax' => 'CurrentForm']
        );

        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $this->assertArrayHasKey('CurrentForm', json_decode($response->getBody(), true));
        $this->assertSame('Legacy', Note::get()->byID($id)->Title);
    }

    private function headers(string $parts): array
    {
        return [
            'Accept' => 'application/json',
            'X-Requested-With' => 'XMLHttpRequest',
            'X-Formschema-Request' => $parts,
        ];
    }

    private function requestSchema(string $item): HTTPResponse
    {
        return $this->get("{$item}/schema", null, $this->headers('schema,state,errors'));
    }

    private function getSchema(string $item): array
    {
        $response = $this->requestSchema($item);
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        return json_decode($response->getBody(), true);
    }

    private function submit(string $item, array $data): HTTPResponse
    {
        return $this->post(
            "{$item}/ItemEditForm",
            $data,
            array_merge($this->headers('state,errors'), ['X-SecurityID' => static::TOKEN])
        );
    }

    private function findField(array $fields, string $name): ?array
    {
        foreach ($fields as $field) {
            if ($field['name'] === $name) {
                return $field;
            }
            $found = $this->findField($field['children'] ?? [], $name);
            if ($found) {
                return $found;
            }
        }
        return null;
    }

    private function assertWithheld(HTTPResponse $response): void
    {
        $this->assertJsonError($response, 403);
        $this->assertSame('You do not have permission to do that to this record.', $this->errorMessage($response));
        $this->assertStringNotContainsString('Class', $response->getBody());
    }
}
