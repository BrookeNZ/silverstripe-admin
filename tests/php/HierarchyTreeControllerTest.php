<?php

namespace SilverStripe\Admin\Tests;

use LogicException;
use ReflectionProperty;
use SilverStripe\Admin\Tests\HierarchyTreeControllerTest\HiddenTreeNode;
use SilverStripe\Admin\Tests\HierarchyTreeControllerTest\JsonErrorExtension;
use SilverStripe\Admin\Tests\HierarchyTreeControllerTest\ListAllTestController;
use SilverStripe\Admin\Tests\HierarchyTreeControllerTest\PermissionTestController;
use SilverStripe\Admin\Tests\HierarchyTreeControllerTest\PermissionTreeNode;
use SilverStripe\Admin\Tests\HierarchyTreeControllerTest\TestController;
use SilverStripe\Admin\Tests\HierarchyTreeControllerTest\TreeNode;
use SilverStripe\Admin\Tests\HierarchyTreeControllerTest\TreeNodeDataExtension;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\CliDebugView;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\ORM\Connect\Database;
use SilverStripe\ORM\Hierarchy\Hierarchy;
use SilverStripe\Security\Member;

class HierarchyTreeControllerTest extends FunctionalTest
{
    protected static $fixture_file = 'HierarchyTreeControllerTest.yml';

    protected static $extra_dataobjects = [
        TreeNode::class,
        HiddenTreeNode::class,
        PermissionTreeNode::class,
    ];

    protected static $extra_controllers = [
        TestController::class,
        ListAllTestController::class,
        PermissionTestController::class,
    ];

    protected function setUp(): void
    {
        parent::setUp();

        // Hierarchy keeps the caches of the tree children in static properties, which outlive the fixtures of earlier
        // tests.
        foreach (['children_for_tree_ids_cache', 'children_for_tree_obj_cache'] as $property) {
            (new ReflectionProperty(Hierarchy::class, $property))->setValue(null, []);
        }
        $this->logInWithPermission('CMS_ACCESS_LeftAndMain');
    }

    public function testTopLevelChildren(): void
    {
        $nodes = $this->getNodes($this->childrenUrl(0));

        $this->assertSame($this->idsOf(['parent', 'secondParent']), array_column($nodes, 'id'));
        $parent = $this->findNode($nodes, 'parent');
        $this->assertSame(
            [
                'id' => $this->idFromFixture(TreeNode::class, 'parent'),
                'parentId' => 0,
                'treeTitle' => 'Parent',
                'tooltip' => null,
                'recordClass' => TreeNode::class,
                'classes' => 'class-SilverStripe_Admin_Tests_HierarchyTreeControllerTest_TreeNode',
                'iconClasses' => null,
                'statusFlags' => [],
                'hasChildren' => true,
                'limited' => false,
                'listViewUrl' => null,
                'editUrl' => 'tree-node/edit/' . $parent['id'],
                'canView' => true,
                'canEdit' => true,
                'canAddChildren' => true,
            ],
            $parent
        );
    }

    public function testLinkIsUnderTheUrlSegment(): void
    {
        $this->assertSame('admin/hierarchy-tree-test/children', TestController::singleton()->Link('children'));
        $this->assertSame('admin/hierarchy-tree-test/path', TestController::singleton()->Link('path'));
    }

    public function testChildrenOfAParentAreTheViewableRecordsInSortOrder(): void
    {
        $parent = $this->idFromFixture(TreeNode::class, 'parent');

        $nodes = $this->getNodes($this->childrenUrl($parent));

        $this->assertSame($this->idsOf(['editable', 'viewOnly', 'withChild']), array_column($nodes, 'id'));
        $this->assertNotContains($this->idFromFixture(TreeNode::class, 'hidden'), array_column($nodes, 'id'));
        $this->assertSame([$parent, $parent, $parent], array_column($nodes, 'parentId'));
        $this->assertSame([false, false, true], array_column($nodes, 'hasChildren'));
    }

    public function testChildlessRecord(): void
    {
        $this->assertSame(
            ['nodes' => []],
            $this->getJson($this->childrenUrl($this->idFromFixture(TreeNode::class, 'editable')))
        );
    }

    public function testParentOverTheLimitIsMarkedAndSendsNoChildren(): void
    {
        Config::modify()->set(TreeNode::class, 'node_threshold_leaf', 3);
        $parent = $this->idFromFixture(TreeNode::class, 'parent');

        $nodes = $this->getNodes($this->childrenUrl(0));
        $this->assertTrue($this->findNode($nodes, 'parent')['limited']);
        $this->assertTrue($this->findNode($nodes, 'parent')['hasChildren']);
        $this->assertFalse($this->findNode($nodes, 'secondParent')['limited']);

        $this->assertSame(['nodes' => [], 'limited' => true], $this->getJson($this->childrenUrl($parent)));

        Config::modify()->set(TreeNode::class, 'node_threshold_leaf', 4);
        $this->assertFalse($this->findNode($this->getNodes($this->childrenUrl(0)), 'parent')['limited']);
        $this->assertArrayNotHasKey('limited', $this->getJson($this->childrenUrl($parent)));
    }

    public function testPermissionFlagsAndClassWords(): void
    {
        $nodes = $this->getNodes($this->childrenUrl($this->idFromFixture(TreeNode::class, 'parent')));

        $editable = $this->findNode($nodes, 'editable');
        $this->assertTrue($editable['canView']);
        $this->assertTrue($editable['canEdit']);
        $this->assertTrue($editable['canAddChildren']);
        $this->assertEmpty(array_intersect(['disabled', 'edit-disabled', 'nochildren'], $this->words($editable)));

        $viewOnly = $this->findNode($nodes, 'viewOnly');
        $this->assertTrue($viewOnly['canView']);
        $this->assertFalse($viewOnly['canEdit']);
        $this->assertFalse($viewOnly['canAddChildren']);
        $this->assertContains('edit-disabled', $this->words($viewOnly));
        $this->assertNotContains('disabled', $this->words($viewOnly));
    }

    public function testChildrenOfARecordTheMemberCannotViewAreForbidden(): void
    {
        $this->assertJsonError(
            403,
            $this->ajaxGet($this->childrenUrl($this->idFromFixture(TreeNode::class, 'hidden')))
        );
    }

    public function testSubclassCanListRecordsTheMemberCannotView(): void
    {
        $listAllUrl = 'admin/hierarchy-tree-list-all-test/children/';
        $nodes = $this->getNodes($listAllUrl . $this->idFromFixture(TreeNode::class, 'parent'));

        $this->assertSame($this->idsOf(['editable', 'viewOnly', 'withChild', 'hidden']), array_column($nodes, 'id'));
        $hidden = $this->findNode($nodes, 'hidden');
        $this->assertFalse($hidden['canView']);
        $this->assertFalse($hidden['canEdit']);
        $this->assertFalse($hidden['canAddChildren']);
        $this->assertContains('disabled', $this->words($hidden));
        $this->assertSame('Hidden', $hidden['treeTitle']);
        $this->assertTrue($this->findNode($nodes, 'editable')['canView']);

        $children = $this->getNodes($listAllUrl . $hidden['id']);
        $this->assertSame($this->idsOf(['childOfHidden']), array_column($children, 'id'));
    }

    public function testClassHiddenFromTheTreeIsNotListed(): void
    {
        Config::modify()->set(TreeNode::class, 'hide_from_cms_tree', [HiddenTreeNode::class]);
        $parent = $this->idFromFixture(TreeNode::class, 'parent');
        HiddenTreeNode::create(['Title' => 'Hidden child', 'ParentID' => $parent])->write();
        HiddenTreeNode::create(['Title' => 'Hidden top level', 'Sort' => 3])->write();

        $this->assertSame(
            $this->idsOf(['parent', 'secondParent']),
            array_column($this->getNodes($this->childrenUrl(0)), 'id')
        );
        $this->assertSame($this->idsOf(['editable', 'viewOnly', 'withChild']), array_column($this->getNodes($this->childrenUrl($parent)), 'id'));
    }

    public function testStatusFlags(): void
    {
        $editable = $this->objFromFixture(TreeNode::class, 'editable');
        $editable->Flagged = true;
        $editable->write();

        $nodes = $this->getNodes($this->childrenUrl($this->idFromFixture(TreeNode::class, 'parent')));

        $node = $this->findNode($nodes, 'editable');
        $this->assertSame(
            [
                ['key' => 'review', 'text' => 'Review', 'title' => 'Waiting for review'],
                ['key' => 'new', 'text' => 'New', 'title' => null],
            ],
            $node['statusFlags']
        );
        $this->assertContains('status-review', $this->words($node));
        $this->assertContains('status-new', $this->words($node));
        $this->assertSame([], $this->findNode($nodes, 'viewOnly')['statusFlags']);
    }

    public function testMarkupInTheTitleComesOutAsPlainText(): void
    {
        $editable = $this->objFromFixture(TreeNode::class, 'editable');
        $editable->Title = 'Root & <Branch>';
        $editable->write();

        $nodes = $this->getNodes($this->childrenUrl($this->idFromFixture(TreeNode::class, 'parent')));

        $this->assertSame('Root & <Branch>', $this->findNode($nodes, 'editable')['treeTitle']);
    }

    public function testEmptyTitle(): void
    {
        $nodes = $this->getNodes($this->childrenUrl($this->idFromFixture(TreeNode::class, 'secondParent')));

        $this->assertSame('(no title)', $nodes[0]['treeTitle']);
    }

    public function testInvalidParentID(): void
    {
        $this->assertJsonError(404, $this->ajaxGet($this->childrenUrl(999999)));
        $this->assertJsonError(400, $this->ajaxGet($this->childrenUrl('abc')));
        $this->assertJsonError(400, $this->ajaxGet($this->childrenUrl(-1)));
        $this->assertJsonError(400, $this->ajaxGet('admin/hierarchy-tree-test/children'));
    }

    public function testRequestWithoutAnActionIsNotFound(): void
    {
        $this->assertJsonError(404, $this->ajaxGet('admin/hierarchy-tree-test'));
        $this->assertJsonError(404, $this->ajaxGet('admin/hierarchy-tree-test/index'));
    }

    public function testJsonErrorHooksRun(): void
    {
        TestController::add_extension(JsonErrorExtension::class);

        $this->assertSame('404', $this->ajaxGet($this->childrenUrl(999999))->getHeader('X-Tree-Error'));
        $this->assertSame('400', $this->ajaxGet($this->pathUrl('abc'))->getHeader('X-Tree-Error'));
    }

    public function testPathToADeepRecord(): void
    {
        $grandchild = $this->idFromFixture(TreeNode::class, 'grandchild');

        $this->assertSame(
            ['path' => $this->idsOf(['parent', 'withChild'])],
            $this->getJson($this->pathUrl($grandchild))
        );
    }

    public function testPathToATopLevelRecord(): void
    {
        $this->assertSame(['path' => []], $this->getJson($this->pathUrl($this->idFromFixture(TreeNode::class, 'parent'))));
    }

    public function testPathToAnInvalidRecord(): void
    {
        $this->assertJsonError(404, $this->ajaxGet($this->pathUrl(999999)));
        $this->assertJsonError(400, $this->ajaxGet($this->pathUrl(0)));
        $this->assertJsonError(400, $this->ajaxGet($this->pathUrl('abc')));
        $this->assertJsonError(400, $this->ajaxGet('admin/hierarchy-tree-test/path'));
        $this->assertJsonError(403, $this->ajaxGet($this->pathUrl($this->idFromFixture(TreeNode::class, 'hidden'))));
    }

    public function testNoAccessWithoutTheRequiredPermission(): void
    {
        $grandchild = $this->idFromFixture(TreeNode::class, 'grandchild');
        $this->logInWithPermission('SOME_OTHER_PERMISSION');

        $this->assertSame(403, $this->ajaxGet($this->childrenUrl(0))->getStatusCode());
        $this->assertSame(403, $this->ajaxGet($this->pathUrl($grandchild))->getStatusCode());

        $this->logInWithPermission('CMS_ACCESS_' . TestController::class);
        $this->assertSame(200, $this->ajaxGet($this->childrenUrl(0))->getStatusCode());

        $this->logOut();
        $response = $this->ajaxGet($this->childrenUrl(0));
        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('1', $response->getHeader('X-Reauthenticate'));
    }

    public function testOnlyGetIsAllowed(): void
    {
        $response = $this->post($this->childrenUrl(0), []);
        $this->assertNotSame(200, $response->getStatusCode());
        $this->assertStringNotContainsString('"treeTitle"', (string) $response->getBody());

        $grandchild = $this->idFromFixture(TreeNode::class, 'grandchild');
        $this->assertSame(405, $this->post('admin/hierarchy-tree-test/apiReadChildren/0', [])->getStatusCode());
        $this->assertSame(
            405,
            $this->post('admin/hierarchy-tree-test/apiReadPath/' . $grandchild, [])->getStatusCode()
        );
    }

    public function testModelWithoutHierarchy(): void
    {
        Config::modify()->set(TestController::class, 'model_class', Member::class);

        $this->expectException(LogicException::class);
        $this->expectExceptionMessage(Hierarchy::class);
        $this->ajaxGet($this->childrenUrl(0));
    }

    public function testExtensionUpdatesTheNodeData(): void
    {
        TestController::add_extension(TreeNodeDataExtension::class);

        $nodes = $this->getNodes($this->childrenUrl($this->idFromFixture(TreeNode::class, 'parent')));

        $this->assertSame(['Parent', 'Parent', 'Parent'], array_column($nodes, 'parentTitle'));
        $this->assertNull($this->getNodes($this->childrenUrl(0))[0]['parentTitle']);
        $this->assertSame('admin/hierarchy-tree-test', rtrim($nodes[0]['controllerLink'], '/'));
        $this->assertSame(TreeNode::class, $nodes[0]['modelClass']);
    }

    public function testQueryCountDoesNotGrowWithTheNumberOfChildren(): void
    {
        $parent = $this->idFromFixture(TreeNode::class, 'parent');
        $secondParent = $this->idFromFixture(TreeNode::class, 'secondParent');
        for ($i = 1; $i <= 50; $i++) {
            TreeNode::create([
                'Title' => "Child $i",
                'ParentID' => $secondParent,
                'Access' => $i % 2 ? 'Edit' : 'None',
            ])->write();
        }
        // Every listed node gets a child, so the count includes each query that runs only for a node with children.
        foreach (TreeNode::get()->filter('ParentID', [$parent, $secondParent])->column('ID') as $id) {
            TreeNode::create(['Title' => "Child of $id", 'ParentID' => $id])->write();
        }
        $this->assertSameQueryCount(
            $this->childrenUrl(0),
            $this->childrenUrl($parent),
            $this->childrenUrl($secondParent)
        );
    }

    public function testTopLevelBehindAPermissionChecker(): void
    {
        $record = PermissionTreeNode::create(['Title' => 'Top level', 'CanViewType' => 'LoggedInUsers']);
        $record->write();

        $nodes = $this->getNodes('admin/hierarchy-tree-permission-test/children/0');

        $this->assertSame([$record->ID], array_column($nodes, 'id'));
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
        $url = 'admin/hierarchy-tree-permission-test/children/';
        $this->assertSameQueryCount($url . '0', $url . $parentIDs[0], $url . $parentIDs[1]);
        $this->assertCount(25, $this->getNodes($url . $parentIDs[1]));
    }

    /**
     * Assert that two children requests run the same number of queries, and that the number is not zero.
     *
     * The warm-up request fills the caches that every request shares, so both counts start from the same state.
     */
    private function assertSameQueryCount(string $warmUpUrl, string $fewerChildrenUrl, string $moreChildrenUrl): void
    {
        $this->getJson($warmUpUrl);
        $fewerChildrenCount = $this->countQueries($fewerChildrenUrl);
        $moreChildrenCount = $this->countQueries($moreChildrenUrl);
        $this->assertGreaterThan(0, $fewerChildrenCount);
        $this->assertSame($fewerChildrenCount, $moreChildrenCount);
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
        return 'admin/hierarchy-tree-test/children/' . $parentID;
    }

    private function pathUrl(int|string $id): string
    {
        return 'admin/hierarchy-tree-test/path/' . $id;
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
