<?php

namespace SilverStripe\Admin\UserInterface;

use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Core\Validation\ValidationException;
use SilverStripe\Core\Validation\ValidationResult;
use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\DB;
use SilverStripe\Security\SecurityToken;
use SilverStripe\Versioned\Versioned;

/**
 * JSON for dragging a page in the shell's tree at admin/pages/move: the rules the client checks a drop against
 * (`hints`), and moving a page (`page`), which replaces CMSMain::savetreenode in silverstripe/cms.
 *
 * The move applies savetreenode's checks: the CSRF token (X-SecurityID), canOrganiseTree() (SITETREE_REORGANISE),
 * canCreateTopLevel() when the page leaves or joins the top level, and canEdit() on the page. The legacy tree also
 * refused, client side only, a drop on a parent without canAddChildren() or whose allowed_children leave out the
 * page's class, and a top-level drop of a class with can_be_root false; those are checked here too, along with a
 * drop on the page itself or its descendants. A virtual page is checked by the class of the page it copies, as
 * Hierarchy validation does. Like legacy TreeHints, `hints` leaves out the base page class and
 * SiteTree.hide_pagetypes through the model's updateAllowedSubClasses hook.
 *
 * Sorting is legacy's: `siblingIds` renumbers from 1, the page by write() and the rest by direct SQL so they are not
 * marked modified. The page is written before that SQL, so a write it refuses answers 403 with no sibling renumbered.
 * The IDs a move changes, including dependent virtual pages, are returned as modified; the legacy status hook is not
 * fired because it needs CMSMain's tree markup.
 *
 * Departures: sibling IDs outside the new parent are ignored, where legacy renumbers whatever it is sent; without
 * `siblingIds` a reparented page goes last, where legacy leaves its sort untouched; a moved page is written once when
 * both its parent and sort change, where legacy writes twice. Errors use PageEndpointController's envelope.
 */
class PageMoveController extends PageEndpointController
{
    private static ?string $url_segment = 'pages/move';

    private static string $url_rule = '/$Action/$ID';

    // Above CMSMain (39) and its subsections; beside PageTreeController (43) and PageCreateController (44)
    private static int $url_priority = 45;

    private static array $allowed_actions = [
        'hints',
        'page',
    ];

    protected function serverErrorMessage(): string
    {
        return 'The page could not be moved';
    }

    protected function usage(): string
    {
        return 'Use hints or page';
    }

    /**
     * Runs on the draft stage because a move edits the draft tree, the table renumber() writes
     */
    protected function runAction(callable $next): mixed
    {
        return Versioned::withVersionedMode(function () use ($next) {
            Versioned::set_stage(Versioned::DRAFT);
            return $next();
        });
    }

    /**
     * GET pages/move/hints: whether the member may reorganise the tree and move pages at the top level, the classes
     * allowed at the top level, and the classes each class accepts as children
     */
    public function hints(HTTPRequest $request): HTTPResponse
    {
        if (!$request->isGET() && !$request->isHEAD()) {
            throw ShellSubmission::jsonException(405, 'Only GET is supported', null, null, ['Allow' => 'GET, HEAD']);
        }
        $rootClasses = [];
        $allowedChildren = [];
        foreach ($this->pageTypes() as $class) {
            $singleton = DataObject::singleton($class);
            if ($singleton->config()->get('can_be_root')) {
                $rootClasses[] = $class;
            }
            $allowedChildren[$class] = array_values($singleton->allowedChildren());
        }

        return ShellSubmission::jsonResponse(200, [
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
            throw ShellSubmission::jsonException(405, 'Only POST is supported', null, null, ['Allow' => 'POST']);
        }
        if (!SecurityToken::inst()->checkRequest($request)) {
            throw ShellSubmission::jsonException(400, 'The security token is missing or has expired', 'invalidToken');
        }
        if (!$this->cms()->canOrganiseTree()) {
            throw ShellSubmission::jsonException(
                403,
                'You do not have permission to rearrange the tree',
                'cannotOrganise'
            );
        }

        $body = json_decode((string) $request->getBody(), true);
        $body = is_array($body) ? $body : [];
        $id = $body['id'] ?? null;
        $parentId = $body['parentId'] ?? null;
        $siblingIds = $body['siblingIds'] ?? null;
        if (!is_int($id) || $id < 1) {
            throw ShellSubmission::jsonException(400, 'id must be a page ID', 'invalid', 'id');
        }
        if (!is_int($parentId) || $parentId < 0) {
            throw ShellSubmission::jsonException(400, 'parentId must be a page ID or 0', 'invalid', 'parentId');
        }
        if ($siblingIds !== null && (!is_array($siblingIds) || !array_is_list($siblingIds)
            || array_filter($siblingIds, fn ($sibling) => !is_int($sibling)))
        ) {
            throw ShellSubmission::jsonException(400, 'siblingIds must be a list of page IDs', 'invalid', 'siblingIds');
        }

        $node = DataObject::get($this->modelClass())->byID($id);
        if (!$node) {
            throw ShellSubmission::jsonException(404, sprintf('No page with ID %d', $id), 'notFound', 'id');
        }
        if (($parentId === 0 || (int) $node->ParentID === 0) && !$this->cms()->canCreateTopLevel()) {
            throw ShellSubmission::jsonException(
                403,
                'You do not have permission to alter top-level pages',
                'cannotMoveTopLevel'
            );
        }
        if (!$node->canEdit()) {
            throw ShellSubmission::jsonException(403, 'This page cannot be edited', 'forbidden', 'id');
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
        $siblingSorts = [];
        if ($sortField && $siblingIds !== null) {
            $siblingSorts = $this->siblingSorts($node, $parentId, $siblingIds, $sortField);
        }
        $modified = [];
        if ($node->isChanged()) {
            try {
                $node->write();
            } catch (ValidationException $exception) {
                $this->throwValidationError($exception->getResult());
            }
            $modified[(int) $node->ID] = [];
        }
        $this->renumber($siblingSorts, $sortField);

        // Legacy's updateSaveTreeNodeStatusUpdates renders tree markup through CMSMain, which this
        // controller is not, so the virtual pages a reparent affects are marked modified here instead
        if ($parentChanged && $node->hasMethod('VirtualPages')) {
            foreach ($node->VirtualPages() as $virtualPage) {
                $modified[(int) $virtualPage->ID] = [];
            }
        }
        $statusUpdates = ['modified' => $modified];

        return ShellSubmission::jsonResponse(200, [
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
            if ($parentChanged && !$node->config()->get('can_be_root')) {
                throw ShellSubmission::jsonException(
                    403,
                    'This page type cannot be at the top level',
                    'notAllowedHere',
                    'parentId'
                );
            }
            return;
        }
        $parent = DataObject::get($this->modelClass())->byID($parentId);
        if (!$parent) {
            throw ShellSubmission::jsonException(404, sprintf('No page with ID %d', $parentId), 'notFound', 'parentId');
        }
        $seen = [];
        for ($ancestor = $parent; $ancestor?->exists() && !isset($seen[$ancestor->ID]); $ancestor = $ancestor->Parent()) {
            if ((int) $ancestor->ID === (int) $node->ID) {
                throw ShellSubmission::jsonException(400, 'A page cannot be moved into itself', 'invalid', 'parentId');
            }
            $seen[$ancestor->ID] = true;
        }
        if (!$parent->canAddChildren()) {
            throw ShellSubmission::jsonException(
                403,
                'Pages cannot be added under this page',
                'notAllowedHere',
                'parentId'
            );
        }
        $subject = $node->hasMethod('getRecordForAllowedChildrenValidation')
            ? $node->getRecordForAllowedChildrenValidation()
            : $node;
        if ($parentChanged && !in_array($subject->ClassName, $parent->allowedChildren(), true)) {
            throw ShellSubmission::jsonException(
                403,
                'This page type is not allowed under this page',
                'notAllowedHere',
                'parentId'
            );
        }
    }

    /**
     * Numbers the siblings from 1 in the order given, setting the moved page's sort and returning the others'
     *
     * @param array<int> $siblingIds
     * @return array<int, int> sort by sibling ID
     */
    private function siblingSorts(DataObject $node, int $parentId, array $siblingIds, string $sortField): array
    {
        $children = DataObject::get($this->modelClass())->filter('ParentID', $parentId)->column('ID');
        $children = array_flip(array_map('intval', $children));
        $sorts = [];
        $counter = 0;
        foreach (array_unique($siblingIds) as $siblingId) {
            if ($siblingId === (int) $node->ID) {
                $node->$sortField = ++$counter;
            } elseif (isset($children[$siblingId])) {
                $sorts[$siblingId] = ++$counter;
            }
        }
        return $sorts;
    }

    /**
     * Writes the siblings' sort by direct SQL so they are not marked modified
     *
     * @param array<int, int> $siblingSorts
     */
    private function renumber(array $siblingSorts, ?string $sortField): void
    {
        $table = DataObject::getSchema()->baseDataTable($this->modelClass());
        foreach ($siblingSorts as $siblingId => $sort) {
            DB::prepared_query(sprintf('UPDATE "%s" SET "%s" = ? WHERE "ID" = ?', $table, $sortField), [$sort, $siblingId]);
        }
    }

    private function lastSort(int $parentId, string $sortField): int
    {
        return (int) DataObject::get($this->modelClass())->filter('ParentID', $parentId)->max($sortField);
    }

    /**
     * A write that Hierarchy validation refuses is a refused drop, answered 403 with its own reason, not a 500
     *
     * @throws HTTPResponse_Exception
     */
    private function throwValidationError(ValidationResult $result): never
    {
        foreach ($result->getMessages() as $code => $message) {
            if (($message['messageType'] ?? null) === ValidationResult::TYPE_ERROR) {
                throw ShellSubmission::jsonException(
                    403,
                    (string) $message['message'],
                    is_string($code) ? $code : 'invalid',
                    ($message['fieldName'] ?? null) ?: null
                );
            }
        }
        throw ShellSubmission::jsonException(403, 'The page could not be moved', 'invalid');
    }
}
