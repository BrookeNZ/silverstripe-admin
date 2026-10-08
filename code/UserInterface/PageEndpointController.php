<?php

namespace SilverStripe\Admin\UserInterface;

use Psr\Log\LoggerInterface;
use SilverStripe\Admin\AdminController;
use SilverStripe\Control\Director;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Core\ClassInfo;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\HiddenClass;
use SilverStripe\ORM\Hierarchy\Hierarchy;
use Throwable;

/**
 * What the shell's page endpoints (PageTreeController, PageCreateController, PageMoveController) share: the page
 * model and CMS controller named in config, a refusal from AdminController::init() as a JSON 403, and every
 * failure, an uncaught exception included (500, `serverError`), leaving as ShellSubmission::jsonError()'s
 * envelope so the client always has a message to show.
 *
 * The model and CMS controller are config so the admin module keeps no hard dependency on silverstripe/cms;
 * without either every action answers 404.
 *
 * Declares no `url_segment`, which keeps AdminRootController from routing it, and no `allowed_actions`, which
 * would merge into each endpoint's own.
 */
abstract class PageEndpointController extends AdminController
{
    private static string|array $required_permission_codes = 'CMS_ACCESS_CMSMain';

    private static string $model_class = 'SilverStripe\\CMS\\Model\\SiteTree';

    private static string $cms_controller = 'SilverStripe\\CMS\\Controllers\\CMSMain';

    /**
     * The message a 500 shows outside dev
     */
    abstract protected function serverErrorMessage(): string;

    /**
     * The 404 message for the bare endpoint, naming its actions
     */
    abstract protected function usage(): string;

    /**
     * AdminController::init() refuses with a login redirect or a plain-text 403, neither of which the client's
     * fetch can read, so both become the JSON envelope
     */
    protected function init()
    {
        parent::init();

        $response = $this->getResponse();
        if ($response->isError() || $response->isRedirect()) {
            $this->setResponse(ShellSubmission::refusal('Permission denied', 'Not logged in'));
        }
    }

    protected function handleAction($request, $action)
    {
        try {
            return $this->runAction(function () use ($request, $action) {
                if (!$this->modelClass()) {
                    throw ShellSubmission::jsonException(404, 'No page model is installed');
                }
                return parent::handleAction($request, $action);
            });
        } catch (HTTPResponse_Exception $exception) {
            return $exception->getResponse();
        } catch (Throwable $exception) {
            Injector::inst()->get(LoggerInterface::class)->error($exception->getMessage(), ['exception' => $exception]);
            return ShellSubmission::jsonError(
                500,
                Director::isDev() ? $exception->getMessage() : $this->serverErrorMessage()
            );
        }
    }

    /**
     * Where an endpoint sets up around every action, or refuses before any runs
     */
    protected function runAction(callable $next): mixed
    {
        return $next();
    }

    public function index(): HTTPResponse
    {
        throw ShellSubmission::jsonException(404, $this->usage());
    }

    /**
     * Null without silverstripe/cms: admin does not require it, which is why the classes are named in config
     * rather than imported
     */
    protected function modelClass(): ?string
    {
        $class = static::config()->get('model_class');
        $cms = static::config()->get('cms_controller');
        if (!$class || !class_exists($class) || !$cms || !class_exists($cms)
            || !DataObject::has_extension($class, Hierarchy::class)
        ) {
            return null;
        }
        return $class;
    }

    protected function cms(): object
    {
        return Injector::inst()->get(static::config()->get('cms_controller'));
    }

    /**
     * The model's subclasses less the base class, SiteTree.hide_pagetypes and HiddenClass types, as
     * CMSMain::getAllowedSubClasses() and the HiddenClass check after it
     *
     * @return array<string>
     */
    protected function pageTypes(): array
    {
        $classes = ClassInfo::getValidSubClasses($this->modelClass());
        DataObject::singleton($this->modelClass())->invokeWithExtensions('updateAllowedSubClasses', $classes);
        return array_values(array_filter(
            $classes,
            fn (string $class) => !(DataObject::singleton($class) instanceof HiddenClass)
        ));
    }
}
