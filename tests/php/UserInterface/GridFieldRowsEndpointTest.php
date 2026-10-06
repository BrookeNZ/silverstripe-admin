<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
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
use SilverStripe\Security\SecurityToken;

class GridFieldRowsEndpointTest extends FunctionalTest
{
    protected static $fixture_file = 'GridFieldRowsEndpointTest.yml';

    protected static $extra_dataobjects = [Team::class];

    protected static $extra_controllers = [TestController::class];

    private const JSON = ['Accept' => 'application/json', 'X-Requested-With' => 'XMLHttpRequest'];

    private const GRID = 'GridFieldRowsEndpointTest/Form/field/Teams/';

    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        SecurityToken::enable();
        TestController::$withBadge = false;
        TestController::$nameFormat = null;
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
        $this->assertStringEndsWith('field/Teams/item/new/', $addNew['props']['url']);
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

    private function getJson(string $path): array
    {
        $response = $this->get(GridFieldRowsEndpointTest::GRID . $path, null, GridFieldRowsEndpointTest::JSON);
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $this->assertSame('application/json', $response->getHeader('Content-Type'));
        return json_decode($response->getBody(), true);
    }

    private function postAction(string $name, array $args, array $headers): HTTPResponse
    {
        return $this->post(
            GridFieldRowsEndpointTest::GRID . 'actions/' . $name,
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
}
