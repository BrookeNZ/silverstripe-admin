<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\GridFieldItemSchemaTest\Note;
use SilverStripe\Admin\Tests\UserInterface\GridFieldItemSchemaTest\NoteAdmin;
use SilverStripe\Admin\Tests\UserInterface\GridFieldItemSchemaTest\Notice;
use SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest\Player;
use SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest\Ship;
use SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest\Team;
use SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest\TestController;
use SilverStripe\Admin\Tests\UserInterface\GridFieldRulesTest\ArchiveTeamsController;
use SilverStripe\Admin\Tests\UserInterface\GridFieldRulesTest\ViewOnlyNoteAdmin;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\SecurityToken;
use SilverStripe\Versioned\Versioned;

class GridFieldRulesTest extends FunctionalTest
{
    protected static $fixture_file = ['GridFieldRowsEndpointTest.yml'];

    protected static $extra_dataobjects = [Team::class, Ship::class, Player::class, Note::class, Notice::class];

    protected static $extra_controllers = [TestController::class, ArchiveTeamsController::class];

    private const TOKEN = 'valid-token';

    protected function getExtraRoutes()
    {
        return array_merge(parent::getExtraRoutes(), [
            'NoteAdmin//$ModelClass/$Action' => NoteAdmin::class,
            'ViewOnlyNoteAdmin//$ModelClass/$Action' => ViewOnlyNoteAdmin::class,
        ]);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->autoFollowRedirection = false;
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        SecurityToken::enable();
        Note::$denied = [];
        $this->logInWithPermission('ADMIN');
        $this->session()->set('SecurityID', static::TOKEN);
    }

    public function testRowsErrorsCarryAReasonLikeTheOtherShellEndpoints(): void
    {
        $response = $this->get('GridFieldRowsEndpointTest/Form/field/Teams/rows?sort=Nope', null, $this->headers(''));

        $this->assertSame(400, $response->getStatusCode(), $response->getBody());
        $this->assertArrayHasKey('reason', json_decode($response->getBody(), true)['errors'][0]);
    }

    public function testAViewOnlyGridOpensItsRecordsReadOnly(): void
    {
        $note = Note::create(['Title' => 'Viewed']);
        $note->write();
        $item = "ViewOnlyNoteAdmin/notes/EditForm/field/notes/item/{$note->ID}";

        $rows = json_decode($this->get('ViewOnlyNoteAdmin/notes/EditForm/field/notes/rows', null, $this->headers(''))->getBody(), true);
        $this->assertSame(['view'], array_column($rows['rows'][0]['actions'], 'name'));

        $schema = json_decode($this->get("{$item}/schema", null, $this->headers('schema,state,errors'))->getBody(), true);
        $this->assertNotContains('action_doSave', $this->actionNames($schema['schema']['actions']));

        $this->post("{$item}/ItemEditForm", ['Title' => 'Changed', 'action_doSave' => 1], $this->headers('state,errors', true));
        $this->assertSame('Viewed', Note::get()->byID($note->ID)->Title);
    }

    public function testAPublisherWithoutEditPermissionCanPublishAsInLegacy(): void
    {
        $legacy = $this->notice('Legacy');
        $shell = $this->notice('Shell');
        Note::$denied = ['edit'];

        $this->post(
            "NoteAdmin/notices/EditForm/field/notices/item/{$legacy->ID}/ItemEditForm",
            ['action_doPublish' => 1, 'SecurityID' => static::TOKEN],
            ['X-Requested-With' => 'XMLHttpRequest', 'X-Pjax' => 'CurrentForm']
        );
        $this->assertTrue(Notice::get()->byID($legacy->ID)->isPublished(), 'Legacy publishes the draft');

        $response = $this->post(
            "NoteAdmin/notices/EditForm/field/notices/item/{$shell->ID}/ItemEditForm",
            ['action_doPublish' => 1],
            $this->headers('state,errors', true)
        );
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $this->assertTrue(Notice::get()->byID($shell->ID)->isPublished());
    }

    public function testArchiveOnAGridThatNeverOffersItIsNotAServerError(): void
    {
        $alpha = $this->idFromFixture(Team::class, 'alpha');

        $response = $this->post(
            'GridFieldRulesTest/Form/field/Teams/actions/archiverecord',
            [],
            array_merge($this->headers(''), ['X-SecurityID' => static::TOKEN, 'Content-Type' => 'application/json']),
            null,
            json_encode(['RecordID' => $alpha])
        );

        $this->assertSame(404, $response->getStatusCode(), $response->getBody());
    }

    private function notice(string $title): Notice
    {
        $notice = Notice::create(['Title' => $title]);
        $notice->write();
        return $notice;
    }

    private function headers(string $parts, bool $withToken = false): array
    {
        $headers = ['Accept' => 'application/json', 'X-Requested-With' => 'XMLHttpRequest'];
        if ($parts !== '') {
            $headers['X-Formschema-Request'] = $parts;
        }
        if ($withToken) {
            $headers['X-SecurityID'] = static::TOKEN;
        }
        return $headers;
    }

    private function actionNames(array $fields): array
    {
        $names = [];
        foreach ($fields as $field) {
            $names[] = $field['name'] ?? null;
            $names = array_merge($names, $this->actionNames($field['children'] ?? []));
        }
        return $names;
    }
}
