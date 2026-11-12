<?php

namespace SilverStripe\Admin\Tests;

use LogicException;
use ReflectionProperty;
use SilverStripe\Admin\HierarchyTreeHandler;
use SilverStripe\Admin\Tests\HierarchyTreeHandlerTest\HiddenTreeNode;
use SilverStripe\Admin\Tests\HierarchyTreeHandlerTest\ListAllTestController;
use SilverStripe\Admin\Tests\HierarchyTreeHandlerTest\PermissionTestController;
use SilverStripe\Admin\Tests\HierarchyTreeHandlerTest\PermissionTreeNode;
use SilverStripe\Admin\Tests\HierarchyTreeHandlerTest\TestController;
use SilverStripe\Admin\Tests\HierarchyTreeHandlerTest\TestModelAdmin;
use SilverStripe\Admin\Tests\HierarchyTreeHandlerTest\TreeNode;
use SilverStripe\Admin\Tests\HierarchyTreeHandlerTest\TreeNodeDataExtension;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\CliDebugView;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\ORM\Connect\Database;
use SilverStripe\ORM\Hierarchy\Hierarchy;
use SilverStripe\Security\Member;

class HierarchyTreeHandlerTest extends FunctionalTest
{
    protected static $fixture_file = 'HierarchyTreeHandlerTest.yml';

    protected static $extra_dataobjects = [
        TreeNode::class,
        HiddenTreeNode::class,
        PermissionTreeNode::class,
    ];

    protected static $extra_controllers = [
        TestController::class,
        ListAllTestController::class,
        PermissionTestController::class,
        TestModelAdmin::class,
    ];

    protected function setUp(): void
    {
        parent::setUp();

        // The tree children cache is static and outlives the fixtures of earlier tests
        foreach (['children_for_tree_ids_cache', 'children_for_tree_obj_cache'] as $property) {
            (new ReflectionProperty(Hierarchy::class, $property))->setValue(null, []);
        }
        $this->logInWithPermission('CMS_ACCESS_LeftAndMain');
    }

    public function testTopLevelChildren(): void
    {
        $nodes = $this->getNodes($this->childrenUrl(0));

        $this->assertSame($this->idsOf(['fruit', 'vegetables']), array_column($nodes, 'id'));
        $fruit = $this->findNode($nodes, 'fruit');
        $this->assertSame(
            [
                'id' => $this->idFromFixture(TreeNode::class, 'fruit'),
                'parentId' => 0,
                'treeTitle' => 'Fruit',
                'tooltip' => null,
                'recordClass' => TreeNode::class,
                'classes' => 'class-SilverStripe_Admin_Tests_HierarchyTreeHandlerTest_TreeNode',
                'iconClasses' => null,
                'statusFlags' => [],
                'hasChildren' => true,
                'limited' => false,
                'listViewUrl' => null,
                'editUrl' => 'tree-node/edit/' . $fruit['id'],
                'canView' => true,
                'canEdit' => true,
                'canAddChildren' => true,
            ],
            $fruit
        );
    }

    public function testLinkIsUnderTheSection(): void
    {
        $handler = HierarchyTreeHandler::create(TestController::singleton(), 'tree', TreeNode::class);

        $this->assertSame('admin/hierarchy-tree-test/tree/children', $handler->Link('children'));
        $this->assertSame('admin/hierarchy-tree-test/tree/path', $handler->Link('path'));
    }

    public function testChildrenOfAParentFollowTheSortOrder(): void
    {
        $fruit = $this->idFromFixture(TreeNode::class, 'fruit');

        $nodes = $this->getNodes($this->childrenUrl($fruit));

        $this->assertSame($this->idsOf(['pear', 'plum', 'apple']), array_column($nodes, 'id'));
        $this->assertSame([$fruit, $fruit, $fruit], array_column($nodes, 'parentId'));
        $this->assertSame([false, false, true], array_column($nodes, 'hasChildren'));
    }

    public function testLeafHasNoChildren(): void
    {
        $this->assertSame(
            ['nodes' => []],
            $this->getJson($this->childrenUrl($this->idFromFixture(TreeNode::class, 'pear')))
        );
    }

    public function testParentOverTheLimitIsMarkedAndSendsNoChildren(): void
    {
        Config::modify()->set(TreeNode::class, 'node_threshold_leaf', 3);
        $fruit = $this->idFromFixture(TreeNode::class, 'fruit');

        $nodes = $this->getNodes($this->childrenUrl(0));
        $this->assertTrue($this->findNode($nodes, 'fruit')['limited']);
        $this->assertTrue($this->findNode($nodes, 'fruit')['hasChildren']);
        $this->assertFalse($this->findNode($nodes, 'vegetables')['limited']);

        $this->assertSame(['nodes' => [], 'limited' => true], $this->getJson($this->childrenUrl($fruit)));

        Config::modify()->set(TreeNode::class, 'node_threshold_leaf', 4);
        $this->assertFalse($this->findNode($this->getNodes($this->childrenUrl(0)), 'fruit')['limited']);
        $this->assertArrayNotHasKey('limited', $this->getJson($this->childrenUrl($fruit)));
    }

    public function testPermissionFlagsAndClassWords(): void
    {
        $nodes = $this->getNodes($this->childrenUrl($this->idFromFixture(TreeNode::class, 'fruit')));

        $pear = $this->findNode($nodes, 'pear');
        $this->assertTrue($pear['canView']);
        $this->assertTrue($pear['canEdit']);
        $this->assertTrue($pear['canAddChildren']);
        $this->assertEmpty(array_intersect(['disabled', 'edit-disabled', 'nochildren'], $this->words($pear)));

        $plum = $this->findNode($nodes, 'plum');
        $this->assertTrue($plum['canView']);
        $this->assertFalse($plum['canEdit']);
        $this->assertFalse($plum['canAddChildren']);
        $this->assertContains('edit-disabled', $this->words($plum));
        $this->assertNotContains('disabled', $this->words($plum));
    }

    public function testRecordTheMemberCannotViewIsNotListed(): void
    {
        $nodes = $this->getNodes($this->childrenUrl($this->idFromFixture(TreeNode::class, 'fruit')));

        $this->assertNotContains($this->idFromFixture(TreeNode::class, 'secret'), array_column($nodes, 'id'));
    }

    public function testChildrenOfARecordTheMemberCannotViewAreForbidden(): void
    {
        $this->assertJsonError(403, $this->ajaxGet($this->childrenUrl($this->idFromFixture(TreeNode::class, 'secret'))));
    }

    public function testSubclassCanListRecordsTheMemberCannotView(): void
    {
        $listAllUrl = 'admin/hierarchy-tree-list-all-test/tree/children/';
        $nodes = $this->getNodes($listAllUrl . $this->idFromFixture(TreeNode::class, 'fruit'));

        $this->assertSame($this->idsOf(['pear', 'plum', 'apple', 'secret']), array_column($nodes, 'id'));
        $secret = $this->findNode($nodes, 'secret');
        $this->assertFalse($secret['canView']);
        $this->assertFalse($secret['canEdit']);
        $this->assertFalse($secret['canAddChildren']);
        $this->assertContains('disabled', $this->words($secret));
        $this->assertSame('Secret', $secret['treeTitle']);
        $this->assertTrue($this->findNode($nodes, 'pear')['canView']);

        $children = $this->getNodes($listAllUrl . $secret['id']);
        $this->assertSame($this->idsOf(['seed']), array_column($children, 'id'));
    }

    public function testClassHiddenFromTheTreeIsNotListed(): void
    {
        Config::modify()->set(TreeNode::class, 'hide_from_cms_tree', [HiddenTreeNode::class]);
        $fruit = $this->idFromFixture(TreeNode::class, 'fruit');
        HiddenTreeNode::create(['Title' => 'Hidden child', 'ParentID' => $fruit])->write();
        HiddenTreeNode::create(['Title' => 'Hidden top level', 'Sort' => 3])->write();

        $this->assertSame($this->idsOf(['fruit', 'vegetables']), array_column($this->getNodes($this->childrenUrl(0)), 'id'));
        $this->assertSame($this->idsOf(['pear', 'plum', 'apple']), array_column($this->getNodes($this->childrenUrl($fruit)), 'id'));
    }

    public function testStatusFlags(): void
    {
        $pear = $this->objFromFixture(TreeNode::class, 'pear');
        $pear->Flagged = true;
        $pear->write();

        $nodes = $this->getNodes($this->childrenUrl($this->idFromFixture(TreeNode::class, 'fruit')));

        $node = $this->findNode($nodes, 'pear');
        $this->assertSame(
            [
                ['key' => 'review', 'text' => 'Review', 'title' => 'Waiting for review'],
                ['key' => 'new', 'text' => 'New', 'title' => null],
            ],
            $node['statusFlags']
        );
        $this->assertContains('status-review', $this->words($node));
        $this->assertContains('status-new', $this->words($node));
        $this->assertSame([], $this->findNode($nodes, 'plum')['statusFlags']);
    }

    public function testMarkupInTheTitleComesOutAsPlainText(): void
    {
        $pear = $this->objFromFixture(TreeNode::class, 'pear');
        $pear->Title = 'Salt & <Pepper>';
        $pear->write();

        $nodes = $this->getNodes($this->childrenUrl($this->idFromFixture(TreeNode::class, 'fruit')));

        $this->assertSame('Salt & <Pepper>', $this->findNode($nodes, 'pear')['treeTitle']);
    }

    public function testModelThatCannotHaveChildren(): void
    {
        Config::modify()->set(TreeNode::class, 'allowed_children', 'none');

        $pear = $this->findNode(
            $this->getNodes($this->childrenUrl($this->idFromFixture(TreeNode::class, 'fruit'))),
            'pear'
        );
        $this->assertTrue($pear['canEdit']);
        $this->assertFalse($pear['canAddChildren']);
        $this->assertContains('nochildren', $this->words($pear));
    }

    public function testEmptyTitle(): void
    {
        $nodes = $this->getNodes($this->childrenUrl($this->idFromFixture(TreeNode::class, 'vegetables')));

        $this->assertSame('(no title)', $nodes[0]['treeTitle']);
    }

    public function testInvalidParentID(): void
    {
        $this->assertJsonError(404, $this->ajaxGet($this->childrenUrl(999999)));
        $this->assertJsonError(400, $this->ajaxGet($this->childrenUrl('abc')));
        $this->assertJsonError(400, $this->ajaxGet($this->childrenUrl(-1)));
        $this->assertJsonError(400, $this->ajaxGet('admin/hierarchy-tree-test/tree/children'));
    }

    public function testPathToADeepRecord(): void
    {
        $core = $this->idFromFixture(TreeNode::class, 'core');

        $this->assertSame(['path' => $this->idsOf(['fruit', 'apple'])], $this->getJson($this->pathUrl($core)));
    }

    public function testPathToATopLevelRecord(): void
    {
        $this->assertSame(['path' => []], $this->getJson($this->pathUrl($this->idFromFixture(TreeNode::class, 'fruit'))));
    }

    public function testPathToAnInvalidRecord(): void
    {
        $this->assertJsonError(404, $this->ajaxGet($this->pathUrl(999999)));
        $this->assertJsonError(400, $this->ajaxGet($this->pathUrl(0)));
        $this->assertJsonError(400, $this->ajaxGet($this->pathUrl('abc')));
        $this->assertJsonError(400, $this->ajaxGet('admin/hierarchy-tree-test/tree/path'));
        $this->assertJsonError(403, $this->ajaxGet($this->pathUrl($this->idFromFixture(TreeNode::class, 'secret'))));
    }

    public function testNoAccessToTheSection(): void
    {
        $core = $this->idFromFixture(TreeNode::class, 'core');
        $this->logInWithPermission('SOME_OTHER_PERMISSION');

        $this->assertSame(403, $this->ajaxGet($this->childrenUrl(0))->getStatusCode());
        $this->assertSame(403, $this->ajaxGet($this->pathUrl($core))->getStatusCode());
        $this->assertSameRefusal($this->ajaxGet('admin/hierarchy-tree-test'), $this->ajaxGet($this->childrenUrl(0)));
        $this->assertSameRefusal($this->ajaxGet('admin/hierarchy-tree-test'), $this->ajaxGet($this->pathUrl($core)));

        $this->logOut();
        $this->assertSame('1', $this->ajaxGet($this->childrenUrl(0))->getHeader('X-Reauthenticate'));
        $this->assertSameRefusal($this->ajaxGet('admin/hierarchy-tree-test'), $this->ajaxGet($this->childrenUrl(0)));
    }

    public function testOnlyGetIsAllowed(): void
    {
        $response = $this->post($this->childrenUrl(0), []);
        $this->assertNotSame(200, $response->getStatusCode());
        $this->assertStringNotContainsString('"treeTitle"', (string) $response->getBody());

        $core = $this->idFromFixture(TreeNode::class, 'core');
        $this->assertSame(405, $this->post('admin/hierarchy-tree-test/tree/apiReadChildren/0', [])->getStatusCode());
        $this->assertSame(405, $this->post('admin/hierarchy-tree-test/tree/apiReadPath/' . $core, [])->getStatusCode());
    }

    public function testModelWithoutHierarchy(): void
    {
        Config::modify()->set(TestController::class, 'model_class', Member::class);

        $this->expectException(LogicException::class);
        $this->expectExceptionMessage(Hierarchy::class);
        $this->ajaxGet($this->childrenUrl(0));
    }

    public function testModelAdminServesTheTreeOfItsModel(): void
    {
        $modelAdminUrl = TestModelAdmin::singleton()->getLinkForModelClass(TreeNode::class);
        $this->assertSame(
            'admin/hierarchy-tree-model-admin-test/SilverStripe-Admin-Tests-HierarchyTreeHandlerTest-TreeNode',
            $modelAdminUrl
        );

        $nodes = $this->getNodes($modelAdminUrl . '/tree/children/' . $this->idFromFixture(TreeNode::class, 'fruit'));
        $this->assertSame($this->idsOf(['pear', 'plum', 'apple']), array_column($nodes, 'id'));
        $this->assertSame(
            ['path' => $this->idsOf(['fruit', 'apple'])],
            $this->getJson($modelAdminUrl . '/tree/path/' . $this->idFromFixture(TreeNode::class, 'core'))
        );
    }

    public function testExtensionUpdatesTheNodeData(): void
    {
        HierarchyTreeHandler::add_extension(TreeNodeDataExtension::class);

        $nodes = $this->getNodes($this->childrenUrl($this->idFromFixture(TreeNode::class, 'fruit')));

        $this->assertSame(['Fruit', 'Fruit', 'Fruit'], array_column($nodes, 'parentTitle'));
        $this->assertNull($this->getNodes($this->childrenUrl(0))[0]['parentTitle']);
        $this->assertSame('admin/hierarchy-tree-test', rtrim($nodes[0]['sectionLink'], '/'));
        $this->assertSame(TreeNode::class, $nodes[0]['modelClass']);
    }

    public function testQueryCountDoesNotGrowWithTheNumberOfChildren(): void
    {
        $fruit = $this->idFromFixture(TreeNode::class, 'fruit');
        $vegetables = $this->idFromFixture(TreeNode::class, 'vegetables');
        for ($i = 1; $i <= 50; $i++) {
            TreeNode::create([
                'Title' => "Vegetable $i",
                'ParentID' => $vegetables,
                'Access' => $i % 2 ? 'Edit' : 'None',
            ])->write();
        }
        // Every listed node is a parent, so a query made only for nodes with children is counted too
        foreach (TreeNode::get()->filter('ParentID', [$fruit, $vegetables])->column('ID') as $id) {
            TreeNode::create(['Title' => "Child of $id", 'ParentID' => $id])->write();
        }
        // Fills the caches every request shares, so both counts start from the same state
        $this->getJson($this->childrenUrl(0));

        $fourChildren = $this->countQueries($this->childrenUrl($fruit));
        $fiftyOneChildren = $this->countQueries($this->childrenUrl($vegetables));
        $this->assertGreaterThan(0, $fourChildren);
        $this->assertSame($fourChildren, $fiftyOneChildren);
    }

    public function testQueryCountDoesNotGrowWithChildrenBehindAPermissionChecker(): void
    {
        $parentIDs = [];
        foreach ([4, 50] as $childCount) {
            $parent = PermissionTreeNode::create(['Title' => "Parent of $childCount", 'CanViewType' => 'LoggedInUsers']);
            $parentIDs[] = $parent->write();
            for ($i = 1; $i <= $childCount; $i++) {
                PermissionTreeNode::create([
                    'Title' => "Child $i",
                    'ParentID' => $parent->ID,
                    'CanViewType' => $i % 2 ? 'Inherit' : 'OnlyTheseUsers',
                ])->write();
            }
        }
        $url = 'admin/hierarchy-tree-permission-test/tree/children/';
        // Fills the caches every request shares, so both counts start from the same state
        $this->getJson($url . '0');

        $fourChildren = $this->countQueries($url . $parentIDs[0]);
        $fiftyChildren = $this->countQueries($url . $parentIDs[1]);
        $this->assertGreaterThan(0, $fourChildren);
        $this->assertSame($fourChildren, $fiftyChildren);
        $this->assertCount(25, $this->getNodes($url . $parentIDs[1]));
    }

    private function countQueries(string $url): int
    {
        $counter = new class extends CliDebugView {
            public int $count = 0;

            public function renderMessage($message, $caller, $showHeader = true)
            {
                if (is_a($caller['class'] ?? '', Database::class, true) && $caller['function'] === 'displayQuery') {
                    $this->count++;
                    return '';
                }
                return parent::renderMessage($message, $caller, $showHeader);
            }
        };
        Injector::inst()->registerService($counter, CliDebugView::class);
        $this->getJson($url . '?showqueries=1');
        Injector::inst()->unregisterNamedObject(CliDebugView::class);
        return $counter->count;
    }

    private function childrenUrl(int|string $parentID): string
    {
        return 'admin/hierarchy-tree-test/tree/children/' . $parentID;
    }

    private function pathUrl(int|string $id): string
    {
        return 'admin/hierarchy-tree-test/tree/path/' . $id;
    }

    private function ajaxGet(string $url): HTTPResponse
    {
        return $this->get($url, null, ['X-Requested-With' => 'XMLHttpRequest']);
    }

    private function getJson(string $url): array
    {
        $response = $this->ajaxGet($url);
        $this->assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $this->assertSame('application/json', $response->getHeader('Content-Type'));
        return json_decode($response->getBody(), true);
    }

    private function getNodes(string $url): array
    {
        $body = $this->getJson($url);
        $this->assertSame(['nodes'], array_keys($body));
        return $body['nodes'];
    }

    private function assertJsonError(int $code, HTTPResponse $response): void
    {
        $this->assertSame($code, $response->getStatusCode());
        $this->assertSame('application/json', $response->getHeader('Content-Type'));
        $body = json_decode($response->getBody(), true);
        $this->assertSame('error', $body['status']);
        $this->assertSame($code, $body['errors'][0]['code']);
    }

    private function assertSameRefusal(HTTPResponse $sectionResponse, HTTPResponse $treeResponse): void
    {
        $this->assertSame($sectionResponse->getStatusCode(), $treeResponse->getStatusCode());
        $this->assertSame($sectionResponse->getBody(), $treeResponse->getBody());
        $this->assertSame($sectionResponse->getHeader('X-Reauthenticate'), $treeResponse->getHeader('X-Reauthenticate'));
    }

    private function idsOf(array $fixtureNames): array
    {
        return array_map(fn (string $name) => $this->idFromFixture(TreeNode::class, $name), $fixtureNames);
    }

    private function findNode(array $nodes, string $fixtureName): array
    {
        $id = $this->idFromFixture(TreeNode::class, $fixtureName);
        foreach ($nodes as $node) {
            if ($node['id'] === $id) {
                return $node;
            }
        }
        $this->fail("Node $fixtureName is not in the response");
    }

    private function words(array $node): array
    {
        return explode(' ', $node['classes']);
    }
}
