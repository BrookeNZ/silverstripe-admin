<?php

namespace SilverStripe\Admin\UserInterface;

use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\ORM\DataObject;
use SilverStripe\Security\SecurityToken;

/**
 * JSON for the shell's add-page dialog at admin/pages/create: the page types a parent accepts, and creating a page.
 *
 * Applies the rules the legacy add form (CMSMainAddForm in silverstripe/cms) applies: the types are the model's
 * subclasses less the base class and SiteTree.hide_pagetypes (through the model's updateAllowedSubClasses hook), and
 * one is offered when it is not a HiddenClass and its canCreate() passes with the parent as context, which runs the
 * parent's allowed_children and canAddChildren(); at the root, the type must allow can_be_root and the member must
 * pass the site's canCreateTopLevel(). canAddChildren() is checked here as well, since a type that overrides
 * canCreate() skips it. `types` fires updateChildFilter with the refused classes and the parent ID, as legacy
 * childfilter does; it only narrows the list offered, as legacy's only narrowed the add form.
 *
 * The record is built by CMSMain::getNewItem() with the legacy `new-<ClassName>-<ParentID>` ID, so the title, sort
 * and updateNewItem extensions match a page added in the legacy CMS. Writes need the CSRF token in X-SecurityID.
 * Errors use PageEndpointController's envelope.
 *
 * CMS 7 change: with no Form, CMSMain's updateDoAdd hook is not fired. Extensions adjust the new page through this
 * controller's updateCreatedPage hook instead, which runs after the first write and saves any change it makes.
 *
 * Departures: a parent that does not exist answers 404, where legacy doAdd created the page at the root.
 */
class PageCreateController extends PageEndpointController
{
    private static ?string $url_segment = 'pages/create';

    private static string $url_rule = '/$Action/$ID';

    // Above CMSMain (39) and its subsections; CMSMain's own `add` action keeps the legacy add form
    private static int $url_priority = 44;

    private static array $allowed_actions = [
        'types',
        'page',
    ];

    protected function serverErrorMessage(): string
    {
        return 'The page could not be created';
    }

    protected function usage(): string
    {
        return 'Use types or page';
    }

    /**
     * GET pages/create/types/<parentId>, where 0 is the root
     */
    public function types(HTTPRequest $request): HTTPResponse
    {
        if (!$request->isGET() && !$request->isHEAD()) {
            throw ShellSubmission::jsonException(405, 'Only GET is supported', null, null, ['Allow' => 'GET, HEAD']);
        }
        $parentId = (int) $request->param('ID');
        $parent = $this->parentRecord($parentId);
        $creatable = $this->creatableClasses($parent);
        $disallowed = array_values(array_diff($this->pageTypes(), $creatable));
        $this->extend('updateChildFilter', $disallowed, $parentId);
        $cms = $this->cms();
        $defaultIconClass = $cms->getRecordIconCssClass(DataObject::singleton($this->modelClass()));
        $types = array_map(function (string $class) use ($cms, $defaultIconClass) {
            $singleton = DataObject::singleton($class);
            $iconUrl = $cms->getRecordIconUrl($singleton);
            $iconClass = $cms->getRecordIconCssClass($singleton) ?: $defaultIconClass;
            // As CMSMainAddForm::getRecordTypes(): a cms_icon image wins over the inherited default class
            if ($iconClass === $defaultIconClass && $iconUrl) {
                $iconClass = null;
            }
            return [
                'className' => $class,
                'title' => $singleton->i18n_singular_name(),
                'description' => (string) $singleton->i18n_classDescription(),
                'iconClass' => $iconClass ?: null,
                'iconUrl' => $iconUrl ?: null,
            ];
        }, array_values(array_diff($creatable, $disallowed)));
        usort($types, fn (array $a, array $b) => strcasecmp($a['title'], $b['title']));

        return ShellSubmission::jsonResponse(200, [
            'parent' => $parent ? ['id' => (int) $parent->ID, 'title' => (string) $parent->Title] : null,
            'types' => $types,
            'defaultType' => $parent?->defaultChild(),
        ]);
    }

    /**
     * POST pages/create/page with a JSON body `{ parentId, className }`; answers 201 with the new page
     */
    public function page(HTTPRequest $request): HTTPResponse
    {
        if (!$request->isPOST()) {
            throw ShellSubmission::jsonException(405, 'Only POST is supported', null, null, ['Allow' => 'POST']);
        }
        if (!SecurityToken::inst()->checkRequest($request)) {
            throw ShellSubmission::jsonException(400, 'The security token is missing or has expired', 'invalidToken');
        }
        $body = json_decode((string) $request->getBody(), true);
        $className = is_array($body) ? ($body['className'] ?? null) : null;
        $parentId = is_array($body) ? ($body['parentId'] ?? null) : null;
        if (!is_int($parentId) || $parentId < 0) {
            throw ShellSubmission::jsonException(400, 'parentId must be a page ID or 0', 'invalid', 'parentId');
        }
        $parent = $this->parentRecord($parentId);
        if (!is_string($className) || !in_array($className, $this->creatableClasses($parent), true)) {
            throw ShellSubmission::jsonException(403, 'This page type cannot be created here', 'forbidden', 'className');
        }

        $record = $this->cms()->getNewItem(sprintf('new-%s-%d', $className, $parentId), false);
        $record->write();
        $this->extend('updateCreatedPage', $record);
        if ($record->isChanged()) {
            $record->write();
        }

        return ShellSubmission::jsonResponse(201, [
            'id' => (int) $record->ID,
            'parentId' => (int) $record->ParentID,
            'className' => $record->ClassName,
            'title' => (string) $record->Title,
        ]);
    }

    /**
     * @return array<string>
     */
    private function creatableClasses(?DataObject $parent): array
    {
        if ($parent && !$parent->canAddChildren()) {
            return [];
        }
        $topLevel = $parent || $this->cms()->canCreateTopLevel();
        $classes = [];
        foreach ($this->pageTypes() as $class) {
            $singleton = DataObject::singleton($class);
            if (!$parent && (!$topLevel || !$singleton->config()->get('can_be_root'))) {
                continue;
            }
            if ($singleton->canCreate(null, ['Parent' => $parent])) {
                $classes[] = $class;
            }
        }
        return $classes;
    }

    private function parentRecord(int $id): ?DataObject
    {
        if ($id === 0) {
            return null;
        }
        $parent = DataObject::get($this->modelClass())->byID($id);
        if (!$parent) {
            throw ShellSubmission::jsonException(404, sprintf('No page with ID %d', $id), 'notFound', 'parentId');
        }
        if (!$parent->canView()) {
            throw ShellSubmission::jsonException(403, 'This page cannot be viewed', 'forbidden', 'parentId');
        }
        return $parent;
    }
}
