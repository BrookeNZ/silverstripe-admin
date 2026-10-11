<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use DNADesign\Elemental\Forms\ElementalAreaField;
use DNADesign\Elemental\Models\BaseElement;
use DNADesign\Elemental\Models\ElementalArea;
use DNADesign\Elemental\Models\ElementContent;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\ElementalAreaBlocksTest\VersionCacheSpy;
use SilverStripe\Admin\Tests\UserInterface\FieldComponentCandidatesTest\SchemaController;
use SilverStripe\Admin\UserInterface\Elemental\ElementVersionsExtension;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;
use SilverStripe\Versioned\Versioned;

class ElementVersionsTest extends FunctionalTest
{
    protected $usesDatabase = true;

    protected static $required_extensions = [
        BaseElement::class => [VersionCacheSpy::class],
    ];

    private ElementalArea $area;

    /** @var array<string, int> */
    private array $ids = [];

    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        Versioned::withVersionedMode(function (): void {
            Versioned::set_stage(Versioned::DRAFT);
            $this->area = ElementalArea::create();
            $this->area->write();
            foreach (['published', 'modified', 'draftOnly'] as $sort => $name) {
                $block = ElementContent::create(['Title' => $name, 'Sort' => $sort + 1, 'ParentID' => $this->area->ID]);
                $block->write();
                if ($name !== 'draftOnly') {
                    $block->publishSingle();
                }
                if ($name === 'modified') {
                    $block->Title = 'modified again';
                    $block->write();
                }
                $this->ids[$name] = (int) $block->ID;
            }
        });
        $this->clearVersionCache();
        VersionCacheSpy::$prepopulated = [];
    }

    public function testBatchedVersionNumbersEqualThePerBlockOnes(): void
    {
        ElementVersionsExtension::prepopulateFor($this->area->ID);

        $cache = $this->versionCache();
        foreach ([Versioned::DRAFT, Versioned::LIVE] as $stage) {
            foreach ($this->ids as $name => $id) {
                $this->assertArrayHasKey($id, $cache[$stage] ?? [], "{$name} {$stage} is not batched");
                $perBlock = Versioned::get_versionnumber_by_stage(BaseElement::class, $stage, $id, false);
                $this->assertSame((int) $perBlock, (int) $cache[$stage][$id], "{$name} {$stage}");
            }
        }
        $this->assertSame(0, (int) $cache[Versioned::LIVE][$this->ids['draftOnly']]);
        $this->assertNotSame(
            $cache[Versioned::LIVE][$this->ids['modified']],
            $cache[Versioned::DRAFT][$this->ids['modified']]
        );
    }

    public function testTheReadElementsEndpointBatchesVersionNumbers(): void
    {
        $this->logInWithPermission('ADMIN');

        $response = $this->get("admin/elemental-area/api/readElements/{$this->area->ID}");

        $this->assertSame(200, $response->getStatusCode());
        $ids = array_values($this->ids);
        sort($ids);
        $this->assertSame([Versioned::DRAFT => $ids, Versioned::LIVE => $ids], VersionCacheSpy::$prepopulated);
        $published = array_column(json_decode($response->getBody(), true), 'isPublished', 'title');
        $this->assertSame(['published' => true, 'modified again' => true, 'draftOnly' => false], $published);
    }

    public function testTheSchemaBlockListBatchesVersionNumbers(): void
    {
        $this->logInWithPermission('ADMIN');
        $form = Form::create(
            null,
            'TestForm',
            FieldList::create(ElementalAreaField::create('ElementalArea', $this->area, [ElementContent::class => 'Content'])),
            FieldList::create()
        );
        $request = new HTTPRequest('GET', 'schema/TestForm');
        $request->addHeader('X-Formschema-Request', 'schema');
        $request->setSession(new Session([]));
        $controller = SchemaController::create();
        $controller->setRequest($request);

        $body = json_decode($controller->getSchemaResponse('TestForm', $form)->getBody(), true);

        $this->assertCount(3, $body['schema']['fields'][0]['data']['blocks']);
        $ids = array_values($this->ids);
        sort($ids);
        $this->assertSame([Versioned::DRAFT => $ids, Versioned::LIVE => $ids], VersionCacheSpy::$prepopulated);
    }

    private function versionCache(): array
    {
        return (fn () => Versioned::$cache_versionnumber[BaseElement::class] ?? [])
            ->bindTo(null, Versioned::class)();
    }

    private function clearVersionCache(): void
    {
        (fn () => Versioned::$cache_versionnumber = [])->bindTo(null, Versioned::class)();
    }
}
