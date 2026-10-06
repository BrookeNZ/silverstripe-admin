<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\FieldComponentCandidatesTest\SchemaController;
use SilverStripe\Admin\UserInterface\FieldComponentCandidates;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\SapphireTest;
use JonoM\FocusPoint\Forms\FocusPointField;
use SilverStripe\Forms\CompositeField;
use SilverStripe\Forms\DatetimeField;
use SilverStripe\Forms\FieldGroup;
use SilverStripe\Forms\HTMLEditor\HTMLEditorField;
use SilverStripe\Forms\PopoverField;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\FormAction;
use SilverStripe\Forms\FormField;
use SilverStripe\Forms\SearchableMultiDropdownField;
use SilverStripe\Forms\Schema\FormSchema;
use SilverStripe\Forms\TextField;
use SilverStripe\Forms\TreeDropdownField;
use SilverStripe\Forms\TreeMultiselectField;
use SilverStripe\Security\Group;

class FieldComponentCandidatesTest extends SapphireTest
{
    protected $usesDatabase = true;

    public function testFieldWithoutComponentListsItsClassAncestry(): void
    {
        $this->assertSame(
            [TextField::class, FormField::class],
            FieldComponentCandidates::singleton()->forField(TextField::create('Title'))
        );
    }

    public function testCandidatesStopAtTheFieldsOwnComponent(): void
    {
        $field = SearchableMultiDropdownField::create('Members', 'Members', Group::get());

        $this->assertSame(
            [SearchableMultiDropdownField::class, 'SearchableDropdownField'],
            FieldComponentCandidates::singleton()->forField($field)
        );
    }

    public function testInheritedComponentIsListedAtTheDeclaringClass(): void
    {
        $field = TreeMultiselectField::create('Groups', 'Groups', Group::class);

        $this->assertSame(
            [TreeMultiselectField::class, TreeDropdownField::class, 'TreeDropdownField'],
            FieldComponentCandidates::singleton()->forField($field)
        );
    }

    public function testInstanceComponentIsTheOnlyCandidate(): void
    {
        $field = TextField::create('Title')->setSchemaComponent('MarkdownField');

        $this->assertSame(['MarkdownField'], FieldComponentCandidates::singleton()->forField($field));
    }

    public function testUndeclaredSubclassListsClassesOnlySoItsTypeDefaultComesFirst(): void
    {
        $this->assertSame(
            [DatetimeField::class, TextField::class, FormField::class],
            FieldComponentCandidates::singleton()->forField(DatetimeField::create('Created'))
        );
    }

    public function testParentComponentIsNeverOffered(): void
    {
        $candidates = FieldComponentCandidates::singleton();

        $this->assertSame([FieldGroup::class, 'FieldGroup'], $candidates->forField(FieldGroup::create()));
        $this->assertSame([PopoverField::class, 'PopoverField'], $candidates->forField(PopoverField::create('Actions')));
    }

    public function testModuleSubclassOfFieldGroupStopsAtItsOwnComponent(): void
    {
        if (!class_exists(FocusPointField::class)) {
            $this->markTestSkipped('jonom/focuspoint is not installed');
        }
        $this->assertSame(
            [FocusPointField::class, 'FocusPointField'],
            FieldComponentCandidates::singleton()->forField(FocusPointField::create('FocusPoint'))
        );
    }

    public function testComputedComponentIsTheOnlyCandidate(): void
    {
        $field = HTMLEditorField::create('Content');

        $this->assertSame([$field->getSchemaComponent()], FieldComponentCandidates::singleton()->forField($field));
    }

    public function testSchemaIsDecoratedByIdIncludingNestedFieldsAndActions(): void
    {
        $form = $this->createForm();
        $schema = FormSchema::singleton()->getSchema($form);
        $schema['fields'][] = ['id' => 'Invented', 'name' => 'Invented'];

        $decorated = FieldComponentCandidates::singleton()->addToSchema($schema, $form);

        $group = $decorated['fields'][0];
        $this->assertSame([CompositeField::class, 'CompositeField'], $group['componentCandidates']);
        $this->assertSame([TextField::class, FormField::class], $group['children'][0]['componentCandidates']);
        $this->assertSame(
            [FormAction::class, 'FormAction'],
            $decorated['actions'][0]['componentCandidates']
        );
        $this->assertArrayNotHasKey('componentCandidates', end($decorated['fields']));
    }

    public function testSchemaResponseCarriesCandidatesOnlyForTheShell(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);
        $this->assertArrayNotHasKey('componentCandidates', $this->firstSchemaField());

        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $this->assertSame([CompositeField::class, 'CompositeField'], $this->firstSchemaField()['componentCandidates']);
    }

    private function createForm(): Form
    {
        return Form::create(
            null,
            'TestForm',
            FieldList::create(CompositeField::create(TextField::create('Title'))),
            FieldList::create(FormAction::create('doSave', 'Save'))
        );
    }

    private function firstSchemaField(): array
    {
        $request = new HTTPRequest('GET', 'admin/field-component-candidates-test/schema/TestForm');
        $request->addHeader('X-Formschema-Request', 'schema');
        $request->setSession(new Session([]));
        $controller = SchemaController::create();
        $controller->setRequest($request);

        $body = json_decode($controller->getSchemaResponse('TestForm', $this->createForm())->getBody(), true);
        return $body['schema']['fields'][0];
    }
}
