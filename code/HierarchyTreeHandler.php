<?php

namespace SilverStripe\Admin;

use LogicException;
use SilverStripe\Control\Controller;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Control\RequestHandler;
use SilverStripe\Core\Convert;
use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\Hierarchy\Hierarchy;
use SilverStripe\Security\InheritedPermissions;
use SilverStripe\Security\PermissionCheckable;

/**
 * HierarchyTreeHandler serves JSON endpoints that read the tree of a model with the Hierarchy extension, one level at a
 * time.
 *
 * A section of the CMS serves the endpoints through an action that returns this handler. The action builds the handler
 * with the section, the name of the action and the model class. The access check of the section guards every request.
 * The handler responds only to GET.
 *
 * The routes and the shape of the responses are internal to the CMS and may change in a minor release. A client takes
 * the URLs from Link().
 *
 * - `children/{parentID}` responds with `{"nodes": [...]}`, the children of a record. A parent ID of 0 gives the top
 *   level. For a parent with more children than node_threshold_leaf, the route responds with
 *   `{"nodes": [], "limited": true}`.
 * - `path/{id}` responds with `{"path": [...]}`, the IDs of the ancestors of a record, top level first.
 *
 * An error response has the JSON body of AdminController::jsonError(). The status codes are:
 * - 400 for an ID that is not a whole number, or for an ID of 0 on the `path` route.
 * - 403 for a record that the handler does not list or that the member cannot view.
 * - 404 for a record that does not exist.
 *
 * Each node has these fields:
 * - `id`, `parentId` (int).
 * - `treeTitle` (string) the tree title as plain text.
 * - `tooltip` (string|null).
 * - `recordClass` (string).
 * - `classes` (string) the class names from CMSTreeClasses() and a `status-{key}` class name for each status flag.
 * - `iconClasses` (string|null).
 * - `statusFlags` (array) a list of `{key, text, title}`. The `title` of a flag can be null.
 * - `hasChildren` (bool).
 * - `limited` (bool) true when the record has more children than node_threshold_leaf. A `children` request for that
 *   record then responds with no nodes.
 * - `listViewUrl` (string|null).
 * - `editUrl` (string|null).
 * - `canView`, `canEdit`, `canAddChildren` (bool).
 *
 * The TreeView component needs `id`, `treeTitle`, `hasChildren`, `limited`, `listViewUrl`, `editUrl` and `canView` on
 * every node. The component also reads `canEdit`, `classes`, `iconClasses`, `recordClass`, `tooltip` and
 * `statusFlags` when those fields are set. Those optional fields may change.
 *
 * The handler leaves out a record that the member cannot view. The handler refuses a request for the children of that
 * record. A subclass can list a record that the member cannot view through canListTreeNode(). A subclass adds or
 * changes fields in getTreeNodeData(). An extension adds or changes fields in
 * updateTreeNodeData(array &$data, DataObject $node, DataObject $parent). The extension hook runs after
 * getTreeNodeData().
 *
 * Only the model scopes the tree, through canView(), hide_from_cms_tree and the Hierarchy hooks that return the
 * children. The handler does not apply a filter that the section applies to the list of the section, such as
 * ModelAdmin::getList(). In a section with several models, return this handler only for a model with the Hierarchy
 * extension.
 */
class HierarchyTreeHandler extends RequestHandler
{
    private static $url_handlers = [
        'GET children/$ParentID' => 'apiReadChildren',
        'GET path/$ID' => 'apiReadPath',
    ];

    private static $allowed_actions = [
        'apiReadChildren',
        'apiReadPath',
    ];

    protected LeftAndMain $parentController;

    protected string $urlSegment;

    /**
     * @var class-string<DataObject>
     */
    protected string $modelClass;

    /**
     * @param string $urlSegment The name of the parent controller's action that returns this handler.
     * @param class-string<DataObject> $modelClass
     * @throws LogicException If the model class does not have the Hierarchy extension.
     */
    public function __construct(LeftAndMain $parentController, string $urlSegment, string $modelClass)
    {
        if (!$modelClass || !DataObject::has_extension($modelClass, Hierarchy::class)) {
            throw new LogicException(sprintf(
                '%s must be given a class with the %s extension, "%s" given',
                static::class,
                Hierarchy::class,
                $modelClass
            ));
        }
        $this->parentController = $parentController;
        $this->urlSegment = $urlSegment;
        $this->modelClass = $modelClass;

        parent::__construct();
    }

    public function getParentController(): LeftAndMain
    {
        return $this->parentController;
    }

    /**
     * @return class-string<DataObject>
     */
    public function getModelClass(): string
    {
        return $this->modelClass;
    }

    public function Link($action = null)
    {
        return Controller::join_links($this->parentController->Link(), $this->urlSegment, $action);
    }

    public function apiReadChildren(HTTPRequest $request): HTTPResponse
    {
        // The default action route reaches this method with any HTTP verb.
        if (!$request->isGET()) {
            $this->httpError(405);
        }
        $parentID = $this->getTreeRequestID($request, 'ParentID');
        if ($parentID === null) {
            $this->jsonError(400);
        }
        // The top level gets a new record, not the shared singleton. A subclass can pass the parent on to a permission
        // check.
        $parent = $parentID ? $this->getTreeRecord($parentID) : $this->modelClass::create();
        if ($parentID && !$this->canListTreeNode($parent)) {
            $this->jsonError(403);
        }
        if ($this->isTreeNodeLimited($parent)) {
            return $this->jsonSuccess(['nodes' => [], 'limited' => true]);
        }

        /** @var DataObject&Hierarchy $parent */
        $childrenMethod = $parent->getHierarchyBaseClass()::config()->get('tree_children_method');
        $children = $parent->$childrenMethod();
        // Hierarchy::showingCMSTree() does not list this action. This method excludes the hide_from_cms_tree classes.
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
        return $this->jsonSuccess(['nodes' => $nodes]);
    }

    public function apiReadPath(HTTPRequest $request): HTTPResponse
    {
        // The default action route reaches this method with any HTTP verb.
        if (!$request->isGET()) {
            $this->httpError(405);
        }
        $id = $this->getTreeRequestID($request, 'ID');
        if (!$id) {
            $this->jsonError(400);
        }
        /** @var DataObject&Hierarchy $record */
        $record = $this->getTreeRecord($id);
        // This check calls canView(), not canListTreeNode(). A record that the member cannot view is never the current
        // record.
        if (!$record->canView()) {
            $this->jsonError(403);
        }
        $ancestorIDs = array_map('intval', $record->getAncestors()->column('ID'));
        return $this->jsonSuccess(['path' => array_reverse($ancestorIDs)]);
    }

    /**
     * Check whether the handler lists a record and reads the children of the record. The hasChildren and limited
     * fields of the parent still count a record that this check refuses.
     */
    protected function canListTreeNode(DataObject $node): bool
    {
        return (bool) $node->canView();
    }

    /**
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

    protected function getTreeNodeClasses(DataObject $node): string
    {
        $classes = $node->CMSTreeClasses();
        foreach (array_keys($node->getStatusFlags()) as $status) {
            $classes .= ' status-' . $status;
        }
        return trim($classes);
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
        $record = DataObject::get($this->modelClass)->byID($id);
        if (!$record) {
            $this->jsonError(404);
        }
        return $record;
    }

    /**
     * Check whether a node has more children than the node_threshold_leaf of the node. MarkedSet::isNodeLimited()
     * reads node_threshold_leaf from the tree root instead. The top level is never limited.
     */
    private function isTreeNodeLimited(DataObject $node): bool
    {
        /** @var DataObject&Hierarchy $node */
        return $node->ID && $node->numChildren() > $node->config()->get('node_threshold_leaf');
    }

    /**
     * Fill the caches that the node data and the permission checks read. A list then costs the same number of queries
     * at any length.
     */
    private function prepopulateTreeData(array $ids): void
    {
        if (empty($ids)) {
            return;
        }
        /** @var DataObject&Hierarchy $singleton */
        $singleton = DataObject::singleton($this->modelClass);
        $baseClass = $singleton->getHierarchyBaseClass();
        $singleton->prepopulateTreeDataCache($ids, [
            'childrenMethod' => $baseClass::config()->get('tree_children_method'),
            'numChildrenMethod' => 'numChildren',
        ]);
        // This call counts the children again for the whole table. A count for $ids alone caches nothing for a
        // childless record. Without this call, each childless record runs a query of its own.
        Hierarchy::prepopulate_numchildren_cache($baseClass);
        if (is_a($this->modelClass, PermissionCheckable::class, true)) {
            $checker = $singleton->getPermissionChecker();
            if ($checker instanceof InheritedPermissions) {
                $checker->prePopulatePermissionCache(InheritedPermissions::EDIT, $ids);
                $checker->prePopulatePermissionCache(InheritedPermissions::VIEW, $ids);
            }
        }
    }

    /**
     * Get the tree title as plain text. getTreeTitle() can return escaped text or markup.
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

    private function jsonSuccess(array $data): HTTPResponse
    {
        return HTTPResponse::create(json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE))
            ->addHeader('Content-Type', 'application/json');
    }

    /**
     * End the request with the same JSON error as AdminController::jsonError(). This handler cannot call that protected
     * method.
     *
     * @throws HTTPResponse_Exception
     */
    private function jsonError(int $errorCode): void
    {
        $key = AdminController::class . '.ErrorMessage' . $errorCode;
        $defaultMessages = $this->parentController->provideI18nEntities();
        $body = [
            'status' => 'error',
            'errors' => [
                [
                    'type' => 'error',
                    'code' => $errorCode,
                    /** @phpstan-ignore translation.key (one of the error messages AdminController provides) */
                    'value' => _t($key, $defaultMessages[$key] ?? ''),
                ],
            ],
        ];
        $response = HTTPResponse::create(json_encode($body), $errorCode)
            ->addHeader('Content-Type', 'application/json');
        throw new HTTPResponse_Exception($response);
    }
}
