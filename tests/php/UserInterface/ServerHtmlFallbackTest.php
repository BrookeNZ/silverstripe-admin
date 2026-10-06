<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use LogicException;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\FieldComponentCandidatesTest\SchemaController;
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
        $request = new HTTPRequest('GET', 'admin/field-component-candidates-test/schema/TestForm');
        $request->addHeader('X-Formschema-Request', 'schema');
        $request->setSession(new Session([]));
        $controller = SchemaController::create();
        $controller->setRequest($request);

        $body = json_decode($controller->getSchemaResponse('TestForm', $form)->getBody(), true);
        return $body['schema']['fields'];
    }
}
