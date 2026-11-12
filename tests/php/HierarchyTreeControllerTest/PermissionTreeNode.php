<?php

namespace SilverStripe\Admin\Tests\HierarchyTreeControllerTest;

use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\Hierarchy\Hierarchy;
use SilverStripe\Security\InheritedPermissions;
use SilverStripe\Security\InheritedPermissionsExtension;
use SilverStripe\Security\PermissionChecker;
use SilverStripe\Security\PermissionCheckable;
use SilverStripe\Security\Security;

class PermissionTreeNode extends DataObject implements TestOnly, PermissionCheckable
{
    private static $table_name = 'HierarchyTreeControllerTest_PermissionTreeNode';

    private static $db = [
        'Title' => 'Varchar',
    ];

    private static $extensions = [
        Hierarchy::class,
        InheritedPermissionsExtension::class,
    ];

    public function getPermissionChecker(): PermissionChecker
    {
        $injector = Injector::inst();
        $name = PermissionChecker::class . '.' . PermissionTreeNode::class;
        if (!$injector->has($name)) {
            $injector->registerService(new InheritedPermissions(PermissionTreeNode::class), $name);
        }
        return $injector->get($name);
    }

    public function canView($member = null)
    {
        return $this->getPermissionChecker()->canView($this->ID, $member ?? Security::getCurrentUser());
    }

    public function canEdit($member = null)
    {
        return $this->getPermissionChecker()->canEdit($this->ID, $member ?? Security::getCurrentUser());
    }
}
