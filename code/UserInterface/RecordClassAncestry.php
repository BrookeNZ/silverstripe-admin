<?php

namespace SilverStripe\Admin\UserInterface;

use Psr\SimpleCache\CacheInterface;
use ReflectionClass;
use SilverStripe\Core\Cache\CacheFactory;
use SilverStripe\Core\ClassInfo;
use SilverStripe\Core\Flushable;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;

/**
 * The ancestry of every record class the shell may cache reads under, for the client config's
 * `recordClasses`: each concrete DataObject subclass mapped to its ancestors from its parent up to
 * DataObject. The shell's server cache matches a records-changed event to cached keys by this map, so an
 * event for `Page` reaches keys under `SiteTree` and the reverse (client/shell/src/state/serverCache.ts).
 *
 * Classes without their own table (Folder, a page type that adds no fields) are included, because a save
 * event names the record's own class and must still reach keys under its ancestors. Abstract classes are
 * left out, since no record carries them; they appear only as ancestors. TestOnly classes are left out
 * so a test manifest does not leak into the map.
 *
 * The map is cached across requests, keyed on the list of DataObject subclasses, and cleared on flush; a
 * change to a class's parent alone needs a flush to show.
 *
 * Departures: legacy has no such map; `recordClasses` is a new client-config key, shipped only to the
 * shell (LeftAndMain gates it on `piral_shell`).
 */
class RecordClassAncestry implements Flushable
{
    use Injectable;

    private const CACHE_NAMESPACE = 'RecordClassAncestry';

    private ?array $map = null;

    public static function flush()
    {
        static::cache()->clear();
    }

    /**
     * @return array<string, list<string>>
     */
    public function getMap(): array
    {
        if ($this->map !== null) {
            return $this->map;
        }
        $classes = ClassInfo::subclassesFor(DataObject::class, false);
        $key = md5(implode(',', $classes));
        $cache = static::cache();
        $map = $cache->get($key);
        if (!is_array($map)) {
            $map = $this->buildMap($classes);
            $cache->set($key, $map);
        }
        return $this->map = $map;
    }

    private static function cache(): CacheInterface
    {
        return Injector::inst()->get(CacheFactory::class)->create(
            CacheInterface::class . '.' . static::CACHE_NAMESPACE,
            ['namespace' => static::CACHE_NAMESPACE]
        );
    }

    /**
     * @param array<string, string> $classes
     * @return array<string, list<string>>
     */
    private function buildMap(array $classes): array
    {
        $map = [];
        foreach ($classes as $class) {
            if (!(new ReflectionClass($class))->isAbstract() && !ClassInfo::classImplements($class, TestOnly::class)) {
                $map[$class] = $this->ancestorsOf($class);
            }
        }
        return $map;
    }

    /**
     * @return list<string>
     */
    private function ancestorsOf(string $class): array
    {
        $ancestors = [];
        foreach (array_reverse(array_values(ClassInfo::ancestry($class))) as $ancestor) {
            if ($ancestor === $class) {
                continue;
            }
            $ancestors[] = $ancestor;
            if ($ancestor === DataObject::class) {
                break;
            }
        }
        return $ancestors;
    }
}
