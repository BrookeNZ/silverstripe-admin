<?php

namespace SilverStripe\Admin\UserInterface;

use Psr\Log\LoggerInterface;
use SilverStripe\Admin\AdminController;
use SilverStripe\Control\Director;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Core\ClassInfo;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\DB;
use SilverStripe\ORM\HiddenClass;
use SilverStripe\ORM\Hierarchy\Hierarchy;
use SilverStripe\Security\Security;
use SilverStripe\Security\SecurityToken;
use SilverStripe\Versioned\Versioned;
use Throwable;

/**
 * JSON for dragging a page in the shell's tree at admin/pages/move: the rules the client checks a drop against
 * (`hints`), and moving a page (`page`), which replaces CMSMain::savetreenode in silverstripe/cms.
 *
 * The move applies savetreenode's checks: the CSRF token (X-SecurityID), canOrganiseTree() (SITETREE_REORGANISE),
 * canCreateTopLevel() when the page leaves or joins the top level, and canEdit() on the page. The legacy tree also
 * refused, client side only, a drop on a parent without canAddChildren() or whose allowed_children leave out the
 * page's class, and a top-level drop of a class with can_be_root false; those are checked here too, along with a
 * drop on the page itself or its descendants. Sorting is legacy's: `siblingIds` renumbers from 1, the page by
 * write() and the rest by direct SQL so they are not marked modified. Without `siblingIds` a reparented page goes
 * last. The IDs a move changes, including dependent virtual pages, are returned as modified; the legacy status
 * hook is not fired because it needs CMSMain's tree markup.
 *
 * Departures: sibling IDs outside the new parent are ignored, where legacy renumbers whatever it is sent; a
 * moved page is written once when both its parent and sort change, where legacy writes twice. Errors share
 * PageTreeController's envelope.
 */
class PageMoveController extends AdminController
{
    private static ?string $url_segment = 'pages/move';

    private static string $url_rule = '/$Action/$ID';

    // Above CMSMain (39) and its subsections; beside PageTreeController (43) and PageCreateController (44)
    private static int $url_priority = 45;

    private static array $allowed_actions = [
        'hints',
        'page',
    ];

    private static string|array $required_permission_codes = 'CMS_ACCESS_CMSMain';

    private static string $model_class = 'SilverStripe\\CMS\\Model\\SiteTree';

    private static string $cms_controller = 'SilverStripe\\CMS\\Controllers\\CMSMain';

    protected function init()
    {
        parent::init();

        $response = $this->getResponse();
        if ($response->isError() || $response->isRedirect()) {
            $loggedIn = (bool) Security::getCurrentUser();
            $this->setResponse($this->errorResponse(
                $loggedIn ? 403 : 401,
                $loggedIn ? 'forbidden' : 'notLoggedIn',
                $loggedIn ? 'Permission denied' : 'Not logged in'
            ));
        }
    }

    protected function handleAction($request, $action)
    {
        try {
            if (!$this->modelClass()) {
                $this->throwError(404, 'notFound', 'No page model is installed');
            }
            return Versioned::withVersionedMode(function () use ($request, $action) {
                Versioned::set_stage(Versioned::DRAFT);
                return parent::handleAction($request, $action);
            });
        } catch (HTTPResponse_Exception $exception) {
            return $exception->getResponse();
        } catch (Throwable $exception) {
            Injector::inst()->get(LoggerInterface::class)->error($exception->getMessage(), ['exception' => $exception]);
            return $this->errorResponse(
                500,
                'serverError',
                Director::isDev() ? $exception->getMessage() : 'The page could not be moved'
            );
        }
    }

    public function index(): HTTPResponse
    {
        $this->throwError(404, 'notFound', 'Use hints or page');
    }

    /**
     * GET pages/move/hints: whether the member may reorganise the tree and move pages at the top level, the classes
     * allowed at the top level, and the classes each class accepts as children
     */
    public function hints(HTTPRequest $request): HTTPResponse
    {
        if (!$request->isGET()) {
            $this->throwError(405, 'methodNotAllowed', 'Only GET is supported');
        }
        $rootClasses = [];
        $allowedChildren = [];
        foreach (ClassInfo::getValidSubClasses($this->modelClass()) as $class) {
            $singleton = DataObject::singleton($class);
            if ($singleton instanceof HiddenClass) {
                continue;
            }
            if ($singleton->config()->get('can_be_root') !== false) {
                $rootClasses[] = $class;
            }
            $allowedChildren[$class] = array_values($singleton->allowedChildren());
        }

        return $this->jsonResponse(200, [
            'canOrganise' => $this->cms()->canOrganiseTree(),
            'canCreateTopLevel' => $this->cms()->canCreateTopLevel(),
            'rootClasses' => $rootClasses,
            'allowedChildren' => $allowedChildren,
        ]);
    }

    /**
     * POST pages/move/page with a JSON body `{ id, parentId, siblingIds? }`, where parentId 0 is the top level and
     * siblingIds is the new parent's children in their new order, the moved page included
     */
    public function page(HTTPRequest $request): HTTPResponse
    {
        if (!$request->isPOST()) {
            $this->throwError(405, 'methodNotAllowed', 'Only POST is supported');
        }
        if (!SecurityToken::inst()->checkRequest($request)) {
            $this->throwError(400, 'invalidToken', 'The security token is missing or has expired');
        }
        if (!$this->cms()->canOrganiseTree()) {
            $this->throwError(403, 'cannotOrganise', 'You do not have permission to rearrange the tree');
        }

        $body = json_decode((string) $request->getBody(), true);
        $body = is_array($body) ? $body : [];
        $id = $body['id'] ?? null;
        $parentId = $body['parentId'] ?? null;
        $siblingIds = $body['siblingIds'] ?? null;
        if (!is_int($id) || $id < 1) {
            $this->throwError(400, 'invalid', 'id must be a page ID', 'id');
        }
        if (!is_int($parentId) || $parentId < 0) {
            $this->throwError(400, 'invalid', 'parentId must be a page ID or 0', 'parentId');
        }
        if ($siblingIds !== null && (!is_array($siblingIds) || !array_is_list($siblingIds)
            || array_filter($siblingIds, fn ($sibling) => !is_int($sibling)))
        ) {
            $this->throwError(400, 'invalid', 'siblingIds must be a list of page IDs', 'siblingIds');
        }

        $node = DataObject::get($this->modelClass())->byID($id);
        if (!$node) {
            $this->throwError(404, 'notFound', sprintf('No page with ID %d', $id), 'id');
        }
        if (($parentId === 0 || (int) $node->ParentID === 0) && !$this->cms()->canCreateTopLevel()) {
            $this->throwError(403, 'cannotMoveTopLevel', 'You do not have permission to alter top-level pages');
        }
        if (!$node->canEdit()) {
            $this->throwError(403, 'forbidden', 'This page cannot be edited', 'id');
        }

        $previousParentId = (int) $node->ParentID;
        $parentChanged = $previousParentId !== $parentId;
        $this->checkDrop($node, $parentId, $parentChanged);

        $sortField = $node->getSortField();
        if ($parentChanged) {
            $node->ParentID = $parentId;
            if ($sortField && $siblingIds === null) {
                $node->$sortField = $this->lastSort($parentId, $sortField) + 1;
            }
        }
        $sortChanged = $sortField && $siblingIds !== null;
        $modified = [];
        if ($sortChanged) {
            $this->renumber($node, $parentId, $siblingIds, $sortField);
        }
        if ($node->isChanged()) {
            $node->write();
            $modified[(int) $node->ID] = [];
        }

        // Legacy's updateSaveTreeNodeStatusUpdates renders tree markup through CMSMain, which this
        // controller is not, so the virtual pages a reparent affects are marked modified here instead
        if ($parentChanged && $node->hasMethod('VirtualPages')) {
            foreach ($node->VirtualPages() as $virtualPage) {
                $modified[(int) $virtualPage->ID] = [];
            }
        }
        $statusUpdates = ['modified' => $modified];

        return $this->jsonResponse(200, [
            'id' => (int) $node->ID,
            'parentId' => (int) $node->ParentID,
            'previousParentId' => $previousParentId,
            'sort' => $sortField ? (int) $node->$sortField : null,
            'modifiedIds' => array_map('intval', array_keys($statusUpdates['modified'] ?? [])),
        ]);
    }

    /**
     * The drop rules the legacy tree checked in the browser (LeftAndMain.Tree.js check_move)
     */
    private function checkDrop(DataObject $node, int $parentId, bool $parentChanged): void
    {
        if ($parentId === 0) {
            if ($parentChanged && $node->config()->get('can_be_root') === false) {
                $this->throwError(403, 'notAllowedHere', 'This page type cannot be at the top level', 'parentId');
            }
            return;
        }
        $parent = DataObject::get($this->modelClass())->byID($parentId);
        if (!$parent) {
            $this->throwError(404, 'notFound', sprintf('No page with ID %d', $parentId), 'parentId');
        }
        $seen = [];
        for ($ancestor = $parent; $ancestor?->exists() && !isset($seen[$ancestor->ID]); $ancestor = $ancestor->Parent()) {
            if ((int) $ancestor->ID === (int) $node->ID) {
                $this->throwError(400, 'invalid', 'A page cannot be moved into itself', 'parentId');
            }
            $seen[$ancestor->ID] = true;
        }
        if (!$parent->canAddChildren()) {
            $this->throwError(403, 'notAllowedHere', 'Pages cannot be added under this page', 'parentId');
        }
        if ($parentChanged && !in_array($node->ClassName, $parent->allowedChildren(), true)) {
            $this->throwError(403, 'notAllowedHere', 'This page type is not allowed under this page', 'parentId');
        }
    }

    /**
     * Numbers the siblings from 1 in the order given; only the moved page is written
     *
     * @param array<int> $siblingIds
     */
    private function renumber(DataObject $node, int $parentId, array $siblingIds, string $sortField): void
    {
        $children = DataObject::get($this->modelClass())->filter('ParentID', $parentId)->column('ID');
        $children = array_flip(array_map('intval', $children));
        $table = DataObject::getSchema()->baseDataTable($this->modelClass());
        $counter = 0;
        foreach (array_unique($siblingIds) as $siblingId) {
            if ($siblingId === (int) $node->ID) {
                $node->$sortField = ++$counter;
            } elseif (isset($children[$siblingId])) {
                DB::prepared_query(
                    sprintf('UPDATE "%s" SET "%s" = ? WHERE "ID" = ?', $table, $sortField),
                    [++$counter, $siblingId]
                );
            }
        }
    }

    private function lastSort(int $parentId, string $sortField): int
    {
        return (int) DataObject::get($this->modelClass())->filter('ParentID', $parentId)->max($sortField);
    }

    private function cms(): object
    {
        return Injector::inst()->get($this->config()->get('cms_controller'));
    }

    private function modelClass(): ?string
    {
        $class = $this->config()->get('model_class');
        $cms = $this->config()->get('cms_controller');
        if (!$class || !class_exists($class) || !class_exists($cms)
            || !DataObject::has_extension($class, Hierarchy::class)
        ) {
            return null;
        }
        return $class;
    }

    private function jsonResponse(int $code, array $data): HTTPResponse
    {
        return HTTPResponse::create(json_encode($data, JSON_THROW_ON_ERROR), $code)
            ->addHeader('Content-Type', 'application/json')
            ->addHeader('Cache-Control', 'no-store');
    }

    /**
     * @throws HTTPResponse_Exception
     */
    private function throwError(int $code, string $reason, string $message, ?string $field = null): never
    {
        throw new HTTPResponse_Exception($this->errorResponse($code, $reason, $message, $field));
    }

    private function errorResponse(int $code, string $reason, string $message, ?string $field = null): HTTPResponse
    {
        $error = ['type' => 'error', 'code' => $code, 'value' => $message, 'reason' => $reason];
        if ($field !== null) {
            $error['field'] = $field;
        }
        return $this->jsonResponse($code, ['status' => 'error', 'errors' => [$error]]);
    }
}
