<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use Psr\Log\LoggerInterface;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Admin\Tests\UserInterface\FieldComponentCandidatesTest\SchemaController;
use SilverStripe\Admin\Tests\UserInterface\SchemaFallbackRulesTest\DefaultsComponentField;
use SilverStripe\Admin\Tests\UserInterface\SchemaFallbackRulesTest\FieldlessPage;
use SilverStripe\Admin\Tests\UserInterface\SchemaFallbackRulesTest\ThrowingTemplateField;
use SilverStripe\Admin\Tests\UserInterface\ServerHtmlFallbackTest\TemplateOnlyField;
use SilverStripe\Admin\UserInterface\RecordClassAncestry;
use SilverStripe\Admin\UserInterface\ServerHtmlFallback;
use SilverStripe\Assets\File;
use SilverStripe\Assets\Image;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\Session;
use SilverStripe\Core\Config\Config;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Dev\SapphireTest;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\FormField;
use SilverStripe\Forms\TextField;
use SilverStripe\ORM\DataObject;

class SchemaFallbackRulesTest extends SapphireTest
{
    public function testTablelessConcreteClassIsMappedToItsAncestorsAndTestOnlyClassesAreNot(): void
    {
        $map = RecordClassAncestry::create()->getMap();

        $this->assertSame([File::class, DataObject::class], $map[Image::class]);
        $this->assertArrayNotHasKey(FieldlessPage::class, $map);
    }

    public function testComponentSetThroughSchemaDataIsHonouredAsInLegacy(): void
    {
        $field = TemplateOnlyField::create('Legacy')->setSchemaData(['component' => 'ProjectWidget']);
        $form = Form::create(null, 'TestForm', FieldList::create($field), FieldList::create());

        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);
        $this->assertSame('ProjectWidget', $this->schemaFields($form)[0]['component']);

        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $shell = $this->schemaFields($form)[0];
        $this->assertSame('ProjectWidget', $shell['component']);
        $this->assertArrayNotHasKey('fallback', $shell);
    }

    public function testComponentFromOverriddenDefaultsIsHonoured(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $form = Form::create(
            null,
            'TestForm',
            FieldList::create(DefaultsComponentField::create('Widget')),
            FieldList::create()
        );

        $this->assertSame([], ServerHtmlFallback::singleton()->mark($form));
        $shell = $this->schemaFields($form)[0];
        $this->assertSame('ProjectWidget', $shell['component']);
        $this->assertArrayNotHasKey('fallback', $shell);
    }

    public function testThrowingFallbackTemplateFailsOnlyThatField(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects($this->once())
            ->method('warning')
            ->with($this->logicalAnd($this->stringContains('"Broken"'), $this->stringContains('"TestForm"')));
        Injector::inst()->registerService(ServerHtmlFallback::create()->setLogger($logger), ServerHtmlFallback::class);
        $form = Form::create(
            null,
            'TestForm',
            FieldList::create(
                TextField::create('Title'),
                ThrowingTemplateField::create('Broken'),
                TemplateOnlyField::create('Legacy')
            ),
            FieldList::create()
        );

        [$title, $broken, $legacy] = $this->schemaFields($form);

        $this->assertSame('Title', $title['name']);
        $this->assertNull($broken['component']);
        $this->assertArrayNotHasKey('fallback', $broken);
        $this->assertSame([ThrowingTemplateField::class, FormField::class], $broken['componentCandidates']);
        $this->assertStringContainsString('name="Legacy"', $legacy['fallback']['html']);
    }

    public function testDisabledFallbackFieldKeepsItsDisabledControl(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
        $field = TemplateOnlyField::create('Legacy')->setDisabled(true)->setValue('<b>"x"</b>');
        $form = Form::create(null, 'TestForm', FieldList::create($field), FieldList::create());

        $html = $this->schemaFields($form)[0]['fallback']['html'];

        $this->assertStringContainsString('disabled', $html);
        $this->assertStringNotContainsString('<b>"x"</b>', $html);
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
