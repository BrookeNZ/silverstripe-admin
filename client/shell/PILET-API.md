# Pilet API v1

What a pilet can rely on from the Silverstripe admin shell. Types reach pilets through the emulator
(`npm run build:emulator`, then install the tarball as `@silverstripe/admin-shell`); the form types come
from `src/forms/types.ts` via `extraTypes` in `package.json`.

## Versioning

The Pilet API major covers the verbs and types below, **the shared dependency set** in
`package.json` `importmap.imports` (`react`, `react-dom`, `react-router`, `react-router-dom`,
`@silverstripe/admin-patterns`, plus `tslib` from `piral-base`) and **the React major**. Pilets get
these from the shell at runtime and never bundle their own; SystemJS resolves a shared name with no
version check, so changing any of them in a breaking way (React 19, a components major) is a Pilet API
major.

## Verbs

On `PiletApi`, besides Piral's own (`registerPage`, `registerExtension`, `showNotification` from
piral-notifications, ...):

| Verb | Use |
|---|---|
| `registerSilverstripeComponent(name, Component): Disposable` | Register a component under a registry name. The latest registration of a name wins; unloading the pilet restores the previous one. Field components register here too |
| `getSilverstripeComponent(name): ComponentType` | A stable component that renders the latest registration of `name` |
| `registerExtensionComponent(name, slot, Component): Disposable` | Fill the slot `<name>.<slot>`, for example `SilverStripe\Admin\LeftAndMain` / `menu.bottom` |
| `getConfig(): Readonly<SilverstripeClientConfig>` | A deep-frozen copy of `window.ss.config` |
| `showNotification(content, options?)` | From piral-notifications |
| `setUnsavedChanges(key, dirty): Disposable` | Report unsaved changes this pilet owns; the shell confirms before navigating away. The disposer clears the key |
| `hasUnsavedChanges(): boolean` | Whether anything in the shell is dirty |
| `setSectionHeader(header): Disposable` | Show the section header above the content; see **Section header** |

No `registerFormField`: binding a field to the form is decided by the schema (`schemaType`, read-only
state, the posted set), not by the registration; holders are a component (`FieldHolder` in
`@silverstripe/admin-patterns`) that a field draws itself; and one registry namespace serves fields
and other components. A field component is typed by annotating it with `FieldComponentProps`.

## Field props contract

A registered field component receives `FieldComponentProps<V, P>`:

| Prop | |
|---|---|
| `field: FormField<P>` | The schema field merged with its state. Plain props the shared components read (`id`, `name`, `holderId`, `title`, `description`, `readOnly`, `disabled`, `source`, `children`, `maxLength`, `emptyOption`, `headingLevel`, `primary`), the FormSchema keys (`schemaType`, `component`, `componentCandidates`, `data`, `extraClass`, `attributes`, `message`), and the field's own schema-level props typed by `P` (for example `optionUrl`, `lazyLoad`) |
| `value: V` | Current value; for a react-select field the option objects FormSchema state sends |
| `onChange(value)`, `onBlur()` | Report changes; the form library stays inside the shell |
| `error?: string` | Client or server validation message for this field |
| `submitting: boolean` | True while the form posts |
| `renderFields(fields)` | Renders child fields, for groups and tab sets |

`FieldComponentProps` is `FieldProps<V, FormField<P>>`. `FieldProps` and `FieldDescriptor` belong to
`@silverstripe/admin-patterns` and know nothing about FormSchema, so its components work outside a
form too.

Exported types: `FieldComponentProps`, `FormField`, `FormFieldBase`, `FieldProps`, `FieldDescriptor`,
`ChoiceOption`, `SourceOption`, `FieldSchema`, `FieldState`, `SchemaMessage`, `SchemaData`,
`FormSchemaTree`, `FormSchemaState`, `FormSchemaResponse`.

## Component resolution

While the shell flag is on, the admin module adds `componentCandidates` to every schema field it can
match to a form field by id: from the field's class towards `FormField`, each class name followed by
the component name that class declares, stopping at the field's own component name. A component set
on the instance with `setSchemaComponent()` is the only candidate.

The shell tries, in order:

1. A field that names a component: each candidate (or `component` when there are none), first
   registered wins, and nothing else
2. A field that names no component: its own class, then the `schemaType` default (FormBuilder's
   `getComponentForDataType` map, for example `Text` to `TextField`), then its parent classes, so a
   parent class registration never outranks the type default
3. When the schema carries `fallback.html` (sent only for a field with neither component nor
   `schemaType`, which FormSchema would otherwise reject): the transitional `ServerHtmlField`
4. A visible missing-field notice naming the component; the field's value is still posted

A named but unregistered component never falls to the type default or to a parent class's component.
Examples: `SearchableMultiDropdownField` tries `SilverStripe\Forms\SearchableMultiDropdownField`, then
`SearchableDropdownField`; a project `SlugField extends TextField` tries `App\Forms\SlugField`,
`TextField`, `SilverStripe\Forms\TextField`, then `SilverStripe\Forms\FormField`.

Field components also receive `autofill(name, value)`, which sets another posted field by name (a
focus point picker writing its X and Y fields).

Known limit: schemas served by the framework's `FormRequestHandler::getSchema()` and userforms'
own `getMultipartSchema()` call bypass the admin's decorator, so they carry no candidates or fallback.

## GridField

The shell registers `SilverStripe\Forms\GridField\GridField`, so every GridField in a FormSchema form
resolves to the shell's grid. While the shell flag is on, the admin module adds a rows endpoint to the
framework's stock configs (`GridFieldConfig_Base`, `_RecordEditor`, `_RecordViewer`, `_RelationEditor`)
and sends `data.rowsUrl` in the field's schema instead of its server HTML; a grid built from a bare
`GridFieldConfig` still arrives with `fallback.html` and renders as a server HTML field.

**Endpoint.** `GET <field link>/rows` returns `{grid, columns, rows, sort, filter, pagination,
bulkActions, slots, emptyText}` (types in `src/grid/types.ts`, exported with the form types);
`pagination` is `{page, pageSize, totalCount, totalPages}`, the count and size named as in the admin
JSON API's `pageInfo`. Query
parameters: `sort=Title` or `sort=-Title` (one column), `filter[<name>]=<value>` (search context names,
`q` for the general search, a `Search__` prefix accepted), `page[number]`, `page[size]` (at most 100).
An unknown column, filter or parameter is a 400 in the CMS JSON error envelope, and GridState sent
the legacy way (`<name>[GridState]` or `gridState-<name>-<n>`) is ignored. `POST <field
link>/actions/<name>` runs a row action (only `deleterecord` and `unlinkrelation` today) with the
action's `args` as a JSON body and the CSRF token in `X-SecurityID`, and answers with the refreshed
envelope for the query string it was sent with.

**Cells.** A cell is `{value}` or `{html}`. `html` always renders as server HTML (handlers and links
removed, controls disabled). A `value` cell renders the component its column declares in
`cell.component`, looked up with `getSilverstripeComponent`; with nothing registered it renders the
value as text. The admin module declares `GridField.cell.Text` for `GridFieldDataColumns`. A pilet
adds a cell renderer by registering a name and having its PHP column provider declare it, or replaces
the default for every data column by registering `GridField.cell.Text` itself:

```tsx
api.registerSilverstripeComponent('GridField.cell.Text', ({ value }: GridCellProps) => <>{String(value ?? '')}</>);
```

A cell component receives `GridCellProps`: `value`, `row` (the whole row, with `id`, `title`, `cells`,
`actions`), `column`, and `props` from the column's declaration. Cell components do not need TanStack
Table; the grid owns the table.

**Slots.** `slots` maps a GridField fragment name (`before`, `buttons-before-left`, `header`,
`after`, ...) to entries that are `{component, props}` or `{html}`. A component entry renders the
registered component with its props plus `grid`; an unregistered one renders nothing. The admin
module declares `GridField.AddNewButton` (`label`, `url`) for `GridFieldAddNewButton`.

**PHP side.** A column provider declares cells by implementing
`SilverStripe\Admin\UserInterface\GridField\GridField_ColumnSchemaProvider`
(`getColumnCellSchema()`, `getColumnCell()`); an HTML provider declares slot components with
`GridField_SchemaProvider` (`getSlotSchema()`). Both live in admin until framework carries them; a
framework class gets them through an adapter in `GridFieldRowsEndpoint.schema_adapters`.

**URL state.** The grid keeps its state in the page URL under its field name:
`?grid[<name>][sort]=-Title&grid[<name>][filter][q]=about&grid[<name>][page]=2`. A change is a
client navigation, so the unsaved changes guard confirms it when the form is dirty.

## Shared state and events

Pilets share state through Piral's own data store and event bus, which every `PiletApi` already has
(`setData`/`getData`, `emit`/`on`/`off`); the shell adds no verb for them. Names in use:

| Name | Kind | Value |
|---|---|---|
| `silverstripe:records-changed` | event | `{recordClass: string, ids: number[]}`, emitted after a save, publish or other change to those records; a view listing them (the page tree) re-reads them |
| `silverstripe:pages:current-page-id` | data | The page the Pages section is editing, or `null`; owned by the pages pilet (`setData` keeps the first writer as owner) |

A section pilet renders a record edit form with the shell's renderer, registered as `FormSchemaForm`
(`getSilverstripeComponent('FormSchemaForm')`): props `schemaUrl`, `onSubmitted(response, action)`,
`onStateChange(state)` (the loaded state, and each state a save brings back, for a host showing a record
value such as the title in the section header), `omitFields` (names left out, for a host that shows
them itself), `renderLoadError(error)` and `trackUnsavedChanges`. The renderer does not emit the records-changed
event itself; the pilet that knows the record class emits it from `onSubmitted`.

## Section header

The shell draws one header at the top of the content area for every route (the "Section header" of
the CMS Refresh design): a back button, the page title, and the page's views on the right with the
current one underlined. It sticks to the top while the page scrolls. A page sets it with
`setSectionHeader(header)` from an effect and returns the disposer as the cleanup, so it clears on
unmount:

```ts
React.useEffect(() => piral.setSectionHeader({ title, backTo: '/pages/', backLabel: 'Back to Pages', views }), [piral, title]);
```

| Field | |
|---|---|
| `title: string` | Rendered as the page's `h1`, so a page that sets a header renders no `h1` of its own |
| `backTo?: string` | A router path; no back button without it |
| `backLabel?: string` | The back button's accessible name, "Back" when omitted |
| `views?: {key, label, to, current?}[]` | Route links in a `nav` named "<title> views", `aria-current="page"` on the current one. Views are routes; for panels inside one page use the patterns package's `Tabs` |

One header shows at a time and the latest call wins. A disposer clears the header only while its own
call is still the current one, so the outgoing page's cleanup never clears the incoming page's header.
Unloading a pilet clears a header it set. The header's height is `--shell-header-height` on `:root`; a
pilet with its own sticky content offsets it by that token.

## Patterns package

`@silverstripe/admin-patterns` (source in `client/patterns`) holds FieldHolder, the built-in field
components, the unsaved-changes dialog and the reveal-field event. Import it by name; the shell's copy is
used at runtime and its stylesheet is loaded by the shell, so pilets ship neither. Its CSS reads
`--admin-*` tokens, which a host can reassign.

## Building

- The shell and pilet builds read the `browserslist` in the fork root `package.json`; building a copy
  outside the fork tree produces different output.
- `npm install`/`npm ci` in `client/shell` installs and builds `client/patterns` first (preinstall),
  because the `piral declaration` postinstall needs its built types.
- `npm run build`, `build:emulator` and `typecheck` build `client/patterns` first. The emulator lists the
  package as a `file:` dependency with an absolute local path, so outside this checkout a pilet needs
  the package published or linked.
- The fields pilet's lock file pins the emulator tarball, which is gitignored: a fresh clone runs
  `npm run build:emulator` in `client/shell` before `npm install` in `client/pilets/fields`. The
  tarball embeds an absolute path, so its integrity differs per checkout; `npm ci` accepts the
  pinned hash anyway, and a rebuilt emulator needs `npm install -D @silverstripe/admin-shell@file:...`
  to refresh the pin.
