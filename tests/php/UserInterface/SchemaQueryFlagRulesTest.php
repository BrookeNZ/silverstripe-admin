<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use ReflectionMethod;
use SilverStripe\Admin\LeftAndMain;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Core\Config\Config;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Forms\Schema\FormSchema;
use SilverStripe\Security\InheritedPermissions;

class SchemaQueryFlagRulesTest extends FunctionalTest
{
    protected $usesDatabase = true;

    private const SCHEMA = 'admin/security/users/schema/EditForm';

    protected function setUp(): void
    {
        parent::setUp();
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
    }

    private function applied(HTTPRequest $request): HTTPRequest
    {
        (new ReflectionMethod(LeftAndMain::class, 'applyPiralSchemaQuery'))->invoke(LeftAndMain::create(), $request);
        return $request;
    }

    public function testTheFlagIsIgnoredWithTheShellOff(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', false);
        $request = $this->applied(new HTTPRequest('GET', self::SCHEMA, ['formSchema' => '1']));
        $this->assertNull($request->getHeader(FormSchema::SCHEMA_HEADER));
        $this->assertFalse($request->isAjax());
    }

    public function testTheFlagIsIgnoredOnAPost(): void
    {
        $request = $this->applied(new HTTPRequest('POST', self::SCHEMA, ['formSchema' => '1'], ['formSchema' => '1']));
        $this->assertNull($request->getHeader(FormSchema::SCHEMA_HEADER));
        $this->assertFalse($request->isAjax());
    }

    public function testTheQueryValueNeverReachesTheHeader(): void
    {
        foreach (["schema\r\nX-Evil: 1", 'state', ['schema']] as $value) {
            $request = $this->applied(new HTTPRequest('GET', self::SCHEMA, ['formSchema' => $value]));
            $this->assertSame('schema,state,errors', $request->getHeader(FormSchema::SCHEMA_HEADER));
            $this->assertNull($request->getHeader('X-Evil'));
        }
    }

    public function testAnExplicitHeaderWins(): void
    {
        $request = new HTTPRequest('GET', self::SCHEMA, ['formSchema' => '1']);
        $request->addHeader(FormSchema::SCHEMA_HEADER, 'state');
        $this->assertSame('state', $this->applied($request)->getHeader(FormSchema::SCHEMA_HEADER));
    }

    public function testTheFlagIsIgnoredOnANonSchemaGetAction(): void
    {
        foreach (['admin/security/users/EditForm/field/users/item/1/edit', 'admin/security/users/schemas', 'admin/pages/edit/show/1'] as $path) {
            $request = $this->applied(new HTTPRequest('GET', $path, ['formSchema' => '1']));
            $this->assertFalse($request->isAjax(), $path);
            $this->assertNull($request->getHeader(FormSchema::SCHEMA_HEADER), $path);
        }
    }

    public function testTheFlagIsHonouredOnEverySchemaUrlShape(): void
    {
        $paths = [
            self::SCHEMA,
            'admin/pages/edit/schema/EditForm/5',
            'admin/assets/schema/fileEditForm/7',
            'admin/security/users/EditForm/field/users/item/1/schema',
            'admin/archive/EditForm/field/Pages/item/3/view/schema',
        ];
        foreach ($paths as $path) {
            $request = $this->applied(new HTTPRequest('GET', $path, ['formSchema' => '1']));
            $this->assertTrue($request->isAjax(), $path);
            $this->assertSame('schema,state,errors', $request->getHeader(FormSchema::SCHEMA_HEADER), $path);
        }
    }

    public function testAMemberWithoutSectionAccessIsRefusedAlikeByFlagAndHeader(): void
    {
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
        $flagged = $this->get(self::SCHEMA . '?formSchema=1', null, ['Accept' => '*/*']);
        $headed = $this->get(self::SCHEMA, null, ['Accept' => 'application/json', 'X-Formschema-Request' => 'schema,state,errors', 'X-Requested-With' => 'XMLHttpRequest']);
        $this->assertGreaterThanOrEqual(400, $flagged->getStatusCode());
        $this->assertSame($headed->getStatusCode(), $flagged->getStatusCode());
        $this->assertStringNotContainsString('"schema"', $flagged->getBody());
    }

    public function testARecordTheMemberCannotViewIsRefusedAlikeByFlagAndHeader(): void
    {
        if (!class_exists(SiteTree::class)) {
            $this->markTestSkipped('silverstripe/cms is not installed');
        }
        $page = SiteTree::create(['Title' => 'Secret', 'CanViewType' => InheritedPermissions::ONLY_THESE_USERS]);
        $page->write();
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
        $url = 'admin/pages/edit/schema/EditForm/' . $page->ID;

        $flagged = $this->get($url . '?formSchema=1', null, ['Accept' => '*/*']);
        $headed = $this->get($url, null, ['Accept' => 'application/json', 'X-Formschema-Request' => 'schema,state,errors', 'X-Requested-With' => 'XMLHttpRequest']);
        $this->assertSame($headed->getStatusCode(), $flagged->getStatusCode());
        $this->assertStringNotContainsString('Secret', $flagged->getBody());
        $this->assertStringNotContainsString('Secret', $headed->getBody());
    }
}
