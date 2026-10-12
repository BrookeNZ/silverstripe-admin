<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use LogicException;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\FieldComponentCandidatesTest\SchemaController;
use SilverStripe\Admin\Tests\UserInterface\ServerHtmlFallbackTest\ComponentMaskingComposite;
use SilverStripe\Admin\Tests\UserInterface\ServerHtmlFallbackTest\CountingField;
use SilverStripe\Admin\Tests\UserInterface\ServerHtmlFallbackTest\SchemaDataCountingField;
use SilverStripe\Admin\Tests\UserInterface\ServerHtmlFallbackTest\TemplateOnlyField;
use SilverStripe\Admin\UserInterface\ServerHtmlFallback;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\SapphireTest;
use SilverStripe\Forms\CompositeField;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\FormAction;
use SilverStripe\Forms\FormField;
use SilverStripe\Forms\Tab;
use SilverStripe\Forms\TabSet;
use SilverStripe\Forms\TextField;

class ServerHtmlFallbackTest extends SapphireTest
{
    public function testOnlyFieldsWithNeitherComponentNorTypeAreMarked(): void
    {
        $form = $this->createForm();

        $marked = ServerHtmlFallback::singleton()->mark($form);

        $this->assertSame(['Form_TestForm_Legacy'], array_keys($marked));
        $this->assertSame(ServerHtmlFallback::PLACEHOLDER_COMPONENT, $form->Fields()->dataFieldByName('Legacy')->getSchemaComponent());
        $this->assertNull($form->Fields()->dataFieldByName('Title')->getSchemaComponent());

        ServerHtmlFallback::singleton()->restore($marked);
        $this->assertNull($form->Fields()->dataFieldByName('Legacy')->getSchemaComponent());
    }

    public function testNestedComponentDeclaredThroughSetSchemaDataIsNotMarked(): void
    {
        $declared = TemplateOnlyField::create('Declared')->setSchemaData(['component' => 'DeclaredField']);
        $form = Form::create(
            null,
            'TestForm',
            FieldList::create(TabSet::create('Root', Tab::create('Main', $declared, TemplateOnlyField::create('Legacy')))),
            FieldList::create()
        );

        $marked = ServerHtmlFallback::singleton()->mark($form);
        ServerHtmlFallback::singleton()->restore($marked);

        $this->assertSame(['Form_TestForm_Legacy'], array_keys($marked));
    }

    public function testChildrenOfACompositeThatRewritesThemAreJudgedOnTheirOwnData(): void
    {
        $form = Form::create(
            null,
            'TestForm',
            FieldList::create(ComponentMaskingComposite::create(TemplateOnlyField::create('Legacy'))),
            FieldList::create()
        );

        $marked = ServerHtmlFallback::singleton()->mark($form);
        ServerHtmlFallback::singleton()->restore($marked);

        $this->assertSame(['Form_TestForm_Legacy'], array_keys($marked));
    }

    public function testNestedFieldSchemaDataIsBuiltOnceWhenMarking(): void
    {
        SchemaDataCountingField::$builds = 0;
        $form = Form::create(
            null,
            'TestForm',
            FieldList::create(TabSet::create('Root', Tab::create('Main', SchemaDataCountingField::create('Counted')))),
            FieldList::create()
        );

        ServerHtmlFallback::singleton()->mark($form);

        $this->assertSame(1, SchemaDataCountingField::$builds);
    }

    public function testShellSchemaCarriesTheNestedFieldsHolderHtml(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $form = $this->createForm();

        $legacy = $this->schemaFields($form)[0]['children'][1];

        $this->assertNull($legacy['component']);
        $this->assertNull($legacy['schemaType']);
        $this->assertSame([TemplateOnlyField::class, FormField::class], $legacy['componentCandidates']);
        $this->assertStringContainsString('name="Legacy"', $legacy['fallback']['html']);
        $this->assertStringContainsString('id="Form_TestForm_Legacy_Holder"', $legacy['fallback']['html']);
        $this->assertArrayNotHasKey('fallback', $this->schemaFields($form)[0]['children'][0]);
        $this->assertNull($form->Fields()->dataFieldByName('Legacy')->getSchemaComponent());
    }

    public function testLegacySchemaStillRejectsTheField(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);

        $this->expectException(LogicException::class);
        $this->schemaFields($this->createForm());
    }

    public function testEachFallbackFieldCarriesItsOwnHtml(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $form = Form::create(
            null,
            'TestForm',
            FieldList::create(
                TemplateOnlyField::create('First'),
                CompositeField::create(TemplateOnlyField::create('Second'), TextField::create('Title')),
                TemplateOnlyField::create('Third')
            ),
            FieldList::create()
        );

        $fields = $this->schemaFields($form);

        $this->assertStringContainsString('name="First"', $fields[0]['fallback']['html']);
        $this->assertStringContainsString('name="Second"', $fields[1]['children'][0]['fallback']['html']);
        $this->assertArrayNotHasKey('fallback', $fields[1]['children'][1]);
        $this->assertStringContainsString('name="Third"', $fields[2]['fallback']['html']);
        $this->assertStringNotContainsString('name="First"', $fields[2]['fallback']['html']);
    }

    public function testStateOnlyRequestRendersNoFallback(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        CountingField::$renders = 0;
        $form = Form::create(null, 'TestForm', FieldList::create(CountingField::create('Counted')), FieldList::create());

        $body = $this->schemaResponse($form, 'state');

        $this->assertArrayNotHasKey('schema', $body);
        $this->assertArrayHasKey('state', $body);
        $this->assertSame(0, CountingField::$renders);
        $this->assertNull($form->Fields()->dataFieldByName('Counted')->getSchemaComponent());
    }

    private function createForm(): Form
    {
        return Form::create(
            null,
            'TestForm',
            FieldList::create(CompositeField::create(TextField::create('Title'), TemplateOnlyField::create('Legacy'))),
            FieldList::create(FormAction::create('doSave', 'Save'))
        );
    }

    private function schemaFields(Form $form): array
    {
        return $this->schemaResponse($form, 'schema')['schema']['fields'];
    }

    private function schemaResponse(Form $form, string $parts): array
    {
        $request = new HTTPRequest('GET', 'admin/field-component-candidates-test/schema/TestForm');
        $request->addHeader('X-Formschema-Request', $parts);
        $request->setSession(new Session([]));
        $controller = SchemaController::create();
        $controller->setRequest($request);

        return json_decode($controller->getSchemaResponse('TestForm', $form)->getBody(), true);
    }
}
