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
use SilverStripe\ORM\HiddenClass;
use SilverStripe\ORM\Hierarchy\Hierarchy;
use SilverStripe\Security\Security;
use SilverStripe\Security\SecurityToken;
use Throwable;

/**
 * JSON for the shell's add-page dialog at admin/pages/create: the page types a parent accepts, and creating a page.
 *
 * Applies the rules the legacy add form (CMSMainAddForm in silverstripe/cms) applies: a type is offered when it is
 * not a HiddenClass and its canCreate() passes with the parent as context, which runs the parent's allowed_children
 * and canAddChildren(); at the root, the type must allow can_be_root and the member must pass the site's
 * canCreateTopLevel(). canAddChildren() is checked here as well, since a type that overrides canCreate() skips it.
 *
 * The record is built by CMSMain::getNewItem() with the legacy `new-<ClassName>-<ParentID>` ID, so the title, sort
 * and updateNewItem extensions match a page added in the legacy CMS. Writes need the CSRF token in X-SecurityID.
 * Errors share PageTreeController's envelope.
 *
 * CMS 7 change: with no Form, CMSMain's updateDoAdd hook is not fired. Extensions adjust the new page through this
 * controller's updateCreatedPage hook instead, which runs after the first write and saves any change it makes.
 */
class PageCreateController extends AdminController
{
    private static ?string $url_segment = 'pages/create';

    private static string $url_rule = '/$Action/$ID';

    // Above CMSMain (39) and its subsections; CMSMain's own `add` action keeps the legacy add form
    private static int $url_priority = 44;

    private static array $allowed_actions = [
        'types',
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
            return parent::handleAction($request, $action);
        } catch (HTTPResponse_Exception $exception) {
            return $exception->getResponse();
        } catch (Throwable $exception) {
            Injector::inst()->get(LoggerInterface::class)->error($exception->getMessage(), ['exception' => $exception]);
            return $this->errorResponse(
                500,
                'serverError',
                Director::isDev() ? $exception->getMessage() : 'The page could not be created'
            );
        }
    }

    public function index(): HTTPResponse
    {
        $this->throwError(404, 'notFound', 'Use types or page');
    }

    /**
     * GET pages/create/types/<parentId>, where 0 is the root
     */
    public function types(HTTPRequest $request): HTTPResponse
    {
        if (!$request->isGET()) {
            $this->throwError(405, 'methodNotAllowed', 'Only GET is supported');
        }
        $parent = $this->parentRecord((int) $request->param('ID'));
        $cms = Injector::inst()->get($this->config()->get('cms_controller'));
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
        }, $this->creatableClasses($parent));
        usort($types, fn (array $a, array $b) => strcasecmp($a['title'], $b['title']));

        return $this->jsonResponse(200, [
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
            $this->throwError(405, 'methodNotAllowed', 'Only POST is supported');
        }
        if (!SecurityToken::inst()->checkRequest($request)) {
            $this->throwError(400, 'invalidToken', 'The security token is missing or has expired');
        }
        $body = json_decode((string) $request->getBody(), true);
        $className = is_array($body) ? ($body['className'] ?? null) : null;
        $parentId = is_array($body) ? ($body['parentId'] ?? null) : null;
        if (!is_int($parentId) || $parentId < 0) {
            $this->throwError(400, 'invalid', 'parentId must be a page ID or 0', 'parentId');
        }
        $parent = $this->parentRecord($parentId);
        if (!is_string($className) || !in_array($className, $this->creatableClasses($parent), true)) {
            $this->throwError(403, 'forbidden', 'This page type cannot be created here', 'className');
        }

        $record = Injector::inst()->get($this->config()->get('cms_controller'))
            ->getNewItem(sprintf('new-%s-%d', $className, $parentId), false);
        $record->write();
        $this->extend('updateCreatedPage', $record);
        if ($record->isChanged()) {
            $record->write();
        }

        return $this->jsonResponse(201, [
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
        $topLevel = $parent || $this->canCreateTopLevel();
        $classes = [];
        foreach (ClassInfo::getValidSubClasses($this->modelClass()) as $class) {
            $singleton = DataObject::singleton($class);
            if ($singleton instanceof HiddenClass) {
                continue;
            }
            if (!$parent && (!$topLevel || $singleton->config()->get('can_be_root') === false)) {
                continue;
            }
            if ($singleton->canCreate(null, ['Parent' => $parent])) {
                $classes[] = $class;
            }
        }
        return $classes;
    }

    private function canCreateTopLevel(): bool
    {
        $cms = $this->config()->get('cms_controller');
        return !class_exists($cms) || Injector::inst()->get($cms)->canCreateTopLevel();
    }

    private function parentRecord(int $id): ?DataObject
    {
        if ($id === 0) {
            return null;
        }
        $parent = DataObject::get($this->modelClass())->byID($id);
        if (!$parent) {
            $this->throwError(404, 'notFound', sprintf('No page with ID %d', $id), 'parentId');
        }
        if (!$parent->canView()) {
            $this->throwError(403, 'forbidden', 'This page cannot be viewed', 'parentId');
        }
        return $parent;
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
