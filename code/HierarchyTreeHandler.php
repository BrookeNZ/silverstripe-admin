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
 * JSON endpoints that read the tree of a model with the Hierarchy extension one level at a time.
 *
 * A section of the CMS serves them with an action that returns this handler, built with the section, the action's
 * name and the model class. The section's own access check guards every request. Only GET is answered.
 *
 * - `children/{parentID}` answers `{"nodes": [...]}` with the children of a record, or of the top level when the ID
 *   is 0. A parent with more children than node_threshold_leaf answers `{"nodes": [], "limited": true}`.
 * - `path/{id}` answers `{"path": [...]}` with the IDs of a record's ancestors, top level first.
 *
 * Each node has these fields:
 * - `id`, `parentId` (int)
 * - `treeTitle` (string) the tree title as plain text
 * - `tooltip` (string|null)
 * - `recordClass` (string)
 * - `classes` (string) the words from CMSTreeClasses() and a `status-{key}` word for each status flag
 * - `iconClasses` (string|null)
 * - `statusFlags` (array) of `{key, text, title}`, where `title` may be null
 * - `hasChildren` (bool)
 * - `limited` (bool) the record has more children than node_threshold_leaf, so its children are not sent
 * - `listViewUrl` (string|null)
 * - `editUrl` (string|null)
 * - `canView`, `canEdit`, `canAddChildren` (bool)
 *
 * Records the member cannot view are left out, and their children are refused, unless a subclass lists them through
 * canListTreeNode(). A subclass adds or changes fields in getTreeNodeData(), and an extension in updateTreeNodeData().
 *
 * The tree is scoped by the model alone: canView(), hide_from_cms_tree and the Hierarchy hooks on its children. A
 * filter the section applies to its own list, such as ModelAdmin::getList(), is not applied here. A section with
 * several models must only return this handler for a model with the Hierarchy extension.
 *
 * The routes and the shape of the responses are internal to the CMS and may change in a minor release: a client takes
 * the URLs from Link(). The fields the TreeView component acts on (`id`, `canView`, `hasChildren`, `limited`,
 * `listViewUrl`, `editUrl`) are the contract for anything that supplies it with nodes; the other fields may change.
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
     * @param string $urlSegment The name of the parent controller's action that returns this handler
     * @param class-string<DataObject> $modelClass
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
        // The default action route reaches this method with any verb
        if (!$request->isGET()) {
            $this->httpError(405);
        }
        $parentID = $this->getTreeRequestID($request, 'ParentID');
        if ($parentID === null) {
            $this->jsonError(400);
        }
        // A new record rather than the shared singleton, as a subclass may pass the parent on as permission context
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
        // Hierarchy::showingCMSTree() does not list this action, so hidden classes are excluded here
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
        // The default action route reaches this method with any verb
        if (!$request->isGET()) {
            $this->httpError(405);
        }
        $id = $this->getTreeRequestID($request, 'ID');
        if (!$id) {
            $this->jsonError(400);
        }
        /** @var DataObject&Hierarchy $record */
        $record = $this->getTreeRecord($id);
        if (!$record->canView()) {
            $this->jsonError(403);
        }
        $ancestorIDs = array_map('intval', $record->getAncestors()->column('ID'));
        return $this->jsonSuccess(['path' => array_reverse($ancestorIDs)]);
    }

    /**
     * Whether a record is listed among its parent's children, and whether its own children can be read.
     * The hasChildren and limited fields of its parent still count it.
     */
    protected function canListTreeNode(DataObject $node): bool
    {
        return (bool) $node->canView();
    }

    /**
     * @param DataObject $parent The record whose children are being read, or a new record at the top level
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
     * Get a record in the current stage, or end the request with a 404 JSON error
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
     * Reads node_threshold_leaf from the node itself, where MarkedSet::isNodeLimited() reads it from the tree root
     */
    private function isTreeNodeLimited(DataObject $node): bool
    {
        /** @var DataObject&Hierarchy $node */
        return $node->ID && $node->numChildren() > $node->config()->get('node_threshold_leaf');
    }

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
        // A count limited to these IDs leaves each childless record to be counted with its own query
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
     * Get the tree title as plain text, where getTreeTitle() may return escaped text or markup
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
     * End the request with the error AdminController::jsonError() gives, which this handler cannot call
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
