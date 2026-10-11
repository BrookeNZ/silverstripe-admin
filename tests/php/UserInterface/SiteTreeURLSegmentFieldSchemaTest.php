<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\CMS\Forms\SiteTreeURLSegmentField;
use SilverStripe\CMS\Model\SiteTree;
use SilverStripe\Control\Director;
use SilverStripe\Dev\FunctionalTest;

class SiteTreeURLSegmentFieldSchemaTest extends FunctionalTest
{
    use ShellResponseAssertions;

    protected static $fixture_file = 'SiteTreeURLSegmentFieldSchemaTest.yml';

    public static function setUpBeforeClass(): void
    {
        if (!class_exists(SiteTree::class)) {
            static::markTestSkipped('The URL segment field needs silverstripe/cms');
        }
        parent::setUpBeforeClass();
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpShell();
        SiteTree::config()->set('nested_urls', true);
    }

    public function testSchemaSendsThePreviewPartsAndTheSuggestUrl(): void
    {
        $this->logInWithPermission('ADMIN');
        $child = $this->objFromFixture(SiteTree::class, 'child');

        $field = $this->urlSegmentField($child);

        $this->assertContains(SiteTreeURLSegmentField::class, $field['componentCandidates']);
        $this->assertSame(Director::absoluteURL('parent/'), $field['data']['urlPrefix']);
        $this->assertSame('?stage=Stage', $field['data']['urlSuffix']);
        $this->assertSame('new-page', $field['data']['defaultUrl']);
        $this->assertSame(
            'admin/pages/edit/EditForm/' . $child->ID . '/field/URLSegment/suggest/',
            $field['data']['suggestUrl']
        );
        $this->assertStringNotContainsString(' Special', $field['data']['helpText']);
    }

    public function testParentWithChildrenWarnsThatChildLinksChange(): void
    {
        $this->logInWithPermission('ADMIN');
        $parent = $this->objFromFixture(SiteTree::class, 'parent');

        $field = $this->urlSegmentField($parent);

        $this->assertSame(Director::absoluteBaseURL(), $field['data']['urlPrefix']);
        $this->assertStringStartsWith(
            "Changing this page's link will also affect the links of all child pages.",
            $field['data']['helpText']
        );
    }

    public function testSuggestUrlAnswersAUniqueSegment(): void
    {
        $this->logInWithPermission('ADMIN');
        $child = $this->objFromFixture(SiteTree::class, 'child');
        $suggestUrl = $this->urlSegmentField($child)['data']['suggestUrl'];

        $response = $this->get(
            $suggestUrl . '?value=' . rawurlencode('Taken'),
            null,
            ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json']
        );

        $this->assertSame(['value' => 'taken-2'], $this->jsonBody($response, 200));
    }

    public function testSuggestWithoutAValueSaysWhatIsMissing(): void
    {
        $this->logInWithPermission('ADMIN');
        $child = $this->objFromFixture(SiteTree::class, 'child');
        $suggestUrl = $this->urlSegmentField($child)['data']['suggestUrl'];

        $response = $this->get($suggestUrl . '?value=', null, ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json']);

        $this->assertSame(405, $response->getStatusCode());
        $this->assertStringContainsString('Please enter a URL segment or click cancel', $response->getBody());
    }

    public function testReadonlyFieldHasNoSuggestUrl(): void
    {
        $this->logInWithPermission('CMS_ACCESS_CMSMain');
        $locked = $this->objFromFixture(SiteTree::class, 'locked');

        $field = $this->urlSegmentField($locked);

        $this->assertTrue($field['readOnly']);
        $this->assertContains(SiteTreeURLSegmentField::class, $field['componentCandidates']);
        $this->assertSame(Director::absoluteBaseURL(), $field['data']['urlPrefix']);
        $this->assertArrayNotHasKey('suggestUrl', $field['data']);
    }

    private function urlSegmentField(SiteTree $page): array
    {
        $response = $this->get(
            'admin/pages/edit/schema/EditForm/' . $page->ID,
            null,
            ['X-Requested-With' => 'XMLHttpRequest', 'X-Formschema-Request' => 'schema,state,errors']
        );
        $field = $this->findField($this->jsonBody($response, 200)['schema']['fields'], 'URLSegment');
        $this->assertNotNull($field, 'The page schema has no URLSegment field');
        return $field;
    }

    private function findField(array $fields, string $name): ?array
    {
        foreach ($fields as $field) {
            if (($field['name'] ?? null) === $name) {
                return $field;
            }
            $found = $this->findField($field['children'] ?? [], $name);
            if ($found) {
                return $found;
            }
        }
        return null;
    }
}
