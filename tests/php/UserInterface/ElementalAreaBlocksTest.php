<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use DNADesign\Elemental\Forms\ElementalAreaField;
use DNADesign\Elemental\Models\ElementalArea;
use DNADesign\Elemental\Models\ElementContent;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\ElementalAreaBlocksTest\BlocksPage;
use SilverStripe\Admin\Tests\UserInterface\FieldComponentCandidatesTest\SchemaController;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Forms\CompositeField;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;
use SilverStripe\Security\InheritedPermissions;
use SilverStripe\Versioned\Versioned;

class ElementalAreaBlocksTest extends FunctionalTest
{
    protected $usesDatabase = true;

    protected static $extra_dataobjects = [
        BlocksPage::class,
    ];

    protected function setUp(): void
    {
        parent::setUp();
        if (!class_exists(ElementalArea::class)) {
            $this->markTestSkipped('dnadesign/silverstripe-elemental is not installed');
        }
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
    }

    public function testSchemaCarriesTheReadElementsList(): void
    {
        $this->logInWithPermission('ADMIN');
        $area = $this->createArea();

        $read = $this->get("admin/elemental-area/api/readElements/{$area->ID}");
        $this->assertSame(200, $read->getStatusCode());
        $expected = json_decode($read->getBody(), true);
        $this->assertCount(2, $expected);

        $entry = $this->areaEntry($area);
        $this->assertSame($expected, $entry['data']['blocks']);
    }

    public function testNoBlocksForAnUnsavedArea(): void
    {
        $this->logInWithPermission('ADMIN');

        $this->assertArrayNotHasKey('blocks', $this->areaEntry(ElementalArea::create())['data']);
    }

    public function testNoBlocksForAnAreaTheEndpointRefuses(): void
    {
        $area = $this->createArea();
        $this->logInWithPermission('CMS_ACCESS_CMSMain');

        $this->assertArrayNotHasKey('blocks', $this->areaEntry($area)['data']);
    }

    public function testNoBlocksForAPageTheMemberMayNotView(): void
    {
        Versioned::withVersionedMode(function (): void {
            Versioned::set_stage(Versioned::DRAFT);
            $open = BlocksPage::create(['Title' => 'Open']);
            $open->write();
            $hidden = BlocksPage::create(['Title' => 'Hidden', 'CanViewType' => InheritedPermissions::ONLY_THESE_USERS]);
            $hidden->write();
            foreach ([$open, $hidden] as $page) {
                ElementContent::create(['Title' => 'Block', 'ParentID' => $page->ElementalAreaID])->write();
            }
            $this->logInWithPermission('CMS_ACCESS_CMSMain');

            $this->assertCount(1, $this->areaEntry($open->ElementalArea())['data']['blocks']);
            $this->assertArrayNotHasKey('blocks', $this->areaEntry($hidden->ElementalArea())['data']);
        });
    }

    private function createArea(): ElementalArea
    {
        $area = ElementalArea::create();
        $area->write();
        foreach (['First', 'Second'] as $sort => $title) {
            $block = ElementContent::create(['Title' => $title, 'Sort' => $sort + 1, 'ParentID' => $area->ID]);
            $block->write();
        }
        return $area;
    }

    private function areaEntry(ElementalArea $area): array
    {
        $form = Form::create(
            null,
            'TestForm',
            FieldList::create(
                CompositeField::create(
                    ElementalAreaField::create('ElementalArea', $area, [ElementContent::class => 'Content'])
                )
            ),
            FieldList::create()
        );
        $request = new HTTPRequest('GET', 'schema/TestForm');
        $request->addHeader('X-Formschema-Request', 'schema');
        $request->setSession(new Session([]));
        $controller = SchemaController::create();
        $controller->setRequest($request);

        $body = json_decode($controller->getSchemaResponse('TestForm', $form)->getBody(), true);
        return $body['schema']['fields'][0]['children'][0];
    }
}
