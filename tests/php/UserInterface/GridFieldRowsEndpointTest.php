<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest\Player;
use SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest\Ship;
use SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest\Team;
use SilverStripe\Admin\Tests\UserInterface\GridFieldRowsEndpointTest\TestController;
use SilverStripe\Admin\UserInterface\GridField\GridFieldAddNewButtonSchema;
use SilverStripe\Admin\UserInterface\GridField\GridFieldRowsEndpoint;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\Forms\GridField\GridFieldConfig_RecordEditor;
use SilverStripe\Security\SecurityToken;
use SilverStripe\Versioned\Versioned;

class GridFieldRowsEndpointTest extends FunctionalTest
{
    protected static $fixture_file = 'GridFieldRowsEndpointTest.yml';

    protected static $extra_dataobjects = [Team::class, Ship::class, Player::class];

    protected static $extra_controllers = [TestController::class];

    private const JSON = ['Accept' => 'application/json', 'X-Requested-With' => 'XMLHttpRequest'];

    private const GRID = 'GridFieldRowsEndpointTest/Form/field/Teams/';

    private const FLEET = 'GridFieldRowsEndpointTest/Fleet/field/Ships/';

    private const ARCHIVE = 'GridFieldRowsEndpointTest/Archive/field/Ships/';

    private const ROSTER = 'GridFieldRowsEndpointTest/Roster/field/Players/';

    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        SecurityToken::enable();
        TestController::$withBadge = false;
        TestController::$nameFormat = null;
        Player::$deletable = true;
        Player::$deleteRefusal = null;
    }

    public function testEnvelopeShape(): void
    {
        $body = $this->getJson('rows');

        $this->assertSame(
            ['grid', 'columns', 'rows', 'sort', 'filter', 'pagination', 'bulkActions', 'slots', 'emptyText'],
            array_keys($body)
        );
        $this->assertSame('Teams', $body['grid']['name']);
        $this->assertFalse($body['grid']['readonly']);
        $this->assertSame(['Name', 'City', 'Actions'], array_column($body['columns'], 'name'));
        $this->assertSame(['component' => 'GridField.cell.Text', 'props' => []], $body['columns'][0]['cell']);
        $this->assertTrue($body['columns'][0]['sortable']);
        $this->assertTrue($body['columns'][2]['actions']);
        $this->assertNull($body['columns'][2]['cell']);

        $this->assertSame(['Alpha', 'Bravo'], $this->names($body));
        $this->assertSame(['value' => 'Wellington'], $body['rows'][0]['cells']['City']);
        $this->assertSame(['edit', 'deleterecord'], array_column($body['rows'][0]['actions'], 'name'));
        $delete = $body['rows'][0]['actions'][1];
        $this->assertSame('POST', $delete['method']);
        $this->assertStringEndsWith('field/Teams/actions/deleterecord/', $delete['url']);
        $this->assertSame(['RecordID' => $this->idFromFixture(Team::class, 'alpha')], $delete['args']);
        $this->assertNotEmpty($delete['confirm']);

        $this->assertSame(['page' => 1, 'pageSize' => 2, 'totalCount' => 4, 'totalPages' => 2], $body['pagination']);
        $this->assertSame([], $body['sort']);
        $this->assertSame('q', $body['filter']['searchField']);
        $this->assertFalse($body['filter']['active']);

        $addNew = $body['slots']['buttons-before-left'][0];
        $this->assertSame(GridFieldAddNewButtonSchema::COMPONENT, $addNew['component']);
        $this->assertStringEndsWith('field/Teams/item/new/edit/', $addNew['props']['url']);
        $this->assertArrayNotHasKey('header', $body['slots'], 'Sortable header and filter header are carried as data');
    }

    public function testQueryParametersMapOntoGridState(): void
    {
        $controller = TestController::create();
        $request = new HTTPRequest('GET', '/');
        $request->setSession(new Session([]));
        $controller->setRequest($request);
        $grid = $controller->Form()->Fields()->dataFieldByName('Teams');
        $request = new HTTPRequest('GET', 'rows', [
            'sort' => '-Name',
            'filter' => ['City' => 'Wellington', 'Search__q' => 'a'],
            'page' => ['number' => '2', 'size' => '3'],
        ]);

        GridFieldRowsEndpoint::create()->applyQuery($grid, $request);

        $state = $grid->getState();
        $this->assertSame('Name', $state->GridFieldSortableHeader->SortColumn);
        $this->assertSame('desc', $state->GridFieldSortableHeader->SortDirection);
        $this->assertSame(['City' => 'Wellington', 'q' => 'a'], $state->GridFieldFilterHeader->Columns->toArray());
        $this->assertSame(2, $state->GridFieldPaginator->currentPage);
        $this->assertSame(3, $state->GridFieldPaginator->itemsPerPage);
    }

    public function testSortFilterAndPageChangeTheRows(): void
    {
        $sorted = $this->getJson('rows?sort=-Name&page[size]=3');
        $this->assertSame(['Charlie', 'Bravo'], $this->names($sorted), 'Hidden is first but canView drops it');
        $this->assertSame([['field' => 'Name', 'direction' => 'desc']], $sorted['sort']);

        $filtered = $this->getJson('rows?filter[City]=Auckland');
        $this->assertSame(['Bravo'], $this->names($filtered));
        $this->assertTrue($filtered['filter']['active']);
        $this->assertSame(['City' => 'Auckland'], $filtered['filter']['values']);

        $searched = $this->getJson('rows?filter[Search__q]=charl');
        $this->assertSame(['Charlie'], $this->names($searched));

        $secondPage = $this->getJson('rows?page[number]=2');
        $this->assertSame(['Charlie'], $this->names($secondPage));
        $this->assertSame(2, $secondPage['pagination']['page']);
    }

    public function testGridStateFromTheQueryStringIsIgnored(): void
    {
        $state = json_encode([
            'GridFieldSortableHeader' => ['SortColumn' => 'City', 'SortDirection' => 'desc'],
            'GridFieldPaginator' => ['itemsPerPage' => 100],
        ]);
        foreach (['Teams[GridState]', 'gridState-Teams-0'] as $key) {
            $body = $this->getJson('rows?' . http_build_query([$key => $state]));
            $this->assertSame(['Alpha', 'Bravo'], $this->names($body), $key);
            $this->assertSame([], $body['sort'], $key);
            $this->assertSame(2, $body['pagination']['pageSize'], $key);
        }
    }

    public function testResetKeepsStateTheQueryComponentsDoNotOwn(): void
    {
        $grid = GridField::create('Teams', 'Teams', Team::get(), GridFieldConfig_RecordEditor::create(2));
        $state = $grid->getState();
        $state->ParentID = 7;
        $state->GridFieldOrderableRows = ['enabled' => true];
        $state->GridFieldPaginator->currentPage = 3;
        $state->GridFieldSortableHeader->SortColumn = 'City';
        $state->GridFieldFilterHeader->Columns = ['Name' => 'x'];

        (new GridFieldRowsEndpoint())->resetState($grid);

        $this->assertSame(7, $state->ParentID);
        $this->assertTrue($state->GridFieldOrderableRows->enabled);
        $this->assertSame(1, $state->GridFieldPaginator->currentPage);
        $this->assertNull($state->GridFieldSortableHeader->SortColumn);
        $this->assertSame([], $state->GridFieldFilterHeader->Columns->toArray());
    }

    public function testInvalidParametersAreJsonBadRequests(): void
    {
        foreach (['sort=Nope', 'sort=Name,City', 'filter[Nope]=x', 'page[size]=1000', 'page[number]=0', 'page[bogus]=1'] as $query) {
            $response = $this->get(GridFieldRowsEndpointTest::GRID . 'rows?' . $query, null, GridFieldRowsEndpointTest::JSON);
            $this->assertSame(400, $response->getStatusCode(), $query);
            $this->assertJsonError($response, 400);
        }
    }

    public function testCanViewFiltersRowsButNotTheCount(): void
    {
        $names = [];
        foreach ([1, 2] as $page) {
            $body = $this->getJson('rows?page[number]=' . $page);
            $names = array_merge($names, $this->names($body));
            $this->assertSame(4, $body['pagination']['totalCount']);
        }
        $this->assertSame(['Alpha', 'Bravo', 'Charlie'], $names);
    }

    public function testPlainColumnProviderFallsBackToHtml(): void
    {
        TestController::$withBadge = true;

        $body = $this->getJson('rows');

        $badge = $body['columns'][array_search('Badge', array_column($body['columns'], 'name'))];
        $this->assertNull($badge['cell']);
        $this->assertSame(['html' => '<b class="badge">Wellington</b>'], $body['rows'][0]['cells']['Badge']);
    }

    public function testStringFormatsAreNotEvaluated(): void
    {
        TestController::$nameFormat = '<i>$value</i>';

        $body = $this->getJson('rows');

        $this->assertSame(['value' => 'Alpha'], $body['rows'][0]['cells']['Name']);
    }

    public function testDeleteNeedsTheSecurityIdHeader(): void
    {
        $alpha = $this->idFromFixture(Team::class, 'alpha');
        $this->session()->set('SecurityID', 'valid-token');

        $missing = $this->postAction('deleterecord', ['RecordID' => $alpha], []);
        $this->assertSame(400, $missing->getStatusCode());
        $this->assertJsonError($missing, 400);

        $wrong = $this->postAction('deleterecord', ['RecordID' => $alpha], ['X-SecurityID' => 'stolen']);
        $this->assertSame(400, $wrong->getStatusCode());
        $this->assertNotNull(Team::get()->byID($alpha));

        $valid = $this->postAction('deleterecord', ['RecordID' => $alpha], ['X-SecurityID' => 'valid-token']);
        $this->assertSame(200, $valid->getStatusCode());
        $this->assertNull(Team::get()->byID($alpha));
        $this->assertSame(['Bravo', 'Charlie'], $this->names(json_decode($valid->getBody(), true)));
    }

    public function testOnlyAdvertisedActionsOnViewableRecordsCanBePosted(): void
    {
        $this->session()->set('SecurityID', 'valid-token');
        $headers = ['X-SecurityID' => 'valid-token'];

        $unknown = $this->postAction('sortasc', ['RecordID' => 1], $headers);
        $this->assertSame(404, $unknown->getStatusCode());
        $this->assertJsonError($unknown, 404);

        $hidden = $this->idFromFixture(Team::class, 'hidden');
        $this->assertSame(404, $this->postAction('deleterecord', ['RecordID' => $hidden], $headers)->getStatusCode());
        $this->assertNotNull(Team::get()->byID($hidden));

        $this->assertSame(400, $this->postAction('deleterecord', ['RecordID' => 'x'], $headers)->getStatusCode());
    }

    public function testArchiveAndRestoreAreAdvertisedLikeDelete(): void
    {
        $this->logInWithPermission('ADMIN');
        $fleet = $this->getJson('rows', static::FLEET);
        $endeavour = $this->idFromFixture(Ship::class, 'endeavour');
        $this->assertSame(['Endeavour', 'Locked'], $this->titles($fleet));
        $this->assertSame([], $fleet['rows'][0]['cells']['Actions'] ?? [], 'The archive button HTML is not sent');
        $this->assertSame([
            'name' => 'archiverecord',
            'type' => 'action',
            'title' => 'Archive',
            'method' => 'POST',
            'url' => $fleet['rows'][0]['actions'][1]['url'],
            'args' => ['RecordID' => $endeavour],
            'confirm' => 'Are you sure you want to archive this record?',
        ], $fleet['rows'][0]['actions'][1]);
        $this->assertStringContainsString('field/Ships/actions/archiverecord/', $fleet['rows'][0]['actions'][1]['url']);
        $this->assertNotContains('deleterecord', array_column($fleet['rows'][0]['actions'], 'name'));
        $this->assertSame(['edit'], array_column($fleet['rows'][1]['actions'], 'name'), 'Locked cannot be archived');

        Ship::get()->byID($endeavour)->doArchive();
        $archive = $this->getJson('rows', static::ARCHIVE);
        $this->assertSame(['Endeavour'], $this->titles($archive));
        $restore = $archive['rows'][0]['actions'][0];
        $this->assertSame(['restore', 'action', 'Restore to draft', 'POST'], [$restore['name'], $restore['type'], $restore['title'], $restore['method']]);
        $this->assertNull($restore['confirm']);
        $this->assertSame('Endeavour', $archive['rows'][0]['title']);
    }

    public function testArchiveRunsAndAnswersWithTheRefreshedRows(): void
    {
        $this->logInWithPermission('ADMIN');
        $this->session()->set('SecurityID', 'valid-token');
        $endeavour = $this->idFromFixture(Ship::class, 'endeavour');

        $this->assertJsonError($this->postAction('archiverecord', ['RecordID' => $endeavour], [], static::FLEET), 400);
        $wrong = $this->postAction('archiverecord', ['RecordID' => $endeavour], ['X-SecurityID' => 'stolen'], static::FLEET);
        $this->assertJsonError($wrong, 400);
        $this->assertNotNull(Ship::get()->byID($endeavour));

        $response = $this->postAction('archiverecord', ['RecordID' => $endeavour], ['X-SecurityID' => 'valid-token'], static::FLEET);
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $this->assertSame(['Locked'], $this->titles(json_decode($response->getBody(), true)));
        $this->assertNull(Ship::get()->byID($endeavour));
        $this->assertTrue(Versioned::get_latest_version(Ship::class, $endeavour)->isArchived());
    }

    public function testForbiddenArchiveAndRestoreChangeNothing(): void
    {
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
        $this->session()->set('SecurityID', 'valid-token');
        $headers = ['X-SecurityID' => 'valid-token'];
        $locked = $this->idFromFixture(Ship::class, 'locked');

        $archive = $this->postAction('archiverecord', ['RecordID' => $locked], $headers, static::FLEET);
        $this->assertJsonError($archive, 404);
        $this->assertNotNull(Ship::get()->byID($locked));

        $this->assertJsonError($this->postAction('deleterecord', ['RecordID' => $locked], $headers, static::FLEET), 404);
        $this->assertNotNull(Ship::get()->byID($locked));

        Versioned::withVersionedMode(function () use ($locked) {
            Versioned::set_stage(Versioned::DRAFT);
            Ship::get()->byID($locked)->doArchive();
        });
        $this->assertSame([], $this->getJson('rows', static::ARCHIVE)['rows'][0]['actions']);
        $restore = $this->postAction('restore', ['RecordID' => $locked], $headers, static::ARCHIVE);
        $this->assertJsonError($restore, 404);
        $this->assertNull(Ship::get()->byID($locked));
    }

    public function testRestoreRunsAndReturnsItsMessage(): void
    {
        $this->logInWithPermission('ADMIN');
        $this->session()->set('SecurityID', 'valid-token');
        $endeavour = $this->idFromFixture(Ship::class, 'endeavour');
        $ship = Ship::get()->byID($endeavour);
        $ship->Name = 'Endeavour & Co';
        $ship->write();
        $ship->doArchive();

        $response = $this->postAction('restore', ['RecordID' => $endeavour], ['X-SecurityID' => 'valid-token'], static::ARCHIVE);
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $body = json_decode($response->getBody(), true);
        $this->assertSame([], $body['rows']);
        $this->assertSame('Successfully restored the ship "Endeavour & Co"', $body['message'], 'Edit link and entities are gone');
        $this->assertSame('Endeavour & Co', Ship::get()->byID($endeavour)?->Name);
    }

    public function testRestoringARecordThatIsNotArchivedIsAConflict(): void
    {
        $this->logInWithPermission('ADMIN');
        $this->session()->set('SecurityID', 'valid-token');
        $ship = Ship::get()->byID($this->idFromFixture(Ship::class, 'endeavour'));
        $ship->publishRecursive();
        $ship->deleteFromStage(Versioned::DRAFT);

        $response = $this->postAction('restore', ['RecordID' => $ship->ID], ['X-SecurityID' => 'valid-token'], static::ARCHIVE);
        $this->assertJsonError($response, 409);
        $this->assertNull(Ship::get()->byID($ship->ID));
    }

    public function testAnOrphanedRecordRestoresToTheTopLevel(): void
    {
        $this->logInWithPermission('ADMIN');
        $parent = Ship::create(['Name' => 'Mother']);
        $parent->write();
        $child = Ship::create(['Name' => 'Tender', 'ParentID' => $parent->ID]);
        $child->write();
        $child->doArchive();
        $parent->doArchive();

        $rows = $this->getJson('rows', static::ARCHIVE)['rows'];
        $titles = array_combine(array_column($rows, 'title'), array_map(fn ($row) => $row['actions'][0]['title'], $rows));
        $this->assertSame('Restore to draft at top level', $titles['Tender']);
        $this->assertSame('Restore to draft', $titles['Mother']);
    }

    public function testDeleteWorksOnAGridNestedInAnItemEditForm(): void
    {
        $this->session()->set('SecurityID', 'valid-token');
        $first = $this->idFromFixture(Player::class, 'first');
        $nested = GridFieldRowsEndpointTest::GRID . 'item/' . $this->idFromFixture(Team::class, 'alpha') . '/ItemEditForm/field/Players/';

        $response = $this->postAction('deleterecord', ['RecordID' => $first], ['X-SecurityID' => 'valid-token'], $nested);
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $this->assertNull(Player::get()->byID($first));
        $body = json_decode($response->getBody(), true);
        $this->assertSame(['Second player'], $this->titles($body));
        $this->assertArrayNotHasKey('message', $body);
    }

    public function testRestoreWorksOnAGridNestedInAnItemEditForm(): void
    {
        $this->logInWithPermission('ADMIN');
        $this->session()->set('SecurityID', 'valid-token');
        $endeavour = $this->idFromFixture(Ship::class, 'endeavour');
        Ship::get()->byID($endeavour)->doArchive();
        $nested = GridFieldRowsEndpointTest::GRID . 'item/' . $this->idFromFixture(Team::class, 'alpha') . '/ItemEditForm/field/ArchivedShips/';

        $response = $this->postAction('restore', ['RecordID' => $endeavour], ['X-SecurityID' => 'valid-token'], $nested);
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $this->assertArrayNotHasKey('message', json_decode($response->getBody(), true));
        Versioned::withVersionedMode(function () use ($endeavour) {
            Versioned::set_stage(Versioned::DRAFT);
            $this->assertSame('Endeavour', Ship::get()->byID($endeavour)?->Name);
        });
    }

    public function testUnlinkKeepsTheRecordAndARelationEditorHasNoDelete(): void
    {
        $this->session()->set('SecurityID', 'valid-token');
        $headers = ['X-SecurityID' => 'valid-token'];
        $first = $this->idFromFixture(Player::class, 'first');

        $this->assertSame(['edit', 'unlinkrelation'], array_column($this->getJson('rows', static::ROSTER)['rows'][0]['actions'], 'name'));
        $this->assertJsonError($this->postAction('deleterecord', ['RecordID' => $first], $headers, static::ROSTER), 404);

        $response = $this->postAction('unlinkrelation', ['RecordID' => $first], $headers, static::ROSTER);
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $this->assertSame(['Second player'], $this->titles(json_decode($response->getBody(), true)));
        $this->assertSame(0, (int) Player::get()->byID($first)?->TeamID, 'Unlinked, not deleted');
    }

    public function testEditWithoutDeleteOffersNoDelete(): void
    {
        $this->session()->set('SecurityID', 'valid-token');
        Player::$deletable = false;
        $first = $this->idFromFixture(Player::class, 'first');
        $nested = GridFieldRowsEndpointTest::GRID . 'item/' . $this->idFromFixture(Team::class, 'alpha') . '/ItemEditForm/field/Players/';

        $this->assertSame(['edit'], array_column($this->getJson('rows', $nested)['rows'][0]['actions'], 'name'));
        $response = $this->postAction('deleterecord', ['RecordID' => $first], ['X-SecurityID' => 'valid-token'], $nested);
        $this->assertJsonError($response, 404);
        $this->assertNotNull(Player::get()->byID($first));
    }

    public function testAGridNeedingSudoModeIsServedReadOnly(): void
    {
        Config::modify()->set(Team::class, 'require_sudo_mode', true);
        $body = $this->getJson('rows');

        $this->assertTrue($body['grid']['readonly']);
        $this->assertSame(['view'], array_column($body['rows'][0]['actions'], 'name'));
        $alpha = $this->idFromFixture(Team::class, 'alpha');
        $this->assertStringContainsString("/item/{$alpha}/view/", $body['rows'][0]['actions'][0]['url']);
        $this->assertArrayNotHasKey('buttons-before-left', $body['slots'], 'No add button');
    }

    public function testABusinessRuleRefusalIsABadRequest(): void
    {
        $this->session()->set('SecurityID', 'valid-token');
        Player::$deleteRefusal = 'This player has played this season.';
        $first = $this->idFromFixture(Player::class, 'first');
        $nested = GridFieldRowsEndpointTest::GRID . 'item/' . $this->idFromFixture(Team::class, 'alpha') . '/ItemEditForm/field/Players/';

        $response = $this->postAction('deleterecord', ['RecordID' => $first], ['X-SecurityID' => 'valid-token'], $nested);
        $this->assertJsonError($response, 400);
        $error = json_decode($response->getBody(), true)['errors'][0];
        $this->assertSame('invalid', $error['reason']);
        $this->assertSame('This player has played this season.', $error['value']);
        $this->assertNotNull(Player::get()->byID($first));
    }

    public function testWrongMethodsGetJsonErrors(): void
    {
        $rows = $this->post(GridFieldRowsEndpointTest::GRID . 'rows', [], GridFieldRowsEndpointTest::JSON);
        $this->assertSame(405, $rows->getStatusCode());
        $this->assertJsonError($rows, 405);

        $action = $this->get(GridFieldRowsEndpointTest::GRID . 'actions/deleterecord', null, GridFieldRowsEndpointTest::JSON);
        $this->assertSame(405, $action->getStatusCode());
        $this->assertJsonError($action, 405);
    }

    public function testTheEndpointIsOnlyAddedWhileTheShellIsOn(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);
        $this->assertSame(404, $this->get(GridFieldRowsEndpointTest::GRID . 'rows')->getStatusCode());

        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $grid = GridField::create('Teams', 'Teams', Team::get());
        $this->assertNotNull($grid->getConfig()->getComponentByType(GridFieldRowsEndpoint::class));
    }

    public function testOnlyGridsDrawingTheStockHolderGetARowsUrl(): void
    {
        $controller = TestController::create();
        $request = new HTTPRequest('GET', '/');
        $request->setSession(new Session([]));
        $controller->setRequest($request);
        $grid = $controller->Form()->Fields()->dataFieldByName('Teams');
        $this->assertStringEndsWith('field/Teams/rows/', GridFieldRowsEndpoint::rowsUrl($grid));

        $ownHolder = new class ('Teams', 'Teams', Team::get()) extends GridField {
            public function FieldHolder($properties = [])
            {
                return 'custom';
            }
        };
        $this->assertNull(GridFieldRowsEndpoint::rowsUrl($ownHolder));
    }

    private function getJson(string $path, string $grid = GridFieldRowsEndpointTest::GRID): array
    {
        $response = $this->get($grid . $path, null, GridFieldRowsEndpointTest::JSON);
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $this->assertSame('application/json', $response->getHeader('Content-Type'));
        return json_decode($response->getBody(), true);
    }

    private function postAction(string $name, array $args, array $headers, string $grid = GridFieldRowsEndpointTest::GRID): HTTPResponse
    {
        return $this->post(
            $grid . 'actions/' . $name,
            [],
            array_merge(GridFieldRowsEndpointTest::JSON, ['Content-Type' => 'application/json'], $headers),
            null,
            json_encode($args)
        );
    }

    private function assertJsonError(HTTPResponse $response, int $code): void
    {
        $this->assertSame('application/json', $response->getHeader('Content-Type'));
        $body = json_decode($response->getBody(), true);
        $this->assertSame('error', $body['status']);
        $this->assertSame($code, $body['errors'][0]['code']);
    }

    private function names(array $body): array
    {
        return array_map(fn ($row) => $row['cells']['Name']['value'], $body['rows']);
    }

    private function titles(array $body): array
    {
        return array_column($body['rows'], 'title');
    }
}
