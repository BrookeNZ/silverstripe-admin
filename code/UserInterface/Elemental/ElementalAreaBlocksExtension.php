<?php

namespace SilverStripe\Admin\UserInterface\Elemental;

use DNADesign\Elemental\Controllers\ElementalAreaController;
use DNADesign\Elemental\Forms\ElementalAreaField;
use Psr\Log\LoggerInterface;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Core\Extension;
use SilverStripe\Forms\Form;
use Throwable;

/**
 * Sends each ElementalAreaField's blocks in its shell schema as `data.blocks`, the same list elemental's
 * `readElements/<areaId>` endpoint answers, so the elemental pilet draws the list without a second
 * round trip after the schema. The pilet still re-reads through the endpoint after every block change
 * and records-changed event.
 *
 * The list comes from ElementalAreaController::apiReadElements() itself, so its permission checks and
 * `updateApiReadElementalArea` hook apply unchanged. An area the endpoint refuses gets no `data.blocks`,
 * and the pilet reads it and shows the endpoint's error. A list that fails any other way is logged and also
 * left out, so the schema still answers and the pilet falls back to the endpoint, as legacy's separate
 * request did.
 *
 * The controller is built here without init() and off the controller stack, with a synthetic request, so
 * `Controller::curr()` and `getSession()` inside the endpoint and its hooks differ from a real request to it.
 *
 * @extends Extension<\SilverStripe\Admin\FormSchemaController>
 */
class ElementalAreaBlocksExtension extends Extension
{
    private static array $dependencies = [
        'logger' => '%$' . LoggerInterface::class,
    ];

    private ?LoggerInterface $logger = null;

    public function setLogger(LoggerInterface $logger): static
    {
        $this->logger = $logger;
        return $this;
    }

    protected function updateShellSchema(array &$schema, Form $form): void
    {
        $areaFields = [];
        foreach ($form->Fields()->flattenFields() as $field) {
            if ($field instanceof ElementalAreaField && $field->getArea()?->isInDB()) {
                $areaFields[$field->ID()] = $field;
            }
        }
        if ($areaFields && isset($schema['fields']) && is_array($schema['fields'])) {
            $schema['fields'] = $this->addBlocks($schema['fields'], $areaFields);
        }
    }

    /**
     * @param array<string, ElementalAreaField> $areaFields
     */
    private function addBlocks(array $entries, array $areaFields): array
    {
        foreach ($entries as $index => $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $field = $areaFields[$entry['id'] ?? ''] ?? null;
            $blocks = $field ? $this->readElements($field) : null;
            if ($blocks !== null) {
                $entries[$index]['data'] = array_merge((array) ($entry['data'] ?? []), ['blocks' => $blocks]);
            }
            if (isset($entry['children']) && is_array($entry['children'])) {
                $entries[$index]['children'] = $this->addBlocks($entry['children'], $areaFields);
            }
        }
        return $entries;
    }

    private function readElements(ElementalAreaField $field): ?array
    {
        $areaId = (int) $field->getArea()->ID;
        $request = new HTTPRequest('GET', "api/readElements/{$areaId}");
        $request->setRouteParams(['elementalAreaID' => $areaId]);
        $controller = ElementalAreaController::create();
        $controller->setRequest($request);
        try {
            $response = $controller->apiReadElements($request);
        } catch (HTTPResponse_Exception) {
            return null;
        } catch (Throwable $exception) {
            $this->logger?->warning(
                "The block list of elemental area {$areaId} could not be read for the form schema",
                ['exception' => $exception, 'areaId' => $areaId]
            );
            return null;
        }
        $blocks = json_decode($response->getBody(), true);
        return is_array($blocks) ? $blocks : null;
    }
}
