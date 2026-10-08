<?php

namespace SilverStripe\Admin\UserInterface;

use Psr\SimpleCache\CacheInterface;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Control\Controller;
use SilverStripe\Control\Director;
use SilverStripe\Core\Cache\CacheFactory;
use SilverStripe\Core\ClassInfo;
use SilverStripe\Core\Extension;
use SilverStripe\Core\Flushable;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Forms\Form;
use SilverStripe\i18n\i18n;
use SilverStripe\ORM\DataObject;
use SilverStripe\VersionedAdmin\ArchiveAdmin;

/**
 * Gives the shell the Archive section's legacy views instead of one model tab per versioned class: Pages,
 * Blocks and Files, then "Other", whose type dropdown (the archive pilet's ArchiveTypeField) loads the chosen
 * type. "Other" points at the type of the current request, else the dropdown's first type, so every type the
 * dropdown reaches is a model tab the shell resolves on that page load. A member who cannot view the section is
 * sent no tabs, as legacy's client config listed no classes.
 *
 * Departures: the Other tab opens the first other type's archive grid, where legacy's `?others=1` showed the type
 * dropdown over an empty list. A page navigation to legacy's `?others=1` URL is redirected to the Other tab.
 *
 * @extends Extension<ArchiveAdmin>
 */
class ArchiveAdminShellExtension extends Extension implements Flushable
{
    // The schemaComponent the archive pilet registers
    public const TYPE_FIELD_COMPONENT = 'ArchiveTypeField';

    private const CACHE_NAMESPACE = 'ArchiveAdminShellTabs';

    /**
     * The archive tabs read in this process, by cache key
     */
    private static array $memo = [];

    public static function flush()
    {
        static::$memo = [];
        static::cache()->clear();
    }

    /**
     * Names the model tabs for ModelAdmin's client config; it runs only for a member who can view the section
     */
    protected function updateShellModelTabs(?array &$tabs): void
    {
        $archive = $this->getArchiveTabs();
        $requested = $this->requestedClass();
        $otherClass = in_array($requested, $archive['otherClasses'], true) ? $requested : ($archive['otherClasses'][0] ?? null);

        $tabs = [];
        foreach ($archive['tabs'] as ['class' => $tabClass, 'title' => $title]) {
            $class = in_array($tabClass, $archive['mainClasses'], true) ? $tabClass : $otherClass;
            if ($class) {
                $tabs[] = ['tab' => str_replace('\\', '-', $class), 'title' => $title];
            }
        }
    }

    /**
     * The archive's main and other classes and its tabs, which ArchiveAdmin rebuilds from every DataObject class on
     * each call. Cached per admin class and locale, and per class list as RecordClassAncestry keys its map, so a
     * new class or a flush rebuilds them. The tabs do not depend on the member: `canView` runs before the hook and
     * is not cached
     *
     * @return array{mainClasses: list<string>, otherClasses: list<string>, tabs: list<array{class: string, title: string}>}
     */
    public function getArchiveTabs(): array
    {
        $key = $this->archiveTabsKey();
        if (isset(static::$memo[$key])) {
            return static::$memo[$key];
        }
        $cache = static::cache();
        $archive = $cache->get($key);
        if (!is_array($archive)) {
            $archive = $this->buildArchiveTabs();
            $cache->set($key, $archive);
        }
        return static::$memo[$key] = $archive;
    }

    /**
     * Forgets the archive tabs read in this process, so a test reads the cache
     */
    public static function resetMemo(): void
    {
        static::$memo = [];
    }

    private function archiveTabsKey(): string
    {
        $classes = ClassInfo::subclassesFor(DataObject::class, false);
        return md5(get_class($this->getOwner()) . '|' . i18n::get_locale() . '|' . implode(',', $classes));
    }

    private function buildArchiveTabs(): array
    {
        $admin = $this->getOwner();
        $tabs = [];
        foreach ($admin->getManagedModelTabs() as $tab) {
            $tabs[] = ['class' => $tab->ClassName, 'title' => $tab->Title];
        }
        return [
            'mainClasses' => array_keys($admin->getVersionedModels('main', true)),
            'otherClasses' => array_keys($admin->getVersionedModels('other', true)),
            'tabs' => $tabs,
        ];
    }

    private static function cache(): CacheInterface
    {
        return Injector::inst()->get(CacheFactory::class)->create(
            CacheInterface::class . '.' . static::CACHE_NAMESPACE,
            ['namespace' => static::CACHE_NAMESPACE]
        );
    }

    /**
     * The model tab segment of the current request's URL as a class name. The section config comes from a
     * singleton, and a shell page navigation below the tab never parses `$ModelClass`, so the URL is read
     */
    private function requestedClass(): string
    {
        $path = trim((string) Controller::curr()?->getRequest()->getURL(), '/') . '/';
        $prefix = trim(Director::makeRelative($this->getOwner()->Link()), '/') . '/';
        if (!str_starts_with($path, $prefix)) {
            return '';
        }
        return str_replace('-', '\\', explode('/', substr($path, strlen($prefix)))[0]);
    }

    protected function onAfterInit(): void
    {
        $admin = $this->getOwner();
        $request = $admin->getRequest();
        if (!LeftAndMain::config()->get('piral_shell')
            || $admin->getResponse()->isFinished()
            || !$request->isGET()
            || $request->isAjax()
            || !$request->getVar('others')
            || $request->param('ModelClass')
        ) {
            return;
        }
        $otherClass = array_key_first($admin->getVersionedModels('other', true));
        if ($otherClass) {
            $admin->redirect($admin->Link(str_replace('\\', '-', $otherClass)));
        }
    }

    protected function updateEditForm(Form $form): void
    {
        if (LeftAndMain::config()->get('piral_shell')) {
            $form->Fields()->dataFieldByName('OtherDropdown')?->setSchemaComponent(static::TYPE_FIELD_COMPONENT);
        }
    }
}
