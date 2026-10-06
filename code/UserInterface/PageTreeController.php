<?php

namespace SilverStripe\Admin\UserInterface;

use SilverStripe\Admin\AdminController;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\ORM\DataList;
use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\Hierarchy\Hierarchy;
use SilverStripe\Security\InheritedPermissions;
use SilverStripe\Security\PermissionChecker;
use SilverStripe\Security\Security;
use SilverStripe\Versioned\Versioned;

/**
 * Read-only JSON for the page tree at admin/pages/tree: paged children of a node, the path to a node, and search.
 *
 * Every record passes canView() before it is listed or counted in `total`; `childCount` and `hasChildren` are the
 * rows in the stage before that check, as the legacy tree's counts are, so a node can report children the member
 * then cannot see. Unlike the legacy tree, which shows nodes the member cannot view as disabled, this one leaves
 * them out.
 *
 * Errors use jsonError()'s envelope plus `reason` and, for a bad parameter, `field`. They are built here because
 * jsonError() reads an undefined $request, which dev mode prints into the body, and has no room for the two keys.
 *
 * The model class is config so the admin module keeps no hard dependency on silverstripe/cms; without it every
 * action answers 404.
 */
class PageTreeController extends AdminController
{
    private static ?string $url_segment = 'pages/tree';

    private static string $url_rule = '/$Action/$ID';

    // Above CMSMain (39) and its edit (41) and settings (42) subsections, which share the pages prefix
    private static int $url_priority = 43;

    private static array $allowed_actions = [
        'children',
        'ancestors',
        'search',
    ];

    // Matches CMSMain, whose tree endpoints this replaces
    private static string|array $required_permission_codes = 'CMS_ACCESS_CMSMain';

    private static string $model_class = 'SilverStripe\\CMS\\Model\\SiteTree';

    private static int $default_limit = 50;

    private static int $max_limit = 250;

    private static int $search_default_limit = 20;

    private static int $search_max_limit = 100;

    private static int $search_min_length = 2;

    /**
     * @var array<int, array<DataObject>> viewable children per parent ID, for the current request and stage
     */
    private array $viewableChildren = [];

    protected function init()
    {
        parent::init();

        $response = $this->getResponse();
        if ($response->isError() || $response->isRedirect()) {
            $loggedIn = (bool) Security::getCurrentUser();
            $error = $this->errorResponse(
                $loggedIn ? 403 : 401,
                $loggedIn ? 'forbidden' : 'notLoggedIn',
                $loggedIn ? 'Permission denied' : 'Not logged in'
            );
            if ($response->getHeader('X-Reauthenticate')) {
                $error->addHeader('X-Reauthenticate', $response->getHeader('X-Reauthenticate'));
            }
            $this->setResponse($error);
        }
    }

    protected function handleAction($request, $action)
    {
        try {
            if (!in_array($request->httpMethod(), ['GET', 'HEAD'])) {
                $this->throwError(405, 'methodNotAllowed', 'Only GET is supported', null, ['Allow' => 'GET, HEAD']);
            }
            if (!$this->modelClass()) {
                $this->throwError(404, 'notFound', 'No page model is installed');
            }
            return parent::handleAction($request, $action);
        } catch (HTTPResponse_Exception $exception) {
            return $exception->getResponse();
        }
    }

    public function index(): HTTPResponse
    {
        $this->throwError(404, 'notFound', 'Use children, ancestors or search');
    }

    /**
     * GET pages/tree/children/<id>?page=&limit=&stage=, where id 0 is the root
     */
    public function children(HTTPRequest $request): HTTPResponse
    {
        $id = $this->idParam($request, true);
        $page = $this->intParam($request, 'page', 1, 1, PHP_INT_MAX);
        $limit = $this->intParam(
            $request,
            'limit',
            static::config()->get('default_limit'),
            1,
            static::config()->get('max_limit')
        );

        return $this->inStage($this->stageParam($request), function () use ($id, $page, $limit): HTTPResponse {
            if ($id !== 0) {
                $this->viewableRecord($id);
            }
            $children = $this->viewableChildrenOf($id);
            $slice = array_slice($children, ($page - 1) * $limit, $limit);
            $data = [
                'items' => $this->serialiseNodes($slice),
                'pageInfo' => [
                    'total' => count($children),
                    'page' => $page,
                    'limit' => $limit,
                    'hasMore' => $page * $limit < count($children),
                ],
            ];
            $this->extend('updateApiChildren', $data, $id);
            return $this->jsonSuccess(200, $data);
        });
    }

    /**
     * GET pages/tree/ancestors/<id>?limit=&stage=
     *
     * `items` runs from the top-level ancestor down to the node's parent. Each item and `node` carry `page`, the
     * page of its parent's children (at `limit` per page) that it falls on, so a client can load just the pages
     * needed to expand down to the node and scroll to it.
     */
    public function ancestors(HTTPRequest $request): HTTPResponse
    {
        $id = $this->idParam($request, false);
        $limit = $this->intParam(
            $request,
            'limit',
            static::config()->get('default_limit'),
            1,
            static::config()->get('max_limit')
        );

        return $this->inStage($this->stageParam($request), function () use ($id, $limit): HTTPResponse {
            $record = $this->viewableRecord($id);
            $path = [];
            $parent = $record;
            while ($parent->ParentID) {
                $parent = DataObject::get($this->modelClass())->byID($parent->ParentID);
                if (!$parent) {
                    break;
                }
                if (!$parent->canView()) {
                    $this->throwError(403, 'ancestorNotViewable', 'An ancestor of this page cannot be viewed');
                }
                array_unshift($path, $parent);
            }

            $items = $this->serialiseNodes($path);
            foreach ($path as $index => $ancestor) {
                $items[$index]['page'] = $this->pageOf($ancestor, $limit);
            }
            $data = [
                'items' => $items,
                'node' => [
                    'id' => (int) $record->ID,
                    'parentId' => (int) $record->ParentID,
                    'page' => $this->pageOf($record, $limit),
                ],
                'limit' => $limit,
            ];
            $this->extend('updateApiAncestors', $data, $record);
            return $this->jsonSuccess(200, $data);
        });
    }

    /**
     * GET pages/tree/search?q=&page=&limit=&stage=, matching Title or MenuTitle; each item adds `ancestorIds`
     * from the top-level ancestor down to its parent
     */
    public function search(HTTPRequest $request): HTTPResponse
    {
        $query = trim((string) $request->getVar('q'));
        $minLength = static::config()->get('search_min_length');
        if (mb_strlen($query) < $minLength) {
            $this->throwError(
                400,
                $query === '' ? 'required' : 'tooShort',
                sprintf('q needs at least %d characters', $minLength),
                'q'
            );
        }
        $page = $this->intParam($request, 'page', 1, 1, PHP_INT_MAX);
        $limit = $this->intParam(
            $request,
            'limit',
            static::config()->get('search_default_limit'),
            1,
            static::config()->get('search_max_limit')
        );

        return $this->inStage($this->stageParam($request), function () use ($query, $page, $limit): HTTPResponse {
            $matches = $this->visibleList()
                ->filterAny(['Title:PartialMatch' => $query, 'MenuTitle:PartialMatch' => $query])
                ->sort(['Title' => 'ASC', 'ID' => 'ASC']);
            $viewable = [];
            foreach (array_chunk($matches->toArray(), 500) as $chunk) {
                $this->prepopulateVersionCache($chunk);
                foreach ($chunk as $match) {
                    if ($match->canView()) {
                        $viewable[] = $match;
                    }
                }
            }
            $slice = array_slice($viewable, ($page - 1) * $limit, $limit);
            $ancestorIds = $this->ancestorIdsOf($slice);
            $items = $this->serialiseNodes($slice);
            foreach ($slice as $index => $match) {
                $items[$index]['ancestorIds'] = $ancestorIds[$match->ID];
            }
            $data = [
                'items' => $items,
                'pageInfo' => [
                    'total' => count($viewable),
                    'page' => $page,
                    'limit' => $limit,
                    'hasMore' => $page * $limit < count($viewable),
                ],
            ];
            $this->extend('updateApiSearch', $data, $query);
            return $this->jsonSuccess(200, $data);
        });
    }

    private function modelClass(): ?string
    {
        $class = static::config()->get('model_class');
        if (!$class || !class_exists($class) || !DataObject::has_extension($class, Hierarchy::class)) {
            return null;
        }
        return $class;
    }

    /**
     * The model's records minus the classes hidden from the hierarchy or the CMS tree
     */
    private function visibleList(): DataList
    {
        $class = $this->modelClass();
        $list = DataObject::get($class);
        $config = DataObject::singleton($class)->config();
        $hidden = array_merge(
            (array) $config->get('hide_from_hierarchy'),
            (array) $config->get('hide_from_cms_tree')
        );
        if ($hidden) {
            $list = $list->exclude('ClassName', $hidden);
        }
        return $list;
    }

    /**
     * @return array<DataObject>
     */
    private function viewableChildrenOf(int $parentId): array
    {
        if (isset($this->viewableChildren[$parentId])) {
            return $this->viewableChildren[$parentId];
        }
        $candidates = $this->visibleList()->filter('ParentID', $parentId)->toArray();
        $this->prepopulateVersionCache($candidates);
        $children = array_values(array_filter($candidates, fn (DataObject $child) => $child->canView()));
        return $this->viewableChildren[$parentId] = $children;
    }

    /**
     * canView() and the status flags look up each record's draft and live version one query at a time; this
     * fetches them for the whole list in two
     *
     * @param array<DataObject> $records
     */
    private function prepopulateVersionCache(array $records): void
    {
        $class = $this->modelClass();
        if (!$records || !DataObject::has_extension($class, Versioned::class)) {
            return;
        }
        $ids = array_map(fn (DataObject $record) => (int) $record->ID, $records);
        Versioned::prepopulate_versionnumber_cache($class, Versioned::DRAFT, $ids);
        Versioned::prepopulate_versionnumber_cache($class, Versioned::LIVE, $ids);
    }

    private function viewableRecord(int $id): DataObject
    {
        $record = DataObject::get($this->modelClass())->byID($id);
        if (!$record) {
            $this->throwError(404, 'notFound', sprintf('No page with ID %d in this stage', $id));
        }
        if (!$record->canView()) {
            $this->throwError(403, 'forbidden', 'This page cannot be viewed');
        }
        return $record;
    }

    private function pageOf(DataObject $record, int $limit): ?int
    {
        foreach ($this->viewableChildrenOf((int) $record->ParentID) as $position => $sibling) {
            if ((int) $sibling->ID === (int) $record->ID) {
                return intdiv($position, $limit) + 1;
            }
        }
        return null;
    }

    /**
     * @param array<DataObject> $records
     * @return array<int, array<int>> record ID => IDs from the top-level ancestor down to the parent
     */
    private function ancestorIdsOf(array $records): array
    {
        $parentOf = [];
        foreach ($records as $record) {
            $parentOf[(int) $record->ID] = (int) $record->ParentID;
        }
        $pending = array_diff(array_unique(array_values($parentOf)), [0], array_keys($parentOf));
        while ($pending) {
            $found = DataObject::get($this->modelClass())->filter('ID', $pending)->map('ID', 'ParentID')->toArray();
            foreach ($pending as $id) {
                $parentOf[$id] = (int) ($found[$id] ?? 0);
            }
            $pending = array_diff(array_unique(array_values($parentOf)), [0], array_keys($parentOf));
        }

        $paths = [];
        foreach ($records as $record) {
            $path = [];
            $id = $parentOf[(int) $record->ID];
            while ($id && !in_array($id, $path)) {
                array_unshift($path, $id);
                $id = $parentOf[$id] ?? 0;
            }
            $paths[(int) $record->ID] = $path;
        }
        return $paths;
    }

    /**
     * @param array<DataObject> $records
     */
    private function serialiseNodes(array $records): array
    {
        if (!$records) {
            return [];
        }
        $ids = array_map(fn (DataObject $record) => (int) $record->ID, $records);
        $childCounts = $this->childCounts($ids);
        $checker = $this->permissionChecker();
        if ($checker instanceof InheritedPermissions) {
            $checker->prePopulatePermissionCache(InheritedPermissions::EDIT, $ids);
            $checker->prePopulatePermissionCache(InheritedPermissions::DELETE, $ids);
        }

        $nodes = [];
        foreach ($records as $record) {
            $childCount = $childCounts[(int) $record->ID] ?? 0;
            $node = [
                'id' => (int) $record->ID,
                'parentId' => (int) $record->ParentID,
                'title' => (string) $record->Title,
                'menuTitle' => (string) ($record->MenuTitle ?: $record->Title),
                'urlSegment' => (string) $record->URLSegment,
                'className' => $record->ClassName,
                'hasChildren' => $childCount > 0,
                'childCount' => $childCount,
                'statusFlags' => $this->statusFlags($record),
                'canEdit' => (bool) $record->canEdit(),
                'canDelete' => (bool) $record->canDelete(),
                'sort' => (int) $record->Sort,
            ];
            $this->extend('updatePageTreeNode', $node, $record);
            $nodes[] = $node;
        }
        return $nodes;
    }

    /**
     * One grouped query in the current stage, with the same hidden classes left out as the listing
     *
     * @param array<int> $ids
     * @return array<int, int>
     */
    private function childCounts(array $ids): array
    {
        $query = $this->visibleList()->filter('ParentID', $ids)->dataQuery()->query();
        $parentColumn = DataObject::getSchema()->sqlColumnForField($this->modelClass(), 'ParentID');
        $query->setSelect(['ParentID' => $parentColumn, 'ChildCount' => 'COUNT(*)']);
        $query->setGroupBy($parentColumn);
        $query->setOrderBy([]);
        $counts = [];
        foreach ($query->execute() as $row) {
            $counts[(int) $row['ParentID']] = (int) $row['ChildCount'];
        }
        return $counts;
    }

    /**
     * @return array<array{key: string, text: string, title: string|null}>
     */
    private function statusFlags(DataObject $record): array
    {
        if (!$record->hasMethod('getStatusFlags')) {
            return [];
        }
        $flags = [];
        foreach ($record->getStatusFlags() as $key => $flag) {
            $flag = is_array($flag) ? $flag : ['text' => $flag];
            $flags[] = [
                'key' => (string) $key,
                'text' => (string) ($flag['text'] ?? ''),
                'title' => isset($flag['title']) ? (string) $flag['title'] : null,
            ];
        }
        return $flags;
    }

    private function permissionChecker(): ?PermissionChecker
    {
        $singleton = DataObject::singleton($this->modelClass());
        return $singleton->hasMethod('getPermissionChecker') ? $singleton->getPermissionChecker() : null;
    }

    private function inStage(string $stage, callable $callback): HTTPResponse
    {
        return Versioned::withVersionedMode(function () use ($stage, $callback): HTTPResponse {
            Versioned::set_stage($stage === 'live' ? Versioned::LIVE : Versioned::DRAFT);
            return $callback();
        });
    }

    private function stageParam(HTTPRequest $request): string
    {
        $stage = $request->getVar('stage') ?? 'draft';
        if (!in_array($stage, ['draft', 'live'], true)) {
            $this->throwError(400, 'invalid', 'stage must be draft or live', 'stage');
        }
        return $stage;
    }

    private function idParam(HTTPRequest $request, bool $allowRoot): int
    {
        $id = $request->param('ID');
        if (($id === null || $id === '') && $allowRoot) {
            return 0;
        }
        if (!is_string($id) || !ctype_digit($id) || (!$allowRoot && (int) $id === 0)) {
            $this->throwError(404, 'notFound', 'The ID must be a page ID');
        }
        return (int) $id;
    }

    private function intParam(HTTPRequest $request, string $name, int $default, int $min, int $max): int
    {
        $value = $request->getVar($name);
        if ($value === null || $value === '') {
            return $default;
        }
        if (!is_string($value) || !ctype_digit($value)) {
            $this->throwError(400, 'invalid', sprintf('%s must be a whole number', $name), $name);
        }
        if ((int) $value < $min || (int) $value > $max) {
            $this->throwError(
                400,
                'outOfRange',
                sprintf('%s must be between %d and %d', $name, $min, $max),
                $name
            );
        }
        return (int) $value;
    }

    /**
     * @throws HTTPResponse_Exception
     */
    private function throwError(
        int $code,
        string $reason,
        string $message,
        ?string $field = null,
        array $headers = []
    ): never {
        $response = $this->errorResponse($code, $reason, $message, $field);
        foreach ($headers as $name => $value) {
            $response->addHeader($name, $value);
        }
        throw new HTTPResponse_Exception($response);
    }

    private function errorResponse(int $code, string $reason, string $message, ?string $field = null): HTTPResponse
    {
        $error = ['type' => 'error', 'code' => $code, 'value' => $message, 'reason' => $reason];
        if ($field !== null) {
            $error['field'] = $field;
        }
        $body = json_encode(['status' => 'error', 'errors' => [$error]], JSON_THROW_ON_ERROR);
        return HTTPResponse::create($body, $code)
            ->addHeader('Content-Type', 'application/json')
            ->addHeader('Cache-Control', 'no-store');
    }
}
