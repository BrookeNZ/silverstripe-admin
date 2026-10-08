<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use DNADesign\Elemental\Controllers\ElementalAreaController;
use DNADesign\Elemental\Forms\ElementalAreaField;
use DNADesign\Elemental\Models\ElementalArea;
use DNADesign\Elemental\Models\ElementContent;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\ElementalBlocksRulesTest\FailingReadExtension;
use SilverStripe\Admin\Tests\UserInterface\FieldComponentCandidatesTest\SchemaController;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;

class ElementalBlocksRulesTest extends FunctionalTest
{
    protected $usesDatabase = true;

    protected static $required_extensions = [
        ElementalAreaController::class => [FailingReadExtension::class],
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
    }

    protected function tearDown(): void
    {
        FailingReadExtension::$fail = false;
        parent::tearDown();
    }

    public function testAFailingBlockListLeavesTheFormSchemaStanding(): void
    {
        $this->logInWithPermission('ADMIN');
        $area = ElementalArea::create();
        $area->write();
        ElementContent::create(['Title' => 'Only', 'ParentID' => $area->ID])->write();
        FailingReadExtension::$fail = true;

        $form = Form::create(
            null,
            'TestForm',
            FieldList::create(ElementalAreaField::create('ElementalArea', $area, [ElementContent::class => 'Content'])),
            FieldList::create()
        );
        $request = new HTTPRequest('GET', 'schema/TestForm');
        $request->addHeader('X-Formschema-Request', 'schema');
        $request->setSession(new Session([]));
        $controller = SchemaController::create();
        $controller->setRequest($request);

        $body = json_decode($controller->getSchemaResponse('TestForm', $form)->getBody(), true);

        $this->assertArrayNotHasKey('blocks', $body['schema']['fields'][0]['data']);
    }
}
