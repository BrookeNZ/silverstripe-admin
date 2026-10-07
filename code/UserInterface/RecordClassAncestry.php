<?php

namespace SilverStripe\Admin\UserInterface;

use SilverStripe\Core\ClassInfo;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\ORM\DataObject;

/**
 * The ancestry of every record class the shell may cache reads under, for the client config's
 * `recordClasses`: each DataObject subclass with its own table, mapped to its ancestors from its parent up
 * to DataObject. The shell's server cache matches a records-changed event to cached keys by this map, so
 * an event for `Page` reaches keys under `SiteTree` and the reverse (client/shell/src/state/serverCache.ts).
 *
 * Classes without a table (abstract bases, test doubles that add no fields) are left out; they still match
 * keys under their own exact name.
 */
class RecordClassAncestry
{
    use Injectable;

    private ?array $map = null;

    /**
     * @return array<string, list<string>>
     */
    public function getMap(): array
    {
        if ($this->map !== null) {
            return $this->map;
        }
        $schema = DataObject::getSchema();
        $map = [];
        foreach (ClassInfo::subclassesFor(DataObject::class, false) as $class) {
            if ($schema->classHasTable($class)) {
                $map[$class] = $this->ancestorsOf($class);
            }
        }
        return $this->map = $map;
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
