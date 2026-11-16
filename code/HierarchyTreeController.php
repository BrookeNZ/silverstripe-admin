<?php

namespace SilverStripe\Admin;

use LogicException;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Convert;
use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\Hierarchy\Hierarchy;
use SilverStripe\Security\InheritedPermissions;
use SilverStripe\Security\PermissionCheckable;

/**
 * HierarchyTreeController serves JSON endpoints that read the tree of a model with the Hierarchy extension, one level
 * at a time.
 *
 * A subclass sets url_segment and model_class, and sets required_permission_codes or overrides canView(). The access
 * check of AdminController guards every request, and the controller responds only to GET.
 *
 * The routes and the shape of the responses are internal to the CMS and may change in a minor release. A client takes
 * the URLs from Link().
 *
 * The actions respond to an error with a JSON error from AdminController::jsonError():
 * - 400 for an ID that is not a whole number.
 * - 403 for a record that the member cannot view or that the controller does not list.
 * - 404 for a record that does not exist, or for a request without an action.
 *
 * A failed access check responds as AdminController::init() does. A request that is not GET gets an error without a
 * JSON body.
 */
abstract class HierarchyTreeController extends AdminController
{
    private static $url_handlers = [
        'GET children/$ParentID' => 'apiReadChildren',
        'GET path/$ID' => 'apiReadPath',
    ];

    private static $allowed_actions = [
        'apiReadChildren',
        'apiReadPath',
    ];

    /**
     * The class of the records in the tree. The class must have the Hierarchy extension.
     *
     * @var class-string<DataObject>|null
     */
    private static ?string $model_class = null;

    /**
     * Respond to a request without an action with a 404 JSON error.
     */
    public function index(HTTPRequest $request): HTTPResponse
    {
        // jsonError() always throws, so this method has no return statement.
        $this->jsonError(404);
    }

    /**
     * Get the class of the records in the tree.
     *
     * @return class-string<DataObject>
     * @throws LogicException If model_class does not have the Hierarchy extension.
     */
    public function getModelClass(): string
    {
        $modelClass = static::config()->get('model_class');
        if (!$modelClass || !DataObject::has_extension($modelClass, Hierarchy::class)) {
            throw new LogicException(sprintf(
                '%s::$model_class must be a class with the %s extension, "%s" given',
                static::class,
                Hierarchy::class,
                $modelClass
            ));
        }
        return $modelClass;
    }

    /**
     * Respond to `children/{parentID}` with `{"nodes": [...]}`, the children of a record.
     *
     * A parent ID of 0 gives the top level. For a parent with more children than node_threshold_leaf, this method
     * responds with `{"nodes": [], "limited": true}`. Only the model scopes the children, through canView(),
     * hide_from_cms_tree and the Hierarchy hooks that return the children.
     */
    public function apiReadChildren(HTTPRequest $request): HTTPResponse
    {
        $this->requireGetRequest($request);
        $parentID = $this->getTreeRequestID($request, 'ParentID');
        if ($parentID === null) {
            $this->jsonError(400);
        }
        // The top level gets a new record because the parent goes on to getTreeNodeData() and the updateTreeNodeData
        // hook. A change there to DataObject::singleton() would reach every other caller of it.
        $parent = $parentID ? $this->getTreeRecord($parentID) : $this->getModelClass()::create();
        if ($parentID && !$this->canListTreeNode($parent)) {
            $this->jsonError(403);
        }
        if ($this->isTreeNodeLimited($parent)) {
            return $this->jsonSuccess(200, ['nodes' => [], 'limited' => true]);
        }

        /** @var DataObject&Hierarchy $parent */
        $childrenMethod = $parent->getHierarchyBaseClass()::config()->get('tree_children_method');
        $children = $parent->$childrenMethod();
        // Hierarchy::showingCMSTree() recognises only the tree actions of LeftAndMain, so the children method keeps the
        // hide_from_cms_tree classes and this method excludes them.
        $hiddenClasses = $parent->config()->get('hide_from_cms_tree');
        if ($hiddenClasses) {
            $children = $children->exclude('ClassName', $hiddenClasses);
        }

        $this->prepopulateTreeData($children->column('ID'));
        $nodes = [];
        foreach ($children as $child) {
            if ($this->canListTreeNode($child)) {
                $data = $this->getTreeNodeData($child, $parent);
                $this->extend('updateTreeNodeData', $data, $child, $parent);
                $nodes[] = $data;
            }
        }
        return $this->jsonSuccess(200, ['nodes' => $nodes]);
    }

    /**
     * Respond to `path/{id}` with `{"path": [...]}`, the IDs of the ancestors of a record, top level first.
     *
     * An ID of 0 gets a 400 error, because the top level has no path.
     */
    public function apiReadPath(HTTPRequest $request): HTTPResponse
    {
        $this->requireGetRequest($request);
        $id = $this->getTreeRequestID($request, 'ID');
        if (!$id) {
            $this->jsonError(400);
        }
        /** @var DataObject&Hierarchy $record */
        $record = $this->getTreeRecord($id);
        // This check calls canView(), not canListTreeNode(), because the React tree asks only for the path of the
        // record that the edit form shows.
        if (!$record->canView()) {
            $this->jsonError(403);
        }
        $ancestorIDs = array_map('intval', $record->getAncestors()->column('ID'));
        return $this->jsonSuccess(200, ['path' => array_reverse($ancestorIDs)]);
    }

    /**
     * Check whether the controller lists a record and reads the children of the record.
     *
     * By default the controller leaves out a record that the member cannot view, and a subclass can list it instead. The
     * hasChildren and limited fields of the parent still count a record that this check refuses.
     */
    protected function canListTreeNode(DataObject $node): bool
    {
        return (bool) $node->canView();
    }

    /**
     * Get the fields of a node.
     *
     * A subclass adds or changes fields here, and the updateTreeNodeData(array &$data, DataObject $node,
     * DataObject $parent) extension hook runs after this method. Each node has these fields:
     * - `id`, `parentId` (int).
     * - `treeTitle` (string) the tree title as plain text.
     * - `tooltip` (string|null).
     * - `recordClass` (string).
     * - `classes` (string) the class names from CMSTreeClasses() and a `status-{key}` class name for each status flag.
     * - `iconClasses` (string|null).
     * - `statusFlags` (array) a list of `{key, text, title}`. The `title` of a flag can be null.
     * - `hasChildren` (bool) true when the record has children. The count includes children of the hide_from_cms_tree
     *   classes, which `nodes` leaves out.
     * - `limited` (bool) true when the record has more children than node_threshold_leaf.
     * - `listViewUrl` (string|null).
     * - `editUrl` (string|null).
     * - `canView`, `canEdit`, `canAddChildren` (bool).
     *
     * The TreeView component reads `id`, `treeTitle`, `hasChildren`, `limited`, `listViewUrl`, `editUrl` and `canView`
     * on every node. The component also reads `classes`, `iconClasses`, `recordClass`, `tooltip`,
     * `statusFlags` and `canEdit` when those fields are set.
     *
     * @param DataObject $parent The record whose children the request reads, or a new record at the top level.
     */
    protected function getTreeNodeData(DataObject $node, DataObject $parent): array
    {
        /** @var DataObject&Hierarchy $node */
        return [
            'id' => (int) $node->ID,
            'parentId' => (int) $node->ParentID,
            'treeTitle' => $this->getTreeTitleText($node),
            'tooltip' => null,
            'recordClass' => $node->ClassName,
            'classes' => $this->getTreeNodeClasses($node),
            'iconClasses' => null,
            'statusFlags' => $this->getTreeStatusFlags($node),
            'hasChildren' => $node->numChildren() > 0,
            'limited' => $this->isTreeNodeLimited($node),
            'listViewUrl' => null,
            'editUrl' => $node->getCMSEditLink(),
            'canView' => (bool) $node->canView(),
            'canEdit' => (bool) $node->canEdit(),
            'canAddChildren' => (bool) $node->canAddChildren(),
        ];
    }

    /**
     * Get the class names of a node.
     */
    protected function getTreeNodeClasses(DataObject $node): string
    {
        $classes = $node->CMSTreeClasses();
        foreach (array_keys($node->getStatusFlags()) as $status) {
            $classes .= ' status-' . $status;
        }
        return trim($classes);
    }

    /**
     * End the request with a 405 error unless it is a GET request.
     *
     * The default action route of RequestHandler reaches both API methods with any HTTP verb, so the GET routes in
     * url_handlers do not limit them.
     */
    private function requireGetRequest(HTTPRequest $request): void
    {
        if (!$request->isGET()) {
            $this->httpError(405);
        }
    }

    private function getTreeRequestID(HTTPRequest $request, string $name): ?int
    {
        $value = $request->param($name);
        if (!is_string($value) || !ctype_digit($value)) {
            return null;
        }
        return (int) $value;
    }

    /**
     * Get a record in the current stage, or end the request with a 404 JSON error.
     */
    private function getTreeRecord(int $id): DataObject
    {
        $record = DataObject::get($this->getModelClass())->byID($id);
        if (!$record) {
            $this->jsonError(404);
        }
        return $record;
    }

    /**
     * Check whether a node has more children than the node_threshold_leaf of the node.
     *
     * MarkedSet::isNodeLimited() reads node_threshold_leaf from the tree root instead. The top level is never limited.
     */
    private function isTreeNodeLimited(DataObject $node): bool
    {
        /** @var DataObject&Hierarchy $node */
        return $node->ID && $node->numChildren() > $node->config()->get('node_threshold_leaf');
    }

    /**
     * Fill the caches that the node data and the permission checks read.
     *
     * A children request then runs the same number of queries for any number of children.
     */
    private function prepopulateTreeData(array $ids): void
    {
        if (empty($ids)) {
            return;
        }
        /** @var DataObject&Hierarchy $singleton */
        $singleton = DataObject::singleton($this->getModelClass());
        $baseClass = $singleton->getHierarchyBaseClass();
        $singleton->prepopulateTreeDataCache($ids, [
            'childrenMethod' => $baseClass::config()->get('tree_children_method'),
            'numChildrenMethod' => 'numChildren',
        ]);
        // This call counts the children again for the whole table and marks the cache complete. A count for $ids alone
        // caches nothing for a childless record, so each childless record would run a query of its own.
        Hierarchy::prepopulate_numchildren_cache($baseClass);
        if (is_a($this->getModelClass(), PermissionCheckable::class, true)) {
            $checker = $singleton->getPermissionChecker();
            if ($checker instanceof InheritedPermissions) {
                $checker->prePopulatePermissionCache(InheritedPermissions::EDIT, $ids);
                $checker->prePopulatePermissionCache(InheritedPermissions::VIEW, $ids);
            }
        }
    }

    /**
     * Get the tree title as plain text.
     *
     * getTreeTitle() can return escaped text or markup.
     */
    private function getTreeTitleText(DataObject $node): string
    {
        /** @var DataObject&Hierarchy $node */
        $title = Convert::xml2raw(strip_tags($node->getTreeTitle()));
        $title = trim(str_replace(["\n", "\r"], '', $title));
        if ($title === '') {
            return _t(__CLASS__ . '.TREE_NO_TITLE', '(no title)');
        }
        return $title;
    }

    private function getTreeStatusFlags(DataObject $node): array
    {
        $flags = [];
        foreach ($node->getStatusFlags() as $key => $flag) {
            if (is_string($flag)) {
                $flag = ['text' => $flag];
            }
            $flags[] = [
                'key' => (string) $key,
                'text' => $flag['text'],
                'title' => $flag['title'] ?? null,
            ];
        }
        return $flags;
    }
}
