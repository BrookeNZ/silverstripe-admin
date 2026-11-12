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
 * A section of the CMS whose model has the Hierarchy extension, with JSON endpoints that read its tree
 * one level at a time.
 *
 * The node data for each record is built by getTreeNodeData(), which a subclass can override to add or
 * change fields. Fields this class cannot know for a generic model are left empty (tooltip, iconClasses and
 * listViewUrl) or false (canDuplicate) here.
 */
abstract class HierarchyTreeController extends LeftAndMain
{
    private static $allowed_actions = [
        'apiReadTreeChildren',
        'apiReadTreePath',
    ];

    private static $url_handlers = [
        'GET api/readTreeChildren/$ParentID' => 'apiReadTreeChildren',
        'GET api/readTreePath/$ID' => 'apiReadTreePath',
    ];

    /**
     * JSON endpoint to get the tree nodes for the children of one record, or of the top level when the ID is 0.
     * A record with more children than node_threshold_leaf is marked as limited and its children are not sent.
     */
    public function apiReadTreeChildren(HTTPRequest $request): HTTPResponse
    {
        // The default action route reaches this method with any verb
        if (!$request->isGET()) {
            $this->httpError(405);
        }
        $modelClass = $this->getHierarchyModelClass();
        $parentID = $this->getTreeRequestID($request, 'ParentID');
        if ($parentID === null) {
            $this->jsonError(400);
        }
        // A new record rather than the shared singleton, as a subclass may pass the parent on as permission context
        $parent = $parentID ? $this->getTreeRecord($parentID) : $modelClass::create();
        if ($parentID && !$this->canListTreeNode($parent)) {
            $this->jsonError(403);
        }
        if ($this->isTreeNodeLimited($parent)) {
            return $this->jsonSuccess(200, []);
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
                $nodes[] = $this->getTreeNodeData($child, $parent);
            }
        }
        return $this->jsonSuccess(200, $nodes);
    }

    /**
     * JSON endpoint to get the IDs of a record's ancestors, top level first
     */
    public function apiReadTreePath(HTTPRequest $request): HTTPResponse
    {
        // The default action route reaches this method with any verb
        if (!$request->isGET()) {
            $this->httpError(405);
        }
        $this->getHierarchyModelClass();
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
        return $this->jsonSuccess(200, array_reverse($ancestorIDs));
    }

    /**
     * Get extra CSS classes for a record's tree node
     */
    public function getTreeNodeClasses(DataObject $node): string
    {
        $classes = $node->CMSTreeClasses();
        $flags = $node->getStatusFlags();
        if ($flags) {
            $statuses = array_keys($flags ?? []);
            foreach ($statuses as $s) {
                $classes .= ' status-' . $s;
            }
        }

        return trim($classes ?? '');
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
     * Get the data for one node in the response of apiReadTreeChildren().
     * The shape is documented on the fetchChildren prop of the TreeView component.
     *
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
            'iconClasses' => '',
            'statusFlags' => $this->getTreeStatusFlags($node),
            'hasChildren' => $node->numChildren() > 0,
            'limited' => $this->isTreeNodeLimited($node),
            'listViewUrl' => null,
            'editUrl' => $node->getCMSEditLink(),
            'canEdit' => (bool) $node->canEdit(),
            'canAddChildren' => (bool) $node->canAddChildren(),
            'canDuplicate' => false,
        ];
    }

    /**
     * @return class-string<DataObject>
     */
    private function getHierarchyModelClass(): string
    {
        $modelClass = $this->getModelClass();
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
        $record = DataObject::get($this->getModelClass())->byID($id);
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
        $modelClass = $this->getModelClass();
        /** @var DataObject&Hierarchy $singleton */
        $singleton = DataObject::singleton($modelClass);
        $baseClass = $singleton->getHierarchyBaseClass();
        $singleton->prepopulateTreeDataCache($ids, [
            'childrenMethod' => $baseClass::config()->get('tree_children_method'),
            'numChildrenMethod' => 'numChildren',
        ]);
        // A count limited to these IDs leaves each childless record to be counted with its own query
        Hierarchy::prepopulate_numchildren_cache($baseClass);
        if (is_a($modelClass, PermissionCheckable::class, true)) {
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
}
