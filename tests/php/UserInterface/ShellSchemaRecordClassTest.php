<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\FieldComponentCandidatesTest\SchemaController;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\SapphireTest;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\TextField;
use SilverStripe\Security\Member;

class ShellSchemaRecordClassTest extends SapphireTest
{
    public function testShellSchemaNamesTheRecordClass(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);

        $schema = $this->schema($this->createForm()->loadDataFrom(Member::create()));

        $this->assertSame(Member::class, $schema['recordClass']);
    }

    public function testFormWithoutARecordNamesNoClass(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);

        $this->assertArrayNotHasKey('recordClass', $this->schema($this->createForm()));
    }

    public function testLegacySchemaNamesNoClass(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);

        $schema = $this->schema($this->createForm()->loadDataFrom(Member::create()));

        $this->assertArrayNotHasKey('recordClass', $schema);
    }

    private function createForm(): Form
    {
        return Form::create(null, 'TestForm', FieldList::create(TextField::create('FirstName')), FieldList::create());
    }

    private function schema(Form $form): array
    {
        $request = new HTTPRequest('GET', 'admin/field-component-candidates-test/schema/TestForm');
        $request->addHeader('X-Formschema-Request', 'schema');
        $request->setSession(new Session([]));
        $controller = SchemaController::create();
        $controller->setRequest($request);

        return json_decode($controller->getSchemaResponse('TestForm', $form)->getBody(), true)['schema'];
    }
}
