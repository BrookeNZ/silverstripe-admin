<?php

namespace SilverStripe\Admin\Tests\HierarchyTreeControllerTest;

class PermissionTestController extends TestController
{
    private static $url_segment = 'hierarchy-tree-permission-test';

    private static $model_class = PermissionTreeNode::class;
}
