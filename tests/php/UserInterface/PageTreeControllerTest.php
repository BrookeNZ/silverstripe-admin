<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use ReflectionProperty;
use SilverStripe\Admin\Tests\UserInterface\PageTreeControllerTest\FailingExtension;
use SilverStripe\Admin\UserInterface\PageTreeController;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\ORM\DB;

class PageTreeControllerTest extends FunctionalTest
{
    protected static $fixture_file = 'PageTreeControllerTest.yml';

    private const AJAX = ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json'];

    public static function setUpBeforeClass(): void
    {
        if (!class_exists(SiteTree::class)) {
            static::markTestSkipped('The page tree endpoints need silverstripe/cms');
        }
        parent::setUpBeforeClass();
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
    }

    public function testRootChildrenLeaveOutPagesTheMemberCannotView(): void
    {
        $body = $this->getJson('admin/pages/tree/children/0');

        $this->assertSame(['Alpha', 'Bravo', 'Wide', 'Family'], array_column($body['items'], 'title'));
        $this->assertSame(['totalCount' => 4, 'pageSize' => 50, 'page' => 1, 'hasMore' => false], $body['pageInfo']);
    }

    public function testChildRowsCarryTheirFlagsAndPermissions(): void
    {
        foreach (['family', 'familypublished', 'familymodified'] as $name) {
            $this->objFromFixture(SiteTree::class, $name)->publishSingle();
        }
        $modified = $this->objFromFixture(SiteTree::class, 'familymodified');
        $modified->Title = 'Family modified';
        $modified->MenuTitle = 'Changed';
        $modified->write();

        $body = $this->getJson('admin/pages/tree/children/' . $this->idFor('family'));

        $draft = [
            'key' => 'addedtodraft',
            'text' => 'Draft',
            'title' => 'Item has not been published yet',
        ];
        $row = fn (string $name, string $title, int $sort, array $extra) => array_replace([
            'id' => $this->idFor($name),
            'parentId' => $this->idFor('family'),
            'title' => $title,
            'menuTitle' => $title,
            'urlSegment' => str_replace(' ', '-', strtolower($title)),
            'className' => SiteTree::class,
            'hasChildren' => false,
            'childCount' => 0,
            'statusFlags' => [$draft],
            'canEdit' => true,
            'canDelete' => true,
            'sort' => $sort,
        ], $extra);
        $expected = [
            $row('familypublished', 'Family published', 1, ['statusFlags' => []]),
            $row('familydraft', 'Family draft', 2, []),
            $row('familymodified', 'Family modified', 3, [
                'menuTitle' => 'Changed',
                'statusFlags' => [[
                    'key' => 'modified',
                    'text' => 'Modified',
                    'title' => 'Item has unpublished changes',
                ]],
            ]),
            $row('familylocked', 'Family locked', 5, ['canEdit' => false, 'canDelete' => false]),
            $row('familyguarded', 'Family guarded', 6, [
                'hasChildren' => true,
                'childCount' => 1,
                'canDelete' => false,
            ]),
        ];
        foreach ($expected as $index => $item) {
            $this->assertSame(array_keys($item), array_keys($body['items'][$index]));
            $this->assertSame($item, $body['items'][$index]);
        }
        $this->assertCount(5, $body['items']);
        $this->assertSame(5, $body['pageInfo']['totalCount']);
    }

    public function testAdministratorsCanDeleteEveryRow(): void
    {
        $this->logInWithPermission('ADMIN');

        $body = $this->getJson('admin/pages/tree/children/' . $this->idFor('family'));

        $this->assertCount(6, $body['items']);
        $this->assertSame(array_fill(0, 6, true), array_column($body['items'], 'canDelete'));
        $this->assertSame(array_fill(0, 6, true), array_column($body['items'], 'canEdit'));
    }

    public function testQueriesDoNotGrowWithTheRows(): void
    {
        $url = 'admin/pages/tree/children/' . $this->idFor('wide');
        $this->countQueries($url);

        $one = $this->countQueries($url . '?limit=1');
        $five = $this->countQueries($url . '?limit=5');

        $this->assertSame($one, $five);
    }

    public function testChildrenArePaged(): void
    {
        $url = 'admin/pages/tree/children/' . $this->idFor('wide');

        $first = $this->getJson($url . '?limit=2');
        $last = $this->getJson($url . '?limit=2&page=3');

        $this->assertSame(['Wide one', 'Wide two'], array_column($first['items'], 'title'));
        $this->assertSame(['totalCount' => 5, 'pageSize' => 2, 'page' => 1, 'hasMore' => true], $first['pageInfo']);
        $this->assertSame(['Wide five'], array_column($last['items'], 'title'));
        $this->assertFalse($last['pageInfo']['hasMore']);
    }

    public function testLiveStageListsOnlyPublishedChildren(): void
    {
        foreach (['wide', 'wide2', 'wide4'] as $name) {
            $this->objFromFixture(SiteTree::class, $name)->publishSingle();
        }
        $url = 'admin/pages/tree/children/' . $this->idFor('wide');

        $live = $this->getJson($url . '?stage=live');
        $draft = $this->getJson($url . '?stage=draft');

        $this->assertSame(['Wide two', 'Wide four'], array_column($live['items'], 'title'));
        $this->assertSame(5, $draft['pageInfo']['totalCount']);
        $this->assertSame(
            ['Wide'],
            array_column($this->getJson('admin/pages/tree/children/0?stage=live')['items'], 'title')
        );
    }

    public function testDraftOnlyParentIsNotFoundInLive(): void
    {
        $response = $this->get('admin/pages/tree/children/' . $this->idFor('alpha') . '?stage=live', null, self::AJAX);

        $this->assertError($response, 404, 'notFound');
    }

    public function testUnknownIdIsNotFound(): void
    {
        $this->assertError($this->get('admin/pages/tree/children/999999', null, self::AJAX), 404, 'notFound');
        $this->assertError($this->get('admin/pages/tree/ancestors/999999', null, self::AJAX), 404, 'notFound');
        $this->assertError($this->get('admin/pages/tree/children/abc', null, self::AJAX), 404, 'notFound');
    }

    public function testNodeTheMemberCannotViewIsForbidden(): void
    {
        $restricted = $this->idFor('restricted');
        $child = $this->idFor('restrictedchild');

        $this->assertError($this->get('admin/pages/tree/children/' . $restricted, null, self::AJAX), 403, 'forbidden');
        $this->assertError($this->get('admin/pages/tree/ancestors/' . $child, null, self::AJAX), 403, 'forbidden');
    }

    public function testAdministratorsSeeRestrictedPages(): void
    {
        $this->logInWithPermission('ADMIN');

        $body = $this->getJson('admin/pages/tree/children/0');

        $this->assertContains('Restricted', array_column($body['items'], 'title'));
    }

    public function testBadParametersNameTheField(): void
    {
        $url = 'admin/pages/tree/children/0';

        $this->assertError($this->get($url . '?limit=0', null, self::AJAX), 400, 'outOfRange', 'limit');
        $this->assertError($this->get($url . '?limit=251', null, self::AJAX), 400, 'outOfRange', 'limit');
        $this->assertError($this->get($url . '?page=x', null, self::AJAX), 400, 'invalid', 'page');
        $this->assertError($this->get($url . '?stage=archive', null, self::AJAX), 400, 'invalid', 'stage');
    }

    public function testPageBeyondTheLastIsEmpty(): void
    {
        $body = $this->getJson('admin/pages/tree/children/0?page=' . PHP_INT_MAX);

        $this->assertSame([], $body['items']);
        $this->assertFalse($body['pageInfo']['hasMore']);
        $this->assertSame([], $this->getJson('admin/pages/tree/search?q=wide&page=' . PHP_INT_MAX)['items']);
    }

    public function testUncaughtExceptionsAnswerJson(): void
    {
        PageTreeController::add_extension(FailingExtension::class);
        try {
            $response = $this->get('admin/pages/tree/children/0', null, self::AJAX);
        } finally {
            PageTreeController::remove_extension(FailingExtension::class);
        }

        $this->assertError($response, 500, 'serverError');
        $this->assertSame('application/json', $response->getHeader('Content-Type'));
    }

    public function testAncestorsOfADeepNodeCarryTheirPage(): void
    {
        $body = $this->getJson('admin/pages/tree/ancestors/' . $this->idFor('deep6') . '?limit=1');

        $this->assertSame(
            ['Bravo', 'Deep 1', 'Deep 2', 'Deep 3', 'Deep 4', 'Deep 5'],
            array_column($body['items'], 'title')
        );
        $this->assertSame([2, 1, 1, 2, 1, 1], array_column($body['items'], 'page'));
        $this->assertSame(
            ['id' => $this->idFor('deep6'), 'parentId' => $this->idFor('deep5'), 'page' => 1],
            $body['node']
        );
        $this->assertSame(1, $body['pageSize']);
    }

    public function testAncestorsOfATopLevelNodeAreEmpty(): void
    {
        $body = $this->getJson('admin/pages/tree/ancestors/' . $this->idFor('wide') . '?limit=2');

        $this->assertSame([], $body['items']);
        $this->assertSame(2, $body['node']['page']);
    }

    public function testSearchReturnsMatchesWithAncestorIds(): void
    {
        $body = $this->getJson('admin/pages/tree/search?q=deep%206');

        $this->assertSame(['Deep 6'], array_column($body['items'], 'title'));
        $this->assertSame(
            array_map(fn ($name) => $this->idFor($name), ['bravo', 'deep1', 'deep2', 'deep3', 'deep4', 'deep5']),
            $body['items'][0]['ancestorIds']
        );
        $this->assertSame(1, $body['pageInfo']['totalCount']);
    }

    public function testSearchMatchesMenuTitleAndLeavesOutPagesTheMemberCannotView(): void
    {
        $this->assertSame(['Bravo'], array_column($this->getJson('admin/pages/tree/search?q=menu')['items'], 'title'));
        $this->assertSame([], $this->getJson('admin/pages/tree/search?q=restricted')['items']);
    }

    public function testSearchLeavesOutMatchesBelowAPageTheMemberCannotView(): void
    {
        $this->assertSame([], $this->getJson('admin/pages/tree/search?q=opened')['items']);
        $this->assertSame(0, $this->getJson('admin/pages/tree/search?q=opened')['pageInfo']['totalCount']);

        $this->logInWithPermission('ADMIN');
        $body = $this->getJson('admin/pages/tree/search?q=opened');
        $this->assertSame(['Opened child'], array_column($body['items'], 'title'));
        $this->assertSame([$this->idFor('restricted')], $body['items'][0]['ancestorIds']);
    }

    public function testSearchIsPaged(): void
    {
        $body = $this->getJson('admin/pages/tree/search?q=wide&limit=4');

        $this->assertCount(4, $body['items']);
        $this->assertSame(['totalCount' => 6, 'pageSize' => 4, 'page' => 1, 'hasMore' => true], $body['pageInfo']);
        $this->assertSame([], $body['items'][0]['ancestorIds']);
    }

    public function testSearchNeedsAQuery(): void
    {
        $this->assertError($this->get('admin/pages/tree/search', null, self::AJAX), 400, 'required', 'q');
        $this->assertError($this->get('admin/pages/tree/search?q=d', null, self::AJAX), 400, 'tooShort', 'q');
        $this->assertError($this->get('admin/pages/tree/search?q[]=wide', null, self::AJAX), 400, 'invalid', 'q');
    }

    public function testOnlyGetIsAllowed(): void
    {
        $response = $this->post('admin/pages/tree/children/0', [], self::AJAX);

        $this->assertError($response, 405, 'methodNotAllowed');
        $this->assertSame('GET, HEAD', $response->getHeader('Allow'));
    }

    public function testAccessNeedsThePagesSectionPermission(): void
    {
        $this->logInWithPermission('CMS_ACCESS_AssetAdmin');
        $this->assertError($this->get('admin/pages/tree/children/0', null, self::AJAX), 403, 'forbidden');

        $this->logOut();
        $this->assertError($this->get('admin/pages/tree/children/0', null, self::AJAX), 401, 'notLoggedIn');
    }

    public function testWithoutAPageModelEveryActionIsNotFound(): void
    {
        Config::modify()->set(PageTreeController::class, 'model_class', 'App\\Missing\\Model');

        $this->assertError($this->get('admin/pages/tree/children/0', null, self::AJAX), 404, 'notFound');
    }

    /**
     * The database counts queries only while showqueries is in the request; whitelist mode prints none of them
     */
    private function countQueries(string $url): int
    {
        $connection = DB::get_conn();
        $counter = new ReflectionProperty($connection, 'queryCount');
        $before = $counter->getValue($connection);
        $separator = str_contains($url, '?') ? '&' : '?';
        $this->getJson($url . $separator . 'showqueries=whitelist');
        return $counter->getValue($connection) - $before;
    }

    private function getJson(string $url): array
    {
        $response = $this->get($url, null, self::AJAX);
        $this->assertSame(200, $response->getStatusCode(), $response->getBody());
        $this->assertSame('application/json', $response->getHeader('Content-Type'));
        return json_decode($response->getBody(), true);
    }

    private function assertError(HTTPResponse $response, int $code, string $reason, ?string $field = null): void
    {
        $this->assertSame($code, $response->getStatusCode(), $response->getBody());
        $error = json_decode($response->getBody(), true)['errors'][0];
        $this->assertSame($code, $error['code']);
        $this->assertSame($reason, $error['reason']);
        $this->assertSame($field, $error['field'] ?? null);
    }

    private function idFor(string $name): int
    {
        return (int) $this->idFromFixture(SiteTree::class, $name);
    }
}
