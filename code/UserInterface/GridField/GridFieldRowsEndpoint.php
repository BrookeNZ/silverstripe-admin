<?php

namespace SilverStripe\Admin\UserInterface\GridField;

use LogicException;
use Psr\Log\LoggerInterface;
use ReflectionMethod;
use SilverStripe\Control\Controller;
use SilverStripe\Control\Director;
use SilverStripe\Control\HTTPRequest;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Control\HTTPResponse_Exception;
use SilverStripe\Core\ClassInfo;
use SilverStripe\Core\Config\Configurable;
use SilverStripe\Core\Extensible;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Core\Validation\ValidationException;
use SilverStripe\Forms\GridField\AbstractGridFieldComponent;
use SilverStripe\Forms\GridField\GridField;
use SilverStripe\Forms\GridField\GridField_ActionMenu;
use SilverStripe\Forms\GridField\GridField_ActionMenuLink;
use SilverStripe\Forms\GridField\GridField_ColumnProvider;
use SilverStripe\Forms\GridField\GridField_HTMLProvider;
use SilverStripe\Forms\GridField\GridField_StateProvider;
use SilverStripe\Forms\GridField\GridField_URLHandler;
use SilverStripe\Forms\GridField\GridFieldAddNewButton;
use SilverStripe\Forms\GridField\GridFieldButtonRow;
use SilverStripe\Forms\GridField\GridFieldComponent;
use SilverStripe\Forms\GridField\GridFieldDataColumns;
use SilverStripe\Forms\GridField\GridFieldDeleteAction;
use SilverStripe\Forms\GridField\GridFieldEditButton;
use SilverStripe\Forms\GridField\GridFieldFilterHeader;
use SilverStripe\Forms\GridField\GridFieldPageCount;
use SilverStripe\Forms\GridField\GridFieldPaginator;
use SilverStripe\Forms\GridField\GridFieldSortableHeader;
use SilverStripe\Forms\GridField\GridFieldToolbarHeader;
use SilverStripe\Forms\GridField\GridFieldViewButton;
use SilverStripe\Forms\GridField\GridState_Component;
use SilverStripe\Model\List\SS_List;
use SilverStripe\Model\ModelData;
use SilverStripe\ORM\DataList;
use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\DataObjectSchema;
use SilverStripe\ORM\Search\SearchContextForm;
use SilverStripe\Security\SecurityToken;
use SilverStripe\Security\SudoMode\SudoModeServiceInterface;
use SplObjectStorage;
use stdClass;
use Throwable;

/**
 * Serves a GridField to the Piral shell as JSON, at `<field link>/rows` (GET) and
 * `<field link>/actions/<name>` (POST), built from the grid's existing components.
 *
 * Query parameters replace the GridState hidden field for the data concerns and are written into the
 * state of the framework components, so every GridField_DataManipulator keeps doing the work:
 * `sort=Title` or `sort=-Title` (one column) sets GridFieldSortableHeader, `filter[<name>]=<value>`
 * sets GridFieldFilterHeader's columns (names as the search context knows them, `q` for the general
 * search; a `Search__` prefix is accepted), `page[number]` and `page[size]` set GridFieldPaginator.
 * A parameter the grid has no component for, a column that cannot be sorted or an unknown filter is a 400.
 * GridState sent the legacy way (`<name>[GridState]`, `gridState-<name>-<n>`) is discarded, so these
 * parameters are the only way in.
 *
 * The body is a plain envelope: `grid`, `columns`, `rows`, `sort`, `filter`, `pagination`,
 * `bulkActions`, `slots`, `emptyText`. A cell is `{value}` when its column provider implements
 * GridField_ColumnSchemaProvider (or has an adapter in `schema_adapters`) and `{html}` otherwise. Slot
 * content is `{component, props}` from a GridField_SchemaProvider (or adapter) and `{html}` from any
 * other GridField_HTMLProvider; the components in `envelope_components` are skipped because the envelope
 * carries what they render as data. Row actions are typed: GridField_ActionMenuLink components give
 * links, GridFieldDeleteAction gives a POST action. Only those actions can be posted, because their
 * arguments come from the client rather than the session state store GridField_FormAction uses.
 * `pagination.totalCount` is the paginator's count, taken before canView() drops rows, as GridField does.
 *
 * Errors use the CMS JSON error envelope. A POST needs the form's CSRF token in `X-SecurityID` and
 * answers with the refreshed envelope for the query string it was sent with.
 */
class GridFieldRowsEndpoint extends AbstractGridFieldComponent implements GridField_URLHandler
{
    use Configurable;
    use Extensible;

    public const CSRF_HEADER = 'X-SecurityID';

    /**
     * Component class => adapter class. An adapter takes the component in its constructor, has a static
     * `adapts(GridFieldComponent): bool`, and implements GridField_ColumnSchemaProvider or
     * GridField_SchemaProvider
     */
    private static array $schema_adapters = [
        GridFieldDataColumns::class => GridFieldDataColumnsSchema::class,
        GridFieldAddNewButton::class => GridFieldAddNewButtonSchema::class,
    ];

    private static array $envelope_components = [
        GridFieldButtonRow::class,
        GridFieldToolbarHeader::class,
        GridFieldSortableHeader::class,
        GridFieldFilterHeader::class,
        GridFieldPaginator::class,
        GridFieldPageCount::class,
        GridState_Component::class,
        GridFieldRowsEndpoint::class,
    ];

    private static int $max_page_size = 100;

    private SplObjectStorage $adapters;

    public function __construct()
    {
        $this->adapters = new SplObjectStorage();
    }

    /**
     * The rows link the shell's grid reads, or null for a grid without the endpoint or one whose class
     * draws its own holder (ElementalAreaField), which keeps its server HTML until its module ports it
     */
    public static function rowsUrl(GridField $gridField): ?string
    {
        $holderClass = (new ReflectionMethod($gridField, 'FieldHolder'))->getDeclaringClass()->getName();
        if ($holderClass !== GridField::class || !$gridField->getConfig()->getComponentByType(GridFieldRowsEndpoint::class)) {
            return null;
        }
        return $gridField->Link('rows');
    }

    public function getURLHandlers($gridField)
    {
        return [
            'rows' => 'handleRows',
            'actions/$ActionName' => 'handleRowAction',
        ];
    }

    public function handleRows(GridField $gridField, HTTPRequest $request): HTTPResponse
    {
        return $this->respond(function () use ($gridField, $request) {
            if ($request->httpMethod() !== 'GET') {
                throw $this->error(405, 'Use GET to read the rows');
            }
            $this->resetState($gridField);
            $this->applyQuery($gridField, $request);
            return $this->getPayload($gridField);
        });
    }

    public function handleRowAction(GridField $gridField, HTTPRequest $request): HTTPResponse
    {
        return $this->respond(function () use ($gridField, $request) {
            if ($request->httpMethod() !== 'POST') {
                throw $this->error(405, 'Use POST to run a row action');
            }
            $this->resetState($gridField);
            $form = $gridField->getForm();
            $token = $form ? $form->getSecurityToken() : SecurityToken::inst();
            if (!$token->check($request->getHeader(static::CSRF_HEADER))) {
                throw $this->error(400, _t(
                    'SilverStripe\\Forms\\Form.CSRF_FAILED_MESSAGE',
                    'There seems to have been a technical problem. Please click the back button, refresh your browser, and try again.'
                ));
            }
            $name = strtolower((string) $request->param('ActionName'));
            if (!$this->postableAction($gridField, $name)) {
                throw $this->error(404, sprintf('This grid has no "%s" action', $name));
            }
            if ($gridField->isReadonly() || $this->sudoModeBlocks($gridField)) {
                throw $this->error(403, 'This grid is read only');
            }
            $args = json_decode((string) $request->getBody(), true);
            $recordID = is_array($args) ? ($args['RecordID'] ?? null) : null;
            if (!is_int($recordID) || $recordID < 1) {
                throw $this->error(400, 'The body must be a JSON object with a positive integer RecordID');
            }
            $record = $gridField->getList()->byID($recordID);
            if (!$record || ($record->hasMethod('canView') && !$record->canView())) {
                throw $this->error(404, 'That record is not in this grid');
            }
            $gridField->handleAlterAction($name, ['RecordID' => $recordID], []);
            $this->applyQuery($gridField, $request);
            return $this->getPayload($gridField);
        });
    }

    public function applyQuery(GridField $gridField, HTTPRequest $request): void
    {
        $this->applySort($gridField, $request->getVar('sort'));
        $this->applyFilter($gridField, $request->getVar('filter'));
        $this->applyPage($gridField, $request->getVar('page'));
    }

    /**
     * Back to the components' defaults, dropping whatever GridField::handleRequest() read from the request
     */
    public function resetState(GridField $gridField): void
    {
        $data = $gridField->getState();
        foreach (array_keys($data->toArray()) as $key) {
            unset($data->$key);
        }
        foreach ($gridField->getComponents() as $component) {
            if ($component instanceof GridField_StateProvider) {
                $component->initDefaultState($data);
            }
        }
    }

    public function getPayload(GridField $gridField): array
    {
        $readonly = $gridField->isReadonly() || $this->sudoModeBlocks($gridField);
        $columns = $gridField->getColumns();
        $handlers = $this->columnHandlers($gridField);
        $sortFields = $this->sortFields($gridField, $columns);

        $list = $gridField->getManipulatedList();
        $paginator = $gridField->getConfig()->getComponentByType(GridFieldPaginator::class);
        $totalCount = $paginator ? $paginator->getTotalItems() : $list->count();
        if ($list instanceof DataList) {
            $list->prepopulateCaches();
        }

        $rows = [];
        foreach ($list as $record) {
            if ($record->hasMethod('canView') && !$record->canView()) {
                continue;
            }
            $rows[] = $this->row($gridField, $record, $columns, $handlers, $readonly);
        }

        $payload = [
            'grid' => $this->gridSummary($gridField, $readonly),
            'columns' => $this->columnDefinitions($gridField, $columns, $handlers, $sortFields),
            'rows' => $rows,
            'sort' => $this->sortState($gridField, $sortFields),
            'filter' => $this->filterState($gridField),
            'pagination' => $paginator ? $this->pagination($gridField, $paginator, $totalCount) : null,
            'bulkActions' => [],
            'slots' => $this->slots($gridField, $readonly) ?: new stdClass(),
            'emptyText' => _t('SilverStripe\\Forms\\GridField\\GridField.NoItemsFound', 'No items found'),
        ];
        $this->extend('updateApiRows', $payload, $gridField);
        return $payload;
    }

    private function applySort(GridField $gridField, mixed $sort): void
    {
        if ($sort === null) {
            return;
        }
        if (!$gridField->getConfig()->getComponentByType(GridFieldSortableHeader::class)) {
            throw $this->error(400, 'This grid cannot be sorted');
        }
        if (!is_string($sort)) {
            throw $this->error(400, 'sort must be a column name');
        }
        $state = $gridField->getState()->GridFieldSortableHeader;
        $state->SortColumn = null;
        $state->SortDirection = 'asc';
        if ($sort === '') {
            return;
        }
        if (str_contains($sort, ',')) {
            throw $this->error(400, 'Sorting by more than one column is not supported');
        }
        $column = ltrim($sort, '-');
        $sortField = $this->sortFields($gridField, $gridField->getColumns())[$column] ?? null;
        if ($sortField === null) {
            throw $this->error(400, sprintf('Column "%s" cannot be sorted', $column));
        }
        $state->SortColumn = $sortField;
        $state->SortDirection = str_starts_with($sort, '-') ? 'desc' : 'asc';
    }

    private function applyFilter(GridField $gridField, mixed $filter): void
    {
        if ($filter === null) {
            return;
        }
        $header = $gridField->getConfig()->getComponentByType(GridFieldFilterHeader::class);
        if (!$header) {
            throw $this->error(400, 'This grid cannot be filtered');
        }
        if (!is_array($filter)) {
            throw $this->error(400, 'filter must be filter[<name>]=<value> pairs');
        }
        $allowed = array_keys($this->filterFields($gridField, $header));
        $values = [];
        foreach ($filter as $name => $value) {
            $name = preg_replace('/^Search__/', '', (string) $name);
            if (!in_array($name, $allowed, true)) {
                throw $this->error(400, sprintf('"%s" is not a filter of this grid', $name));
            }
            if (!is_string($value)) {
                throw $this->error(400, sprintf('filter[%s] must be a string', $name));
            }
            if ($value !== '') {
                $values[$name] = $value;
            }
        }
        $state = $gridField->getState()->GridFieldFilterHeader;
        $state->Columns = [];
        foreach ($values as $name => $value) {
            $state->Columns->$name = $value;
        }
    }

    private function applyPage(GridField $gridField, mixed $page): void
    {
        if ($page === null) {
            return;
        }
        $paginator = $gridField->getConfig()->getComponentByType(GridFieldPaginator::class);
        if (!$paginator) {
            throw $this->error(400, 'This grid is not paginated');
        }
        if (!is_array($page) || array_diff(array_keys($page), ['number', 'size'])) {
            throw $this->error(400, 'page takes page[number] and page[size]');
        }
        $state = $gridField->getState()->GridFieldPaginator;
        if (isset($page['size'])) {
            $size = $this->positiveInt($page['size'], 'page[size]');
            $max = static::config()->get('max_page_size');
            if ($size > $max) {
                throw $this->error(400, sprintf('page[size] can be at most %d', $max));
            }
            $paginator->setItemsPerPage($size);
            $state->itemsPerPage = $size;
        }
        if (isset($page['number'])) {
            $state->currentPage = $this->positiveInt($page['number'], 'page[number]');
        }
    }

    private function positiveInt(mixed $value, string $name): int
    {
        if (!is_string($value) || !ctype_digit($value) || (int) $value < 1) {
            throw $this->error(400, sprintf('%s must be a positive integer', $name));
        }
        return (int) $value;
    }

    private function gridSummary(GridField $gridField, bool $readonly): array
    {
        $modelClass = $this->modelClass($gridField);
        $singleton = $modelClass ? singleton($modelClass) : null;
        return [
            'name' => $gridField->getName(),
            'title' => $gridField->Title() ?: null,
            'modelClass' => $modelClass,
            'pluralName' => $singleton && $singleton->hasMethod('i18n_plural_name') ? $singleton->i18n_plural_name() : null,
            'readonly' => $readonly,
            'links' => ['self' => $gridField->Link('rows')],
        ];
    }

    /**
     * @param array<string, GridField_ColumnProvider[]> $handlers
     * @param array<string, string> $sortFields
     */
    private function columnDefinitions(GridField $gridField, array $columns, array $handlers, array $sortFields): array
    {
        $definitions = [];
        foreach ($columns as $name) {
            $content = $this->contentHandlers($handlers[$name] ?? []);
            $schema = count($content) === 1 ? $this->columnSchemaFor(reset($content)) : null;
            $title = $gridField->getColumnMetadata($name)['title'] ?? null;
            $definitions[] = [
                'name' => $name,
                'title' => $title === null ? null : (string) $title,
                'sortable' => isset($sortFields[$name]),
                'actions' => count($content) < count($handlers[$name] ?? []),
                'cell' => $schema ? $this->declaration($schema->getColumnCellSchema($gridField, $name)) : null,
            ];
        }
        return $definitions;
    }

    /**
     * @param array<string, GridField_ColumnProvider[]> $handlers
     */
    private function row(GridField $gridField, ModelData $record, array $columns, array $handlers, bool $readonly): array
    {
        $cells = [];
        foreach ($columns as $name) {
            $content = $this->contentHandlers($handlers[$name] ?? []);
            if (!$content) {
                continue;
            }
            $schema = count($content) === 1 ? $this->columnSchemaFor(reset($content)) : null;
            if ($schema) {
                $cells[$name] = $schema->getColumnCell($gridField, $record, $name);
                continue;
            }
            $html = null;
            foreach ($content as $handler) {
                $part = $handler->getColumnContent($gridField, $record, $name);
                if ($part !== null) {
                    $html .= $part;
                }
            }
            if ($html !== null) {
                $cells[$name] = ['html' => (string) $html];
            }
        }

        return [
            'id' => $record->ID,
            'title' => $record->hasMethod('getTitle') ? (string) $record->getTitle() : null,
            'cells' => $cells ?: new stdClass(),
            'actions' => $this->rowActions($gridField, $record, $readonly),
        ];
    }

    private function rowActions(GridField $gridField, ModelData $record, bool $readonly): array
    {
        $actions = [];
        foreach ($gridField->getComponents() as $component) {
            if ($component instanceof GridFieldDeleteAction) {
                $unlink = $component->getRemoveRelation();
                $permission = $unlink ? 'canEdit' : 'canDelete';
                if ($readonly || !$record->hasMethod($permission) || !$record->$permission()) {
                    continue;
                }
                $name = $unlink ? 'unlinkrelation' : 'deleterecord';
                $actions[] = [
                    'name' => $name,
                    'type' => 'action',
                    'title' => $unlink
                        ? _t(GridFieldDeleteAction::class . '.UnlinkRelation', 'Unlink')
                        : _t(GridFieldDeleteAction::class . '.Delete', 'Delete'),
                    'method' => 'POST',
                    'url' => $gridField->Link('actions/' . $name),
                    'args' => ['RecordID' => $record->ID],
                    'confirm' => $unlink
                        ? _t(__CLASS__ . '.CONFIRM_UNLINK', 'Are you sure you want to unlink this record?')
                        : _t(__CLASS__ . '.CONFIRM_DELETE', 'Are you sure you want to delete this record?'),
                ];
            } elseif ($component instanceof GridField_ActionMenuLink) {
                if (!$component->getGroup($gridField, $record, 'Actions')) {
                    continue;
                }
                $actions[] = [
                    'name' => $this->linkName($component),
                    'type' => 'link',
                    'title' => (string) $component->getTitle($gridField, $record, 'Actions'),
                    'url' => $component->getUrl($gridField, $record, 'Actions'),
                ];
            }
        }
        return $actions;
    }

    private function linkName(GridFieldComponent $component): string
    {
        return match (true) {
            $component instanceof GridFieldEditButton => 'edit',
            $component instanceof GridFieldViewButton => 'view',
            default => lcfirst(ClassInfo::shortName($component)),
        };
    }

    private function postableAction(GridField $gridField, string $name): bool
    {
        foreach ($gridField->getConfig()->getComponentsByType(GridFieldDeleteAction::class) as $component) {
            if ($name === ($component->getRemoveRelation() ? 'unlinkrelation' : 'deleterecord')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Components whose column content the envelope replaces with typed row actions
     */
    private function isRowActionComponent(GridFieldComponent $component): bool
    {
        return $component instanceof GridFieldDeleteAction
            || $component instanceof GridField_ActionMenuLink
            || $component instanceof GridField_ActionMenu;
    }

    /**
     * @param GridField_ColumnProvider[] $handlers
     * @return GridField_ColumnProvider[]
     */
    private function contentHandlers(array $handlers): array
    {
        return array_values(array_filter($handlers, fn ($handler) => !$this->isRowActionComponent($handler)));
    }

    /**
     * @return array<string, GridField_ColumnProvider[]>
     */
    private function columnHandlers(GridField $gridField): array
    {
        $handlers = [];
        foreach ($gridField->getComponents() as $component) {
            if ($component instanceof GridField_ColumnProvider) {
                foreach ($component->getColumnsHandled($gridField) as $column) {
                    $handlers[$column][] = $component;
                }
            }
        }
        return $handlers;
    }

    private function columnSchemaFor(GridFieldComponent $component): ?GridField_ColumnSchemaProvider
    {
        $schema = $this->schemaFor($component);
        return $schema instanceof GridField_ColumnSchemaProvider ? $schema : null;
    }

    private function schemaFor(GridFieldComponent $component): ?GridFieldComponent
    {
        if ($component instanceof GridField_ColumnSchemaProvider || $component instanceof GridField_SchemaProvider) {
            return $component;
        }
        if (!$this->adapters->contains($component)) {
            $adapter = null;
            foreach (static::config()->get('schema_adapters') as $class => $adapterClass) {
                if ($adapterClass && $component instanceof $class && $adapterClass::adapts($component)) {
                    $adapter = Injector::inst()->createWithArgs($adapterClass, [$component]);
                    break;
                }
            }
            $this->adapters[$component] = $adapter;
        }
        return $this->adapters[$component];
    }

    /**
     * Column name => the field GridFieldSortableHeader sorts it by, for the columns it can sort
     *
     * @return array<string, string>
     */
    private function sortFields(GridField $gridField, array $columns): array
    {
        $header = $gridField->getConfig()->getComponentByType(GridFieldSortableHeader::class);
        $list = $gridField->getList();
        if (!$header || !$list instanceof SS_List) {
            return [];
        }
        $fields = [];
        foreach ($columns as $column) {
            $title = $gridField->getColumnMetadata($column)['title'] ?? null;
            $field = ($header->getFieldSorting()[$column] ?? null) ?: $column;
            if ($title && ($list->canSortBy($field) || $this->canSortByRelation($list, $field))) {
                $fields[$column] = $field;
            }
        }
        return $fields;
    }

    /**
     * Mirrors GridFieldSortableHeader::getHTMLFragments(): a dotted column is sortable when the chain
     * ends on a database field of a has_one, never through a list
     */
    private function canSortByRelation(SS_List $list, string $field): bool
    {
        if (!str_contains($field, '.') || !method_exists($list, 'dataClass')) {
            return false;
        }
        $parts = explode('.', $field);
        $item = singleton($list->dataClass());
        foreach ($parts as $index => $part) {
            if ($item instanceof SS_List) {
                return false;
            }
            if ($item && ClassInfo::hasMethod($item, $part)) {
                $item = $item->$part();
                continue;
            }
            return $item instanceof DataObject
                && DataObject::getSchema()->fieldSpec($item, $part, DataObjectSchema::DB_ONLY)
                && $index === count($parts) - 1;
        }
        return false;
    }

    private function sortState(GridField $gridField, array $sortFields): array
    {
        $state = $gridField->getState()->GridFieldSortableHeader;
        $sortColumn = $state->SortColumn;
        if (!$sortColumn) {
            return [];
        }
        $column = array_search($sortColumn, $sortFields, true);
        return [[
            'field' => $column === false ? $sortColumn : $column,
            'direction' => $state->SortDirection === 'desc' ? 'desc' : 'asc',
        ]];
    }

    private function filterState(GridField $gridField): ?array
    {
        $header = $gridField->getConfig()->getComponentByType(GridFieldFilterHeader::class);
        if (!$header || !$header->canFilterAnyColumns($gridField)) {
            return null;
        }
        $form = $header->getSearchForm($gridField);
        $values = $gridField->getState()->GridFieldFilterHeader->Columns->toArray();
        $fields = [];
        foreach ($this->filterFields($gridField, $header) as $name => $title) {
            $fields[] = ['name' => $name, 'title' => $title];
        }
        $plural = singleton($this->modelClass($gridField))->i18n_plural_name();
        return [
            'searchField' => $form ? $form->getSearchField() : null,
            'placeholder' => $header->getPlaceHolderText()
                ?: _t(SearchContextForm::class . '.FILTERLABELTEXT', 'Search "{model}"', ['model' => $plural]),
            'values' => $values ?: new stdClass(),
            'active' => (bool) $values,
            'fields' => $fields,
        ];
    }

    /**
     * @return array<string, string> Filter name => field title
     */
    private function filterFields(GridField $gridField, GridFieldFilterHeader $header): array
    {
        $fields = [];
        foreach ($header->getSearchContext($gridField)->getSearchFields()->dataFields() as $name => $field) {
            $fields[$name] = (string) $field->Title();
        }
        return $fields;
    }

    private function pagination(GridField $gridField, GridFieldPaginator $paginator, int $totalCount): array
    {
        $pageSize = (int) $paginator->getItemsPerPage();
        return [
            'page' => (int) $gridField->getState()->GridFieldPaginator->currentPage,
            'pageSize' => $pageSize,
            'totalCount' => $totalCount,
            'totalPages' => max(1, (int) ceil($totalCount / max(1, $pageSize))),
        ];
    }

    private function slots(GridField $gridField, bool $readonly): array
    {
        $slots = [];
        foreach ($gridField->getComponents() as $component) {
            if ($this->isEnvelopeComponent($component) || ($readonly && $component instanceof GridFieldAddNewButton)) {
                continue;
            }
            $schema = $this->schemaFor($component);
            if ($schema instanceof GridField_SchemaProvider) {
                foreach ($schema->getSlotSchema($gridField) as $slot => $entries) {
                    foreach ($entries as $entry) {
                        $slots[strtolower($slot)][] = $this->declaration($entry);
                    }
                }
            } elseif ($component instanceof GridField_HTMLProvider) {
                foreach ((array) $component->getHTMLFragments($gridField) as $slot => $html) {
                    $html = trim(preg_replace(GridField::FRAGMENT_REGEX, '', (string) $html));
                    if ($html !== '') {
                        $slots[strtolower($slot)][] = ['html' => $html];
                    }
                }
            }
        }
        return $slots;
    }

    /**
     * Props always encode as a JSON object, even when empty
     */
    private function declaration(array $declaration): array
    {
        $declaration['props'] = (object) ($declaration['props'] ?? []);
        return $declaration;
    }

    private function isEnvelopeComponent(GridFieldComponent $component): bool
    {
        foreach (static::config()->get('envelope_components') as $class) {
            if ($component instanceof $class) {
                return true;
            }
        }
        return false;
    }

    private function modelClass(GridField $gridField): ?string
    {
        try {
            return $gridField->getModelClass();
        } catch (LogicException) {
            return null;
        }
    }

    /**
     * Mirrors the check in GridField::FieldHolder(), which renders such a grid read only
     */
    private function sudoModeBlocks(GridField $gridField): bool
    {
        $modelClass = $this->modelClass($gridField);
        if (!is_a($modelClass, DataObject::class, true) || !singleton($modelClass)->getRequireSudoMode()) {
            return false;
        }
        $session = Controller::curr()?->getRequest()?->getSession();
        return $session && !Injector::inst()->get(SudoModeServiceInterface::class)->check($session);
    }

    private function respond(callable $build): HTTPResponse
    {
        try {
            return $this->json(200, $build());
        } catch (HTTPResponse_Exception $exception) {
            return $this->asJsonError($exception->getResponse());
        } catch (ValidationException $exception) {
            return $this->jsonError(403, $exception->getMessage());
        } catch (Throwable $exception) {
            Injector::inst()->get(LoggerInterface::class)->error($exception->getMessage(), ['exception' => $exception]);
            return $this->jsonError(500, Director::isDev() ? $exception->getMessage() : 'The grid could not be loaded');
        }
    }

    private function error(int $code, string $message): HTTPResponse_Exception
    {
        return new HTTPResponse_Exception($this->jsonError($code, $message));
    }

    private function asJsonError(HTTPResponse $response): HTTPResponse
    {
        if (str_contains((string) $response->getHeader('Content-Type'), 'application/json')) {
            return $response;
        }
        $message = trim(strip_tags((string) $response->getBody()));
        return $this->jsonError($response->getStatusCode(), $message ?: (string) $response->getStatusDescription());
    }

    /**
     * The envelope AdminController::jsonError() sends, built here because a GridField component is no controller
     */
    private function jsonError(int $code, string $message): HTTPResponse
    {
        return $this->json($code, [
            'status' => 'error',
            'errors' => [['type' => 'error', 'code' => $code, 'value' => $message]],
        ]);
    }

    private function json(int $code, array $data): HTTPResponse
    {
        $body = json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        return HTTPResponse::create($body, $code)
            ->addHeader('Content-Type', 'application/json')
            ->addHeader('Cache-Control', 'no-store');
    }
}
