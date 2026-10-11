# Pilet API v1

What a pilet can rely on from the Silverstripe admin shell. Types reach pilets through the emulator
(`npm run build:emulator`, then install the tarball as `@silverstripe/admin-shell`); the form types come
from `src/forms/types.ts` and `ServerRequestError` from `src/state/errorTypes.ts`, both via `extraTypes`
in `package.json`. Import the package for types only (`import type`): it carries no runtime code, so a
value imported from it is undefined at runtime. Values come from the Pilet API, such as
`api.recordsChangedEvent`.

## Versioning

The Pilet API major covers the verbs and types below, **the shared dependency set** in
`package.json` `importmap.imports` (`react`, `react-dom`, `react-router`, `react-router-dom`,
`@silverstripe/admin-patterns`, plus `tslib` from `piral-base`) and **the React major**, which is
React 19. Pilets get these from the shell at runtime and never bundle their own; SystemJS resolves a
shared name with no version check, so changing any of them in a breaking way (a React major, a patterns
major) is a Pilet API major. A pilet builds and tests against the same React major as the shell.

## Changes

The emulator is `@silverstripe/admin-shell` 1.0.0 throughout the proof of concept; the version is bumped when the
API is first released. Until then this list is the changelog. A pilet picks up a rebuilt emulator with
`npm install ../../shell/dist/emulator/silverstripe-admin-shell-1.0.0.tgz` in its own directory (a
same-version tarball is reinstalled because its integrity changes); every pilet was reinstalled on
2026-10-08 and typechecks clean, so a pilet no longer needs a local copy of shell types.

- 2026-10-05 and 06: `registerPage`, `registerSilverstripeComponent`, `getSilverstripeComponent`,
  `registerExtensionComponent`, `getConfig`, `showNotification`; the field props contract; component
  resolution by `componentCandidates`; `setUnsavedChanges` and `hasUnsavedChanges`; `setSectionHeader`
  (back button, title and views).
- 2026-10-07: section header `crumbs`, then `preview`, `badge` and `sidebar`; `registerSectionIcon`;
  `registerMenuItem`; GridField row actions and column contract; `registerBeforeSubmit` (since removed);
  the static `fullWidth` flag on a field component, and the `fullWidth` getter on the component
  `getSilverstripeComponent` returns, which reports the current registration's flag (see **Form layout**).
- 2026-10-08: `registerSectionSidebar`; shared state (`useSharedState`, `subscribeSharedState`,
  `setCurrentRecord`, `recordsChangedEvent`); server cache (`useServerQuery` with `records`,
  `useServerMutation`, `invalidateRecords`, `fetchJson`; invalidation by class ancestry from
  `config.recordClasses`); hooks (`registerHook`, `runUpdateHook`, `runBeforeHook`, `runAfterHook`, the
  `HookPoints` augmentation, hook points `updateFormSchema`, `updateFormValues`, `updateFieldProps`,
  `updateFormValidation`, `onBeforeFormAction`, `onBeforeFormSubmit`, `onAfterFormSubmit`,
  `updateGridColumns`, plus elemental's `updateBlockActions` and history's `onAfterRevert`).
  **Removed:** `registerBeforeSubmit`, replaced by `registerHook('onBeforeFormSubmit', …)` with no alias.
- 2026-10-08: **Breaking:** the shared React is now 19.x (was 18.3). This is a Pilet API major by the
  rule above, and with the `registerBeforeSubmit` removal one of the two breaking changes while the proof of concept
  stays at 1.0.0. A pilet moves `react`,
  `react-dom`, `@types/react` and `@types/react-dom` to 19, reinstalls the emulator, and fixes what the 19
  types flag (a `useRef<T>(null)` ref is `RefObject<T | null>`, so a parameter typed
  `RefObject<HTMLElement>` widens to accept it). `@silverstripe/admin-patterns` accepts `^18 || ^19`.
- 2026-10-09: `routerPath`; `ServerRequestError` gains `reason` and `field`.
- 2026-10-09: `registerSilverstripeComponent` and `getSilverstripeComponent` are typed by name through
  the augmentable `SilverstripeComponents` interface (see **Typed components**); a name it lists takes
  only a component with its props, and `getSilverstripeComponent` returns a component with them. The
  built-in field components in `@silverstripe/admin-patterns` are generic over the field descriptor, so
  they take `FieldComponentProps` without a cast, and `FieldProps['renderFields']` takes a read-only array.
  **Breaking (types):** for a name `SilverstripeComponents` does not list, `getSilverstripeComponent`
  returns a component taking `Record<string, unknown>` (was `any`), so a caller passing typed props to it
  names them by augmenting the interface; `SilverstripeComponent`'s props parameter defaults to `object`
  (was `any`); `registerExtensionComponent` takes Piral's `AnyExtensionComponent` rather than `any`.
  `useServerQuery` takes `initialData` and `initialDataUpdatedAt`, and its `refetch()` resolves to the fetched data (`Promise<T | undefined>`,
  was `Promise<void>`).
- 2026-10-09: toasts are the patterns package's `Toast` (exported for pilets, with `ToastProps` and
  `ToastType`). `showNotification` keeps its shape and options; its defaults now follow legacy: a toast
  closes after 6 seconds (was 8), and a `warning` stays until dismissed unless `autoClose` is passed, as an
  `error` always does. An `error` is announced assertively. See **Notifications**.
  `@silverstripe/admin-patterns` requires React `^19` (was `^18 || ^19`); `Button`, `Link` and `Stack`
  take `ref` as a prop rather than through `forwardRef`, with the same element types.
- 2026-10-09: built-in fields `ListboxField`, `DateField`, `LookupField`, `LabelField` and
  `ProportionConstraintField`, registered and listed in `SilverstripeComponents` under their legacy
  FormSchema names, so a pilet registering one of those names replaces the shell's.
- 2026-10-09: built-in field `HtmlReadonlyField`, registered and listed in `SilverstripeComponents`
  under its legacy FormSchema name.
- 2026-10-09: `ServerRequestError` (and `ServerRequestErrorShape`) are exported types, and
  `ServerQueryResult.error` and `ServerMutationResult.error` are typed with them; a pilet recognises one by
  `error.name === 'ServerRequestError'`. **Breaking:** a pilet's `useServerQuery` keys are stored under the
  pilet's name, so pilets no longer share an entry by accident; `shared:<scope>` keys are shared on
  purpose, and a pilet key in a reserved scope (`schema`, `grid`, `blocks`) throws in development (the
  elemental pilet moved to `['shared:blocks', areaId]`). **Breaking:** `sessionExpired` is set only for a
  redirect to the login form; another followed redirect is an ordinary `ServerRequestError`.
  **Breaking:** `fetchJson` sends `X-SecurityID` only to the page's own origin, and reads it from
  `window.ss.config` at request time. A malformed records-changed event is dropped with a warning, and
  numeric-string ids are read as numbers; a throwing `records` or `changes` option is logged; an
  `AbortError` while reading the body passes through; only a request that got no answer, or a 5xx, is
  retried. **Breaking:** hooks: an `updateX` handler returning `undefined` is a logged failure; the
  context is deep-frozen in development as the value is; a cycle leaves only its own handlers unordered;
  counter ids are `#<n>`; a handler running its own update or after hook is not run again; hook names in
  the run verbs and `HookHandler` must be `update`, `onBefore` or `onAfter` then a capital; a pilet named
  `shell` is refused.
- 2026-10-09: `DataTable`, a data-driven list table registered under that name and listed in
  `SilverstripeComponents` (see **Data table**), with its types `DataTableProps`, `DataTableColumn`,
  `DataTableRow`, `DataTableSort`, `DataTableSortDirection` and `DataTableSelection`.
- 2026-10-09: `openPanel`, `closePanel` and `usePanel`, the details panel beside the section's content, with
  the types `PanelOptions` and `OpenPanel` (see **Details panel**). The shell no longer registers
  `/assets/edit/:id`: the files pilet owns it, as a redirect to the file in its folder's details panel.
- 2026-10-09: `FormSchemaForm` takes `onMessage(message)`, which receives each good message a post
  returns instead of the form drawing it inline. The form's own messages draw as the patterns package's
  `Alert` (exported for pilets, with `AlertProps` and `AlertType`).
- 2026-10-11: **Breaking:** Escape no longer closes the details panel, and `onClose` is only the close
  button. A form schema sent to the shell names its record class (`FormSchemaTree.recordClass`), and a save
  whose record names no class announces under it. `DataTable` row keys work only from a link, button or
  checkbox in a cell. Toasts that arrive together are read one after another.
- 2026-10-11: named modals from piral-modals: `registerModal`, `showModal`, `unregisterModal`, with the
  shell drawing each one in the patterns package's `Dialog`; `useModalFrame` for content that sets the
  frame's header, footer or alert; `SchemaFormDialog` takes `modal` to draw into that frame (see
  **Modals**). The HTML editor's link dialog is the first, `InsertLinkModal`.
- 2026-10-11: `SchemaFormDialog` takes `omitFields`, as FormSchemaForm does.
- 2026-10-11: `useFormFieldValue(name)`, for a field component that reads another field of its form (see
  **Reading another field**).
- 2026-10-12: the shared classes a pilet may write into its own markup are part of the API (see
  **Shared classes**): `admin-field__control`, `admin-field__check`, `admin-field__description`,
  `admin-icon`, `shell-page` and `shell-form` join `admin-visually-hidden`, `admin-error-text`,
  `admin-badge` and `shell-page__inset`, with the tokens each lists. Renaming or removing one is breaking.
- 2026-10-12: pilet stylesheets sit in `@layer pilets` and select only their own prefix (see **Pilet CSS**).
  An unlayered pilet stylesheet still applies, but beats the package and shell on every tie.

## Verbs

On `PiletApi`, besides Piral's own (`registerPage`, `registerExtension`, `showNotification` from
piral-notifications, ...):

| Verb | Use |
|---|---|
| `registerSilverstripeComponent(name, Component): Disposable` | Register a component under a registry name. The latest registration of a name wins; unloading the pilet restores the previous one. Field components register here too. Typed by name; see **Typed components** |
| `getSilverstripeComponent(name): ComponentType<props>` | A stable component that renders the latest registration of `name`, with the props `SilverstripeComponents` lists for it |
| `registerExtensionComponent(name, slot, Component): Disposable` | Fill the slot `<name>.<slot>`. `SilverStripe\Admin\LeftAndMain` / `menu.bottom` is legacy; use `registerMenuItem` |
| `getConfig(): Readonly<SilverstripeClientConfig>` | A deep-frozen copy of `window.ss.config`, taken once at first use, so a later change to `window.ss.config` does not show in it. `fetchJson` reads `SecurityID` live instead |
| `showNotification(content, options?)` | From piral-notifications; see **Notifications** for the options and how a toast closes |
| `setUnsavedChanges(key, dirty): Disposable` | Report unsaved changes this pilet owns; the shell confirms before navigating away. The disposer clears the key |
| `hasUnsavedChanges(): boolean` | Whether anything in the shell is dirty |
| `setSectionHeader(header): Disposable` | Show the section header above the content; see **Section header** |
| `registerHook(name, handler, options?): Disposable` | Add a handler to a hook point (`updateX`, `onBeforeX`, `onAfterX`); see **Hooks** |
| `runUpdateHook(name, value, context)`, `runBeforeHook(name, context): Promise<boolean>`, `runAfterHook(name, context)` | Run a hook point the pilet owns; see **Running a hook** |
| `registerSectionIcon(sectionCode, Icon): Disposable` | Draw `Icon` beside a section's menu item; see **Section icons** |
| `registerSectionSidebar(sectionCode, Sidebar): Disposable` | Fill the sidebar column a header's `sidebar` asks for; see **Section header** |
| `registerMenuItem({ code, label, to, Icon? }): Disposable` | Add a menu link the shell draws like a section's; see **Menu items** |
| `useSharedState(selector): T` | Read shared state in a component; see **Shared state and events** |
| `subscribeSharedState(selector, listener): Disposable` | Hear changes to shared state outside React; see **Shared state and events** |
| `setCurrentRecord({recordClass, id}): Disposable` | Name the record the showing page edits; see **Shared state and events** |
| `recordsChangedEvent` | The records-changed event's name, for `emit`/`on`/`off`; see **Shared state and events** |
| `useServerQuery(key, fetcher, options?): ServerQueryResult<T>` | Read and cache server data under a key; `initialData` seeds the first result, `initialDataUpdatedAt` dates it, and `refetch()` resolves to the fetched data; see **Server cache** |
| `useServerMutation(mutation, options?): ServerMutationResult<V, R>` | Run a write and announce the records it changed; see **Server cache** |
| `invalidateRecords(recordClass, ids): void` | Emit records-changed, which refetches every cached read of those records; see **Server cache** |
| `fetchJson(url, init?): Promise<T>` | The shell's fetch for admin JSON endpoints, with the session and CSRF handling; see **Server cache** |
| `routerPath(url): string \| null` | The shell router's path for a server link under the admin URL (`admin/pages/edit/show/7` becomes `/pages/edit/show/7`), keeping its query and hash; the bare admin URL gives `/`. Null for another origin or a link outside the admin, which needs a page load |
| `openPanel({ id, title, badge?, meta?, content, footer?, onClose, closeLabel?, returnFocus? }): Disposable` | Show the details panel beside the section's content until the disposer runs; see **Details panel** |
| `closePanel(id): void` | Close this pilet's panel `id` if it is showing, without calling its `onClose` |
| `usePanel(): { id, title, owner } \| null` | The panel showing, for a page that marks the item it shows |
| `registerModal(name, Component, defaults?, layout?): Disposable` | From piral-modals: register a modal any pilet can open by name. `layout` takes `header` and `focusHeading`; see **Modals** |
| `showModal(name, options?): () => void` | From piral-modals: open a registered modal by name, from any pilet; returns a function that closes it |
| `unregisterModal(name)` | From piral-modals: remove this pilet's modal `name`; unloading the pilet removes its modals |
| `useFormFieldValue(name): unknown` | In a field component: another posted field's current value in the same form, by its posted name, re-rendering as it changes; see **Reading another field** |
| `useModalFrame({ header?, footer?, alert? }): boolean` | In a modal's content: set the frame's header, footer and alert on every render. False outside a named modal; see **Modals** |

No `registerFormField`: binding a field to the form is decided by the schema (`schemaType`, read-only
state, the posted set), not by the registration; holders are a component (`FieldHolder` in
`@silverstripe/admin-patterns`) that a field draws itself; and one registry namespace serves fields
and other components. A field component is typed by annotating it with `FieldComponentProps`.

### Typed components

`SilverstripeComponents` maps each registry name to the props its component takes: `FormSchemaForm`,
`SchemaFormDialog`, the built-in fields (`FieldComponentProps`) and the grid's components. A listed name
only accepts a component taking those props, and `getSilverstripeComponent` returns one that requires
them. A name not listed takes any component and returns one taking `Record<string, unknown>`. A pilet whose component
other pilets read lists it by augmenting the interface, as with `HookPoints`:

```ts
declare module '@silverstripe/admin-shell' {
  interface SilverstripeComponents {
    'SilverStripe\\VersionedAdmin\\Forms\\HistoryViewerField': HistoryViewerProps;
  }
}

piral.registerSilverstripeComponent('SilverStripe\\VersionedAdmin\\Forms\\HistoryViewerField', HistoryViewer);
const Form = piral.getSilverstripeComponent('FormSchemaForm'); // ComponentType<FormSchemaFormProps>
```

## Field props contract

A registered field component receives `FieldComponentProps<V, P>`:

| Prop | |
|---|---|
| `field: FormField<P>` | The schema field merged with its state. Plain props the shared components read (`id`, `name`, `holderId`, `title`, `description`, `readOnly`, `disabled`, `source`, `children`, `maxLength`, `emptyOption`, `headingLevel`, `primary`), the FormSchema keys (`schemaType`, `component`, `componentCandidates`, `data`, `extraClass`, `attributes`, `message`), and the field's own schema-level props typed by `P` (for example `optionUrl`, `lazyLoad`) |
| `value: V` | Current value; for a select field, the option objects FormSchema state sends |
| `onChange(value)`, `onBlur()` | Report changes; the form library stays inside the shell |
| `error?: string` | Client or server validation message for this field |
| `submitting: boolean` | True while the form posts |
| `renderFields(fields)` | Renders child fields, for groups and tab sets |

`FieldComponentProps` is `FieldProps<V, FormField<P>>`. `FieldProps` and `FieldDescriptor` belong to
`@silverstripe/admin-patterns` and know nothing about FormSchema, so its components work outside a
form too.

Exported types: `FieldComponentProps`, `FormField`, `FormFieldBase`, `FieldProps`, `FieldDescriptor`,
`ChoiceOption`, `SourceOption`, `FieldSchema`, `FieldState`, `SchemaMessage`, `SchemaData`,
`FormSchemaTree`, `FormSchemaState`, `FormSchemaResponse`, `SchemaFormDialogProps`.

### Reading another field

A field that reacts to a sibling (a page Title keeping the URL segment in step) reads it with
`useFormFieldValue(name)`, a hook for the field's component, not the pilet's setup. `name` is the posted
name (`Title`, `Content[0]`); the value is what the form holds now, typed or loaded, and the component
re-renders when it changes. It reads the FormSchemaForm the component is rendered in; outside one, or for
a name that form does not post (a literal, a group, a field another hook removed), it is `undefined`.
Unmounting the component ends the watch. To write the sibling, use the `autofill(name, value)` prop.

```tsx
const UrlPreview = ({ field }: FieldComponentProps) => {
  const segment = piral.useFormFieldValue('URLSegment');
  return <FieldHolder field={field}>{String(segment ?? '')}</FieldHolder>;
};
```

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

A field that resolves to one of its ancestors' components still renders, but the shell treats it as a
downgrade: it warns in the console once per field class per page load (`SiteTreeURLSegmentField has no
registered component of its own, so it renders as its ancestor's TextField ...`) and lists each pair in
`fieldDowngrades()` (`src/forms/downgrades.ts`, shell only). The declared component, the field's own class,
a type default named after that class (`TextField` for `TextField`), a type default no ancestor is named
after (`NumberField` for `NumericField`) and `ServerHtmlField` never count.

Field components also receive `autofill(name, value)`, which sets another posted field by name (a
focus point picker writing its X and Y fields), and `formId`, the id of the form element they are in.

Known limit: schemas served by the framework's `FormRequestHandler::getSchema()` and userforms'
own `getMultipartSchema()` call bypass the admin's decorator, so they carry no candidates or fallback.

## Form layout

A form has no inset of its own. Each top-level field and form message renders in a wrapper,
`shell-form__field`, that pads it by `--shell-form-inset` (the admin's 16px gap), so the action bar and
any full-width field touch the sides of the content column. A field nested inside another (a tab's
children, a composite's children) is inside its parent's wrapper and gets no second inset, and a headless
form (a block's form inside the page form, a form in a dialog) carries `shell-form--nested`, which sets
the inset to 0.

A field component that should run edge to edge, as the shell's GridField does, sets a static
`fullWidth` flag before registering:

```tsx
const ReportTable = (props: FieldComponentProps) => <table>…</table>;
ReportTable.fullWidth = true;
api.registerSilverstripeComponent('App\\Forms\\ReportTableField', ReportTable);
```

The component `getSilverstripeComponent` returns carries the current registration's `fullWidth`, so a
pilet decorating the GridField copies it (`Decorated.fullWidth = Grid.fullWidth`) and stays full width.
The flag belongs to the registration, so a pilet that replaces a component decides afresh: replacing
the GridField with a component without the flag gives the field back its inset. The wrapper is
`shell-form__field shell-form__field--full`, and only top-level fields are affected; a full-width field
inside a tab set stays inside the tab set's inset. Content a pilet renders around a form (a breadcrumb,
a notice) supplies its own 16px inline padding.

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

**Record edit form.** A GridField item URL keeps its legacy shape,
`<section>[/<model tab>]/EditForm/field/<grid>/item/<id|new>[/edit|/view]`, so `CMSEditLink()` and stored
links open in the shell; the shell renders it under the section with the record's title in the header and
a back button to the grid. Row links, a click on a row and the "Add new" button navigate there inside the
router. The form comes from `GET <item link>/schema` (the FormSchema envelope plus `record`: `id`,
`className`, `title`, `singularName`, `link`), and a submission is the usual POST to the form's action with
`X-Formschema-Request`, answered with the state and errors on a validation failure or with `record`,
`deleted`, `message` and the reloaded `state` on success (201 and `Location` for a new record).

**URL state.** The grid keeps its state in the page URL under its field name:
`?grid[<name>][sort]=-Title&grid[<name>][filter][q]=about&grid[<name>][page]=2`. A change is a
client navigation, so the unsaved changes guard confirms it when the form is dirty.

## Data table

The shell registers `DataTable` (Figma "List header" 2:6388 and "File list item" 2:6533), so a pilet draws a
list the way the Files section does without bundling a table of its own. Get it with
`getSilverstripeComponent('DataTable')`, which returns it typed with `DataTableProps`:

- `caption` names the table (visually hidden); `columns` are `{name, title, sortable?, firstDirection?, rowHeader?,
  align?, hideWhenNarrow?, className?}`; `rows` are `{id, label, cells}` with each cell already rendered, keyed
  by column name. The `rowHeader` column is each row's `th`, so it should carry the row's link or button.
- Sorting is the caller's: `sort` is `{column, direction}` and `onSort` receives the sort a header press asks
  for (the other direction on the sorted column, else the column's `firstDirection`, `asc` by default).
- `selection` adds a checkbox column at the end named "Select <label>"; without `onToggle` the boxes are
  disabled. `onOpenRow(id)` runs on a click in a row outside its controls. Arrow up and down, Home and End move
  focus between rows, to the control in the same position, when pressed on a link, button or checkbox in a
  cell; a text field, a select, an open menu or a control that called `preventDefault()` keeps them. `hideWhenNarrow` columns drop below 768px.
- `currentRowId` marks the row open elsewhere (the Files section's details panel) with `aria-current="true"`
  and the design's Active fill, which stays under the pointer.
- Its CSS reads `--admin-data-table-*` tokens declared on `.admin-data-table`; `className` is added to the
  table, and a column's `className` to its header and cells (for a width under the fixed layout).

GridField's grid renders through it too, with its own row height and inset defaults.

## Shared state and events

The shell holds the admin's shared state in Piral global state and gives pilets a read-only view of it.
Pilets never import piral-core, Redux or zustand; they read through two verbs and write through named
ones, so every value has an owner and unloading a pilet clears what it set.

- `useSharedState(selector)` is a React hook: it returns `selector(state)` and re-renders when that
  value changes, compared with `Object.is`. The selector may be inline. Return a part of the state
  (`(state) => state.currentRecord`) or a primitive; a selector that builds a new object or array
  re-renders on every shared state change.
- `subscribeSharedState(selector, listener)` calls `listener(value, previous)` each time the selected
  value changes, and not when subscribing. The disposer unsubscribes, and so does unloading the pilet.

The view (`SharedState`) is frozen:

| Key | Value | Written by |
|---|---|---|
| `config` | The deep-frozen config `getConfig` returns | Nothing; copied once at first use |
| `toasts` | `{id, options}[]`, the open toasts oldest first | `showNotification` and dismissing |
| `unsavedChanges` | `boolean`, whether anything has reported unsaved changes | `setUnsavedChanges` |
| `viewMode` | `'edit' \| 'split' \| 'preview'`, the preview mode the viewer chose and kept in their browser; a viewport under 1024px still draws edit | The shell's mode menu |
| `header` | The section header drawn, or `null` | `setSectionHeader` |
| `currentRecord` | `{recordClass, id}` of the record the showing page edits, or `null` | `setCurrentRecord` |

`setCurrentRecord(record)` keeps the record until its disposer runs; set it from the page and dispose on
unmount. Records stack like headers: the latest set wins, and disposing it restores the one below.

Records-changed is the one event the shell defines. Its name is `api.recordsChangedEvent`
(`silverstripe:records-changed`); the shell package publishes types only, so a pilet reads the name from
the API rather than importing or repeating it. Its value is `RecordsChangedEvent`,
`{recordClass: string, ids: number[]}`, emitted with `emit` after a save, publish or other change to
those records; a view listing them (the page tree, the grid, the block list) re-reads them on `on`. The
ids must be numbers (a numeric string such as `'7'` is read as `7`), and `ids: []` names every record of
the class, so it invalidates every cached key of the class. Any pilet can emit the event, so the shell
checks it before acting: one without a `recordClass` string, without an `ids` array, or with an id that
is not a number is dropped with a console warning, and other listeners still receive it as sent.

Piral's own data store (`setData`/`getData`) still carries `silverstripe:pages:current-page-id`, the page
the Pages section is editing or `null`, owned by the pages pilet. It is superseded by `currentRecord` and
goes once the Pages section sets that instead.

A section pilet renders a record edit form with the shell's renderer, registered as `FormSchemaForm`
(`getSilverstripeComponent('FormSchemaForm')`): props `schemaUrl`, `onSubmitted(response, action)`,
`onStateChange(state)` (the loaded state, and each state a save brings back, for a host showing a record
value such as the title in the section header), `omitFields` (names left out, for a host that shows
them itself), `renderLoadError(error)` (without it, an ended session shows a "log in again" link back to the
current page and any other failure names itself), `trackUnsavedChanges`, `onLoad(response)` (the loaded response, for a
host reading what the endpoint sends beside the form), `confirmAction(action)` (asked before an action is
submitted; `false`, or a promise of it, cancels) and `previewControls` (controls for what the preview shows,
such as the draft and published toggle, drawn before Share only in split and preview modes and with the
group at the foot of the preview pane in preview mode; edit mode leaves them out). For a form inside another form (a block's form inside the
page form) `headless` renders the fields with no form element and no action bar, so forms never nest;
Enter in one of its inputs posts it when dirty instead of submitting the outer form. Such a host takes
`handleRef`, which receives `{submit(action?), isDirty()}` (`FormSchemaFormHandle`; `submit` resolves
`{ok, response?, message?}` and never throws), `onDirtyChange(dirty)` and `onActionsChange(actions)` (the
form's actions as one row of buttons, groups and tab sets flattened, primary by the action bar's rule) and
`onSubmittingChange(action | null)` (the action posting, from a button or Enter, then null). The renderer does not emit the records-changed
event itself; the pilet that knows the record class emits it from `onSubmitted`. The shell's grid re-reads
its rows on every records-changed event.

A form in a dialog is the shell's `SchemaFormDialog` (`getSilverstripeComponent('SchemaFormDialog')`,
props `SchemaFormDialogProps`: `open`, `header`, `intro` (controls above the form, such as the HTML editor's choice of link kind), `schemaUrl`, `omitFields` (as on FormSchemaForm), `onClose()`, `onSubmitted(response, action)`):
the shared Dialog with the form headless in its body and Cancel, then the form's actions, in its footer.
Each action button posts its own action and shows `loading` while it runs; errors show in the body.
`onClose` is Cancel and Escape, and the host closes the dialog from `onSubmitted` as well.

Form-level messages (errors no field claims, warnings, the state's messages) draw above the fields as
`Alert`s. A host that passes `onMessage(message)` receives each good message (`good` or `success`) a post
returns instead, to show as a toast (`showNotification(message.value, { type: 'success' })`), as legacy
toasted a save's "Saved."; messages that arrive with the schema stay in the form. Without it, as in a
dialog or a headless form, good messages stay inline. The shell's own section forms pass it.

### Server cache

Server reads are cached by the shell in one TanStack Query client. Pilets never import the library; they
use four verbs, and a records-changed event is what clears the cache, so emitters stay as they are.

- `fetchJson<T>(url, init?)` requests an admin JSON endpoint: `Accept: application/json` and
  `X-Requested-With` on every request, and `X-SecurityID` on anything but a GET when the URL is on the
  page's own origin (never to another origin). The token is read from `window.ss.config.SecurityID` at
  request time, not from the `getConfig` snapshot; the shell has no re-login event yet, so a page that
  replaces the token writes it there. Credentials are same-origin. `init` takes `method`, `query` (added
  to the query string), `body` (sent as JSON; `URLSearchParams` and `FormData` are sent as they are),
  `headers` and `signal`. It resolves to the parsed body, or `null` for an empty one. An abort, including
  one while the body is read, rejects with the `AbortError` itself. Otherwise it rejects with a
  `ServerRequestError` (an exported type; pilets have no class to `instanceof`, so they check
  `error.name === 'ServerRequestError'`): `message` (what the server said, or a generic one), `status`,
  `serverMessage` (the CMS envelope's errors joined, or the first line of a dev-mode plain-text error;
  `null` when the server said nothing worth showing), `reason` and `field` (the envelope's first error's,
  when it names them) and `sessionExpired`, set for a 401, a 403 with `X-Reauthenticate`, and a followed
  redirect that lands under the login form's path (`Security/login` under the config's `baseUrl`, or the
  config's `loginUrl` when it sends one), whose message asks the viewer to reload and log in. Any other
  followed redirect rejects as a `ServerRequestError` with the final response's status and
  `sessionExpired` false. A success whose body is not JSON (an HTML page) rejects too, and so does a 200
  that redirects by `X-ControllerURL` (a section the member cannot view), as a 403. A request that got
  no answer rejects with the browser's own `TypeError`.
- `useServerQuery<T>(key, fetcher, options?)` is a React hook. `fetcher({signal, request})` loads the data,
  `request` being `fetchJson`; the same key on screen twice fetches once. Options: `enabled` (false holds the
  read back), `staleTime` in milliseconds (0 by default, so a remount refetches behind the cached data) and
  `keepPrevious` (keep the last key's data on screen while the next key loads), `initialData` (the first
  result, with no loading state; with the default `staleTime` the cache still refetches behind it),
  `initialDataUpdatedAt` (when that data was fetched, in epoch milliseconds, so `staleTime` counts from then
  rather than from the mount) and `records(data)`, which
  returns the ids of the key's class that the result shows (the rows of a listing), so an event naming any
  of them refetches the listing even when the key itself names none. It returns
  `{status: 'pending' | 'error' | 'success', data, error, isFetching, refetch()}`, where `refetch()` resolves to the
  data once the fetch settles (a failed fetch leaves the previous data, if any). `error` is a
  `ServerRequestError`, or whatever else the fetcher threw. A read is retried once only when `fetch` got
  no answer (its `TypeError`) or the server answered 5xx; a 4xx, an ended session or an error the fetcher
  throws itself (a `TypeError` while parsing included) is not. Window focus does not refetch.
- `useServerMutation<V, R>(mutation, options?)` is a React hook for a write: `mutation(variables, request)`.
  It returns `{mutate(variables), status: 'idle' | 'pending' | 'error' | 'success', error, reset()}`;
  `mutate` resolves with the result or rejects with the error. On success, `options.changes(variables,
  result)` names the records changed (one `RecordsChangedEvent`, a list, or `null`), and each is emitted
  as records-changed. A `changes` that throws is logged and announces nothing; the write has happened, so
  `mutate` still resolves with its result and `status` is `success`.
- `invalidateRecords(recordClass, ids)` emits records-changed for those records.

Keys are arrays, `[scope, ...parts]` with parts that are strings, numbers, booleans or `null`. A
pilet's key is its own: the shell stores it as `['pilet:<pilet name>', ...key]`, so two pilets (or a
pilet and the shell) using the same key read separate entries with their own fetchers. A key whose scope
starts `shared:` is stored as written and shared by every pilet that reads it, for data pilets share on
purpose; it matches events as the scope after the prefix (`['shared:Page', 7]` as `['Page', 7]`), and
the reader that fetches is whichever one the cache holds, so sharing readers fetch the same data. The
scopes `schema`, `grid` and `blocks` are reserved to the shell: a pilet key starting with one throws in
development builds and, in production, warns and is stored under the pilet's name like any other. A
pilet that wants one of their every-change matching uses `shared:<scope>`.

The shell listens to records-changed and invalidates the keys an event matches, matching on the key as
its owner wrote it:

| Key | Matched by |
|---|---|
| `['schema', ...]` (form schemas), `['grid', ...]` (grid rows), `['blocks', ...]` (reserved), and their `shared:` forms | Every event, since any of them can show any record |
| `[recordClass, id, ...]`, such as `['Page', 7, 'versions', 1]` for a record's versions | An event naming a related class with `id` among its ids, or with no ids |
| `[recordClass, 'list', ...]` or any non-numeric second part, a read over the class | Every event naming a related class |
| Any key whose `records(data)` returned an id the event names | That event, for a related class; this is how the pages tree's `[SiteTree, parentId, 'children', ...]` listings follow a saved row. A `records` that throws is logged and its key matches as a list over the class, so it is invalidated; other keys are unaffected |

A related class is the key's class itself, an ancestor of it or a descendant of it. The shell reads the
ancestry from the config's `recordClasses`, which maps every DataObject class with a table to its
ancestors from its parent up to `DataObject`, as full class names. So an event for `Page` invalidates
keys under `SiteTree` that may show the page, and an event for `SiteTree` invalidates keys under `Page`
and every other subclass, as the legacy admin's full tree reload did. Two classes that only share an
ancestor are not related. A class missing from the map (one without a table) matches only its own name.

An invalidated read on screen refetches with its data still showing; one off screen is marked stale and
refetches when next read.

The pages pilet reads each tree level this way, keyed `[SiteTree, parentId, 'children', page, limit]` with
`records` returning the child ids, and announces a save, a new child or a move as a SiteTree event instead of
re-reading; an event for a page's own class, such as a history revert, reaches those listings by ancestry.

The history pilet reads its version pages this way, keyed `[recordClass, id, 'versions', page]`, and
reverts with `useServerMutation`, whose `changes` names the record.

What else is on the cache:

| Read | Key | Writes that announce |
|---|---|---|
| A FormSchema form (shell) | `['schema', schemaUrl]` | A successful submit whose response carries `record` announces `[record.className, [record.id]]`, or under the schema's `recordClass` (the form's record class, sent to the shell) when the record names no class, as AssetAdmin's does; the save then waits for its own form's refetch, and a refetch resets the values only while the form is clean |
| A GridField's rows (shell) | `['grid', rowsUrl, params]`, keeping the last page on screen while the next loads | A row action announces `[grid.modelClass, [row.id]]`, then waits for the rows' refetch |
| A LinkField's links (fields) | `['SilverStripe\LinkField\Models\Link', 'data', ids]` | Delete, sort and a dialog save announce the links they changed under the Link class |
| A UsedOnTable's usage list (fields) | `[recordClass, recordId, 'usage']` | None; a save of the record refetches it |
| An elemental area's blocks (elemental) | `['shared:blocks', areaId]`, seeded from the schema's `data.blocks` | Block actions announce the blocks and their page |

Two loaders stay imperative on `fetchJson`, uncached: SearchableDropdownField's search-as-you-type and
TreeDropdownField's lazy tree levels, which keep their own stores. Shell components read through
`useShellServerQuery` and `useShellServerMutation` in `state/serverCache.ts`, on the same client the
Pilet API hands pilets.

## Hooks

Hooks are how a pilet changes or reacts to what the shell does without replacing its components. They
replace the legacy `Injector.transform`. **There is no Injector adapter**: a module that called
`Injector.transform` ports each transformation by hand, using the table at the end of this section.

```ts
const dispose = piral.registerHook('onBeforeFormSubmit', async ({ formId, action, values }) => {
  if (formId !== 'Form_EditForm') {
    return true;
  }
  return saveDirtyBlocks();
}, { id: 'save-blocks' });
```

`registerHook(name, handler, options?)` returns a disposer; unloading the pilet removes all of its
handlers. Handlers are global, not per form, so a handler for a form hook checks `formId` itself.

### Running a hook

A pilet that owns a hook point runs it with the verb for its kind, which the shell's own hook points
use too, so order, isolation and the development freeze are the same:

| Verb | Returns |
|---|---|
| `runUpdateHook(name, value, context)` | The value after every handler. Cheap enough to call during render. It reads the handlers registered at the time of the call and does not subscribe, so a handler registered later shows only when the calling component next renders for another reason. The shell's render-time hook points (`updateFormSchema`, `updateFieldProps`, `updateGridColumns`) do subscribe |
| `runBeforeHook(name, context)` | `Promise<boolean>`: `false` as soon as a handler resolves the literal `false` (`0`, `null` or `undefined` let it go ahead); rejects with a handler's thrown error |
| `runAfterHook(name, context)` | Nothing, at once: an async handler is not awaited, so async handlers settle in their own time and order; handler errors and rejections are logged |

Each verb takes only names of its kind (`runUpdateHook` an `updateX` name, and so on) and throws on
another. The kind is `update`, `onBefore` or `onAfter` followed by a capital letter; the types say so too
(`` `update${Capitalize<string>}` ``), so `updatefoo` or `onbeforeSave` fails to compile in the run
verbs and leaves `registerHook` with no handler type to accept.

A handler that runs the update or after hook it is a handler of is not run again: the inner run logs a
warning and hands back the value it was given (nothing, for an after hook). Before hooks have no such
guard, since they are awaited and two runs of one can overlap legitimately. The pilet declares its hook point's types by augmenting `HookPoints`, and a pilet registering
a handler for it declares the shape it reads the same way:

```ts
declare module '@silverstripe/admin-shell' {
  interface HookPoints {
    updateBlockActions: { value: ReadonlyArray<BlockAction>; context: { block: Block; area: { id: number; pageId: number } } };
  }
}

const actions = piral.runUpdateHook('updateBlockActions', builtIn, { block, area });
```

### Kinds

The name decides the kind; a name that is none of these is refused.

| Kind | Handler | Result |
|---|---|---|
| `updateX` | `(value, context) => value` | Each handler gets the previous handler's result and returns the next value. Return a new value. Returning `undefined` counts as a failure: it is logged and the previous value passes on |
| `onBeforeX` | `(context) => boolean \| void \| Promise<boolean \| void>` | Run one after another and awaited; the first to resolve the literal `false` stops the rest and cancels. A handler that cancels says why itself (a toast) |
| `onAfterX` | `(context) => void` | Told once it has happened; the return value is ignored, and a returned promise is not awaited |

In development builds every handler gets deep-frozen copies of the value and the context, so mutating a
plain object or array in either throws (and is logged as that handler's failure). Class instances such
as a `Map`, and functions, are passed as they are. Production builds pass the live objects, so a mutation
there changes the caller's state; never rely on it.

### Order

`options.id` names the registration `<pilet>:<id>` (`<pilet>:#<n>` from a counter when omitted, so a
counter id never collides with one a pilet chooses; a pilet registering the same id twice for one hook is
refused). `options.before` and `options.after` list other registrations by that name, and the shell's
own handlers are `shell:<id>`; a pilet cannot be named `shell`. Handlers run in that constrained order;
where the constraints leave a choice, the shell's handlers come first, then pilets in feed order, then
registration order. A `before` or `after` naming nothing registered is ignored. A cycle is logged naming
the pilets whose handlers form it; every constraint outside it still holds, and the handlers it leaves
unordered (the cycle's, and any constrained to follow them) run after the rest, in feed order.

### Failures

Every handler runs on its own. An `updateX` handler that throws, returns a promise (an update cannot
be awaited) or returns `undefined` is logged with its pilet's name and the previous value passes on to the next handler. An
`onBeforeX` handler that throws is logged and cancels, and the error reaches the caller: a form shows
its message. An `onAfterX` handler that throws or rejects is logged. The legacy Injector let a throwing
transformation break the whole form.

### Hook points

| Hook | Value | Context | Where |
|---|---|---|---|
| `updateFormSchema` | `FormSchemaTree` | `{formId}` | Every FormSchemaForm, over the schema as loaded and refetched after a save, and again when the handlers change |
| `updateFormValues` | values keyed by posted field name | `{formId, action}` | First thing on every post, before validation. A field holding a value the form does not have yet (the HTML editor's unreported typing) returns it here; the form writes any changed name back, then validates and posts it |
| `updateFieldProps` | `FieldComponentProps` | `{field, schema}` | Every field a FormSchemaForm renders, each render; keep it cheap |
| `onBeforeFormAction` | | `{formId, action}` | An action button in a form's own action bar is pressed, before validation and before the host's `confirmAction`; for confirmations. A host posting through `handleRef` does not run it |
| `updateFormValidation` | `FormValidationErrors` (messages keyed by posted field name) | `{values, schema}` | Before every post. The shell's own check (`shell:validation`, `required` only) runs first; any message left stops the post and shows on its field, or above the form when it names no field |
| `onBeforeFormSubmit` | | `{formId, action, values}` | After validation, before every post, the handle's included; for work that must finish before the post (elemental saves dirty blocks here) or to cancel it. The form posts its values as they are once the handlers finish; `values` is the snapshot from before the handlers. A pending field value belongs in `updateFormValues`, or validation does not see it |
| `onAfterFormSubmit` | | `{formId, action, response}` | The server answered a post, with errors or without |
| `updateGridColumns` | `ReadonlyArray<GridColumn>` | `{name, rowsUrl}` | Each GridField's columns as the rows endpoint sends them; reorder or drop columns (rows carry no data for a column the server did not send) |
| `updateBlockActions` | `ReadonlyArray<BlockAction>`, each `{id, label, onSelect(block), disabled?}` | `{block, area: {id, pageId}}` | Run by the elemental pilet over a block's menu, each render, after it drops the built-in actions the block does not allow. Built-in ids are `publish`, `unpublish`, `duplicate`, `moveUp`, `moveDown` and `archive`; add, reorder or drop entries. A disabled entry stays focusable and does nothing |
| `onAfterRevert` | | `{recordClass, id, version}` | Run by the history pilet once a revert succeeds, before its toast; `version` is the version reverted to |

`updateBlockActions` and `onAfterRevert` are declared by the pilets that run them, not the shell. Planned
and not yet run: `updateUploadFieldProps`, for the pilet that will own `UploadField`.

The value and context types are exported as `HookPoints`, with `HookHandler<N>`, `HookOptions`,
`FormValidationErrors` and the handler types. A hook name not in `HookPoints` can still be registered;
its value and context are then `unknown`.

### From `Injector.transform`

The ten transformations installed modules register today, and what replaces each:

| Module | Transformation | What it did | Successor |
|---|---|---|---|
| admin | `admin` | `reducer('form', applyFormMiddleware)` | Gone: form state is per form; alter the schema with `updateFormSchema` |
| admin | `field-holders` | Wraps `FieldGroup` in a holder | The shell's form layout owns holders; nothing to port |
| admin | `form-action-changed` | Save and publish pristine state, the dirty indicator | Built in: `withPristineState` in `forms/schema.ts` |
| admin | `schema-validation` | Client validation from the schema | `updateFormValidation`, after `shell:validation` |
| asset-admin | `move-form-disabled` | Decorates `TreeDropdownField.AssetAdmin.MoveForm` | `registerSilverstripeComponent` under a context key, or `updateFieldProps` |
| asset-admin | `owner-unpublishing` | Decorates `FormAction.AssetAdmin.EditForm.action_unpublish` with a confirmation | `onBeforeFormAction`, or the host's `confirmAction` prop |
| elemental | `elemental-fieldgroup` | Historic block view in the history detail | None built yet; the history pilet has no slot for a version's detail |
| elemental | `blocks-history-revert` | Adds revert to a toolbar | The history pilet reverts through its API; `onAfterRevert` to react |
| elemental | `element-actions` | Five block actions | Owned by the elemental pilet; `updateBlockActions` for third parties |
| sortablefile | `enhance-uploadfield` | Replaces `UploadField`, transforms the `assetAdmin` reducer | `registerSilverstripeComponent('UploadField')` plus `updateUploadFieldProps` (planned) |

In general: decorating a component (`updater.component`) becomes registering a component under the same
name, or an `updateXProps` hook; `updater.form.alterSchema` becomes `updateFormSchema` (or
`updateFieldProps` for one field); `updater.form.addValidation` becomes `updateFormValidation`; a reducer
transform has no successor, since there is no Redux store.

## Section header

The shell draws one header at the top of the content area for every route (the "Section header" of
the CMS Refresh design): a back button, the page's ancestors as a breadcrumb, the page title, and the page's views on the right with the
current one underlined. It sticks to the top while the page scrolls. A page sets it with
`setSectionHeader(header)` from an effect and returns the disposer as the cleanup, so it clears on
unmount:

```ts
React.useEffect(() => piral.setSectionHeader({ title, backTo: '/pages/', backLabel: 'Back to pages', views }), [piral, title]);
```

| Field | |
|---|---|
| `title: string` | Rendered as the page's `h1`, so a page that sets a header renders no `h1` of its own |
| `badge?: string` | A short label drawn beside the title, such as a block's type; it is the title's accessible description |
| `crumbs?: {label, to}[]` | The page's ancestors, nearest last, as router paths. Drawn above the title as a `nav` named "Breadcrumb" holding an ordered list of links, each followed by a " / " the list hides from screen readers. The page itself is the `title` only, never a crumb. Pass what is known and set the header again as more loads (a deep link before its tree has the ancestors) |
| `backTo?: string` | A router path; the last crumb's when omitted, and no back button without either |
| `backLabel?: string` | The back button's accessible name: "Back to <last crumb label>" when back falls to the last crumb, "Back" otherwise |
| `views?: {key, label, to, current?}[]` | Route links in a `nav` named "<title> views", `aria-current="page"` on the current one. Views are routes; for panels inside one page use the patterns package's `Tabs` |
| `documentTitle?: string` | The first part of the browser tab title when it should differ from `title`; the shell writes "<documentTitle or title> - <application name>" |
| `preview?: string` | The record's preview URL, loaded in an `iframe` named "Preview of <title>". Set it again to load another (the pages section swaps `?stage=Stage` for `?stage=Live` with its Draft/Published toggle) |
| `sidebar?: {title, section}` | Draws a sidebar column before the header and page, so the header and its breadcrumb sit over the page only. Its header row, level with the section header and sharing its bottom divider, holds `title` as a labelled element (not a heading, so the page's `h1` stays first) and a search button that opens the sidebar's search; the Sidebar component receives `{ titleId, searchId, searchOpen, closeSearch }`; below it the latest component registered with `registerSectionSidebar(section, Sidebar)` |

### Section sidebar

A section with a panel beside its pages (the pages section's tree) registers the panel once and names
it from each header that should show it:

```tsx
api.registerSectionSidebar('SilverStripe-CMS-Controllers-CMSMain', PageTreeSidebar);
// in the page
React.useEffect(() => piral.setSectionHeader({ title, sidebar: { title: 'Pages', section: 'SilverStripe-CMS-Controllers-CMSMain' } }), [piral, title]);
```

`section` is the code the sidebar was registered under; by convention the section's menu item code.
The sidebar renders in the layout, outside the page's route, so it gets no route params: anything it
shares with the page (the pages section's tree store and open page) lives in a store both read. It is
under the router, so its links and navigations go through the unsaved-changes guard. From 1024px the
column is 330px wide, sticks at the viewport height, and its body is a flex column the sidebar fills
and scrolls itself (`flex: 1; min-height: 0; overflow: auto`); below 1024px it stacks above the content
and the sidebar sets its own height. Without `sidebar` the layout is a single content column.

With `preview` set and the viewport at least 1024px wide, the form's action bar ends with Share and a
menu of Edit, Split and Preview modes: the form alone, the form beside the preview, or the preview alone,
where the bar's right-hand group stays at the foot of the pane. The mode is the viewer's own choice and
kept across pages; below 1024px, and on a page without `preview`, the form shows alone.

Headers stack: each call pushes an entry and the newest shows. A disposer removes only its own entry,
so disposing a later header restores the one below it, and a second dispose does nothing. Unloading a
pilet removes every header it set.

The shell keeps `document.title` on the showing header. After a client route change (a new pathname,
not the first load or a query change) it moves focus to the header's `h1` once the arriving page has
set its header, and announces the title through its status region; a page that retitles itself soon
after landing (a record name arriving after "Users #1") is announced again.

Sticky content below the header offsets by `calc(var(--shell-sticky-top) + var(--shell-header-offset))`:
`--shell-sticky-top` is the narrow-screen top bar (0 from 1024px) and `--shell-header-offset` the
header's rendered height, which the shell measures; `--shell-header-height` is only the design height
it falls back to. The form's action bar is measured the same way into `--shell-form-actions-offset`.

## Details panel

A right-hand panel beside the section's content, under the section header, that any pilet can fill: the
Files section opens a file's edit form in it, and another section can show a record's details the same
way. The page opens it from an effect and disposes it on unmount, so the panel lives exactly as long as
the route that names the record:

```tsx
const navigate = useNavigate();
React.useEffect(
  () =>
    piral.openPanel({
      id: `file-${fileId}`,
      title,
      badge: draft ? 'Draft' : undefined,
      meta: ['1120 x 640px', '13 KB'],
      content: <FormSchemaForm schemaUrl={schemaUrl + fileId} />,
      onClose: () => navigate(folderPath),
      returnFocus: () => document.querySelector(`[data-file-link="${fileId}"]`),
    }),
  [piral, fileId, title, draft, schemaUrl, folderPath, navigate],
);
```

| Option | Meaning |
|---|---|
| `id` | Names the panel. Opening the id that is showing updates it in place (no focus move, content keeps its state); the disposer of the earlier call then leaves it open |
| `title` | The panel's `h2` and the region's accessible name; 20px medium, ellipsed on one line |
| `badge?` | A short status after the title, drawn as the site tree's tag (10px uppercase on the modified ground) |
| `meta?` | Facts under the title, divided by thin rules |
| `content` | The panel body, which scrolls on its own. Its inset is `--shell-inset` (20px here), which form fields read; a `FormSchemaForm`'s action bar (Cancel or Saved on the left, primary actions after it, the more menu) pins to the panel's foot |
| `footer?` | An action bar under the body, for content without a form of its own; laid out as the form's bar |
| `onClose` | The user asked to close with the close button. Close it from here, usually by navigating to the route without the record, so the unsaved-changes guard can ask first |
| `closeLabel?` | The close button's name; "Close <title>" otherwise |
| `returnFocus?` | Where focus goes on close when the element focused at open is gone (a list that remounted with the route) |

One panel shows at a time: opening another id replaces it, without calling the replaced panel's
`onClose`, since replacing it was the caller's doing. `closePanel(id)`, the disposer and unloading the
pilet close it without `onClose` too. `usePanel()` reports the panel showing, from any pilet.

From 1200px the panel sits beside the content, 350px wide and 400px from 1600px, with a Grey 400 rule
on its start edge; below 1200px it replaces the content, which stays mounted underneath so the page keeps
its state. It sticks under the section header at the viewport's height. Focus moves to its title when it
opens or another replaces it, and when it closes with focus inside, back to the element focused at open,
else `returnFocus()`, else the main landmark; the panel repeats the move after the section header's
route-change focus, so a panel its close button closed keeps it. A panel closed any other way (a crumb or
menu link changing the route) leaves the section header's focus alone and only rescues focus that was lost.
Escape does not close the panel, as legacy's had no Escape; it stays with the field or dialog that has it.
Content that throws while rendering shows an error in the panel and leaves the page beside it. While a panel
is open the preview pane is not drawn; preview mode resumes when it closes.

## Section icons

The menu draws an icon before each section's label. By default the shell picks it from the section's
legacy `menu_icon_class`, which the server sends as the menu item's `iconClass`:

| `menu_icon_class` | Icon |
|---|---|
| `font-icon-sitemap` | `PagesIcon` |
| `font-icon-page-multiple` | `CampaignsIcon` |
| `font-icon-image` | `FilesIcon` |
| `font-icon-chart-line` | `ReportsIcon` |
| `font-icon-torsos-all` | `SecurityIcon` |
| `font-icon-box` | `ArchiveIcon` |
| `font-icon-tags` | `TaxonomiesIcon` |
| `font-icon-cog` | `SettingsIcon` |
| anything else, or a CSS `menu_icon` image | `SectionIcon` |

A pilet replaces that for its own section with `registerSectionIcon(sectionCode, Icon)`. The code is
the menu item's `code`, the controller class with hyphens for backslashes
(`SilverStripe-Blog-Admin-BlogAdmin`). `Icon` renders an 18px glyph in `currentColor`; the patterns
package's `Icon` frame does both, so a module icon is a path in it:

```tsx
const BlogIcon = () => <Icon viewBox="0 0 18 18"><path d="..." /></Icon>;
api.registerSectionIcon('SilverStripe-Blog-Admin-BlogAdmin', BlogIcon);
```

The latest registration wins and unloading the pilet restores the default. The icon is decorative:
the label names the link, including in the collapsed menu, where the label is visually hidden.

## Menu items

A section the server knows (a `LeftAndMain` subclass with a `url_segment` and a menu title) is already in the
menu, so a module with a section needs no menu registration. A pilet page with no server section behind it adds
its link with `registerMenuItem`:

```tsx
api.registerPage('/live-report/*', LiveReport);
api.registerMenuItem({ code: 'live-report', label: 'Live report', to: '/live-report', Icon: ReportsIcon });
```

| Key | |
|---|---|
| `code` | Identifies the item; a later registration with the same code replaces it in place |
| `label` | The link text: one line with an ellipsis and a `title`, visually hidden in the collapsed menu |
| `to` | A router path relative to the admin base, as for `registerPage` |
| `Icon` | Optional 18px `currentColor` glyph, decorative; `SectionIcon` when not given |

`to` starts with `/`: a relative path resolves against whatever route is current and never reads as current
itself. It sits outside every section's path, or the section and the item both read as current.

The shell draws these after the CMS sections with the same link as a section: icon, label, `aria-current="page"`
on `to` and its sub paths, and the collapse behaviour. Unloading the pilet removes them.

**Legacy:** components in the `SilverStripe\Admin\LeftAndMain` / `menu.bottom` slot still render, each as its own
`<li>` after the registered items, but the pilet supplies the markup: an anchor (or router `Link`) with the
`shell-menu__link` class, an optional `<span class="shell-menu__icon">` holding an 18px `currentColor` icon,
and the text in a `<span class="shell-menu__label">`. The shell does not mark it current. **Breaking:** the class
was `shell__link` before 2026-10-07; a pilet still using it renders unstyled.

## Notifications

`showNotification(content, options?)` draws a toast in the top right, under the header, newest first,
and returns a function that closes it. `content` is a string, an element or a component taking
`{onClose, options}`. The toast does not take focus; its text is read out through the shell's live
regions, one toast after another when several arrive together.

| Option | Use |
|---|---|
| `type` | `'info'` (default), `'success'`, `'warning'` or `'error'`; sets the icon and edge colour |
| `autoClose` | Milliseconds before the toast closes itself, 0 to keep it. Defaults to 6000 for `info` and `success` and to 0 for `warning`. Ignored for `error`, which stays until dismissed. The timer pauses while the toast is hovered or holds focus |

`title` is accepted by piral-notifications but not drawn. A toast always has a close button.

To draw the same toast outside the notification host, render `Toast` from the patterns package:
`children` the message, `type`, `dismissAfter` (milliseconds; self-closing, paused while hovered or
focused, ignored for `error`) and `onClose` (draws the close button and is called however the toast
closes). A toast with neither stays until its owner unmounts it. It has no live region role, so the owner
announces its text.

For a message that stays in place (a form's error or warning, a note in a dialog), render `Alert` from
the patterns package instead: `children` the message and `type` (`'info'` default, `'success'`,
`'warning'`, `'error'`), drawn with the toast's icon for that type and no close button. Errors and
warnings are `role="alert"`, success and info `role="status"`.

## Modals

A dialog one pilet opens by name and another provides is a named modal; a dialog owned by one component
stays inline, rendering the patterns package's `Dialog` itself. Names follow legacy's Injector names
where one exists (`InsertLinkModal`). The shell draws every named modal in the components `Dialog`, so
focus handling and styling are the shell's: the registration supplies the content and its props.

```tsx
api.registerModal('InsertLinkModal', InsertLinkModal, undefined, { header: 'Insert link', focusHeading: true });
const close = api.showModal('InsertLinkModal', { editing: false, onInsert, onCancel });
```

- The content component gets `onClose` and `options` (the registration's `defaults` overlaid by the
  `showModal` options), plus `piral`, the owning pilet's API. Options are typed by augmenting
  `PiralCustomModalsMap` in `@silverstripe/admin-shell` with the modal's name.
- `layout.header` is the heading until the content sets one; `layout.focusHeading` focuses the heading as
  the modal opens rather than its first control, for content that loads its controls.
- `piral.useModalFrame({header, footer, alert})` sets those parts of the frame from the content, on every
  render, so a header that names what is being edited or a footer of actions can change while it is open.
- Escape, `onClose` and the function `showModal` returns all close the modal, which unmounts the content.
  Focus goes back to the element that had it when the modal opened, if it is still in the page; an opener
  that wants focus elsewhere (an editor whose toolbar button may have gone) moves it after closing. A
  pilet that must know the modal closed passes a callback in its options and calls it from the content.
- `SchemaFormDialog` with `modal` (and `open`) draws into the frame: its header and actions go to the
  frame's header and footer. Without `modal` it draws its own `Dialog`, also inside a named modal.

## Patterns package

`@silverstripe/admin-patterns` (source in `client/patterns`) holds FieldHolder, the built-in field
components, the unsaved-changes dialog and the reveal-field event. Import it by name; the shell's copy is
used at runtime and its stylesheet is loaded by the shell, so pilets ship neither. Its CSS reads
`--admin-*` tokens, which a host can reassign.

## Shared classes

Classes the shell's stylesheets define that a pilet may write into its own markup, without rendering the
component that owns them, so it does not restyle what they cover. They are part of the Pilet API:
**renaming or removing one, or a modifier or token listed here, is a breaking change and is listed under
Changes.** A pilet reassigns the tokens named here on its own element, never on `:root`, and does not
select these classes from its own CSS.

| Class | Owner | For | Element | Modifiers and tokens |
|---|---|---|---|---|
| `admin-visually-hidden` | components | Text read by assistive technology and not drawn: an icon-only control's name, a live region, a hint. The box is clipped, so it stays in the accessibility tree | Any text element; a live region is a `<p>` or `<div>` with `role="status"` | none |
| `admin-error-text` | components | A line of error copy with no margin: a failed load, a missing file. `FieldHolder` draws it for a field's own error; a boxed message with an icon is `Alert` | `<p>`, with `role="alert"` when it appears after the page has loaded | none |
| `admin-badge` | components | The small uppercase tag on the modified ground, as on a draft page or file | `<span>` | `--admin-badge-bg-color`, `--admin-badge-fg-color`, `--admin-badge-border-radius`, `--admin-badge-font-size`, `--admin-badge-padding` |
| `admin-field__control` | components | The bordered look of a text control, with its focus ring and `aria-invalid` border, for a control a pilet draws itself inside `FieldHolder` | `<input>`, `<textarea>` or `<select>`; `admin-field__control--select` on a `<select>` | `--admin-field-control-bg-color`, `--admin-field-control-fg-color`, `--admin-field-control-padding`, `--admin-field-control-line-height`, on the control or its holder |
| `admin-field__check` | components | A native checkbox or radio at the design's size and accent colour, with its focus ring, where no field holder fits (a tile's select box) | `<input type="checkbox">` or `type="radio"` | `--admin-check-size` |
| `admin-field__description` | components | A second line of help under a control inside `FieldHolder`, which draws the field's own description already | `<p>` with an id the control's `aria-describedby` names | none |
| `admin-icon` | components | An icon from the server, such as a page type's, at the icon size. An SVG icon is a component from the package's icons | `<img alt="">` | `--admin-icon-size` |
| `shell-page` | shell | The column a page registered with `registerPage` draws into, with the top gap the shell's own pages have | `<div>`, the page's outermost element | none |
| `shell-page__inset` | shell | The content column's inline inset, `--shell-inset`, which form fields read too. Content beside or around a form (a notice, a preview) takes it to line up with the fields; inside the details panel it is the panel's 20px | Any block element | `--shell-inset` is the shell's to set |
| `shell-form` | shell | The element `FormSchemaForm` renders around its fields. A pilet may match it (`closest('.shell-form')`) to find the form a field sits in; it never adds the class | read only | none |

Classes a component exists for are not written by hand: render the component, which keeps its markup,
ids and ARIA together. That covers `admin-field`, `admin-field--inline`, `admin-field--option`,
`admin-field__label`, `admin-field__option` and `admin-field__choices` (`FieldHolder`, `CheckboxField`,
`OptionsetField`), `admin-button*` (`Button`), `admin-link*` (`Link`), `admin-alert*` (`Alert`) and
`admin-dialog*` (`Dialog`). Uses still to move over:

- htmleditor `SourceCodeDialog.tsx` writes the `admin-field` holder and `admin-field__label` by hand; it
  should render `FieldHolder`.
- pages `AddPageDialog.tsx` writes each page type's radio row (`admin-field admin-field--inline
  admin-field--option`, `admin-field__option`, `admin-field__choices`, a `legend.admin-field__label`) by
  hand, because `OptionsetField` has no slot for an option's icon and description; the component needs
  that slot first.
- pages `PageTree.tsx` puts `admin-button admin-button--tertiary admin-button--sm` on a `<span>` for the
  tree's "more" row, which must stay non-interactive inside its tree item; either `Button` gains a
  non-interactive look or the row takes a class of its own.
- Pilet tests select `admin-dialog__title` and `admin-dialog__actions` inside `Dialog`; they read the
  component's markup, which is not part of this contract, and should find the dialog by role and name.

## Pilet CSS

The shell declares the cascade layers once, before any stylesheet: `admin.tokens, admin.components, shell,
pilets`. A pilet wraps each of its stylesheets in `@layer pilets { }`, so it wins a tie with the package and
the shell however late its `<link>` arrives, and selects only classes with its own prefix, never a shared or
`shell-*` class. It changes a shared class by reassigning that class's tokens on its own element. Lengths in a
property come from tokens (`--admin-gap-*` and the like, or the pilet's own tokens declared on its block); a
literal is only a token's default. In this module `yarn lint:css` checks the layer, the prefix and the lengths.

## Building

- The shell and pilet builds read the `browserslist` in the fork root `package.json`; building a copy
  outside the fork tree produces different output.
- A pilet's `tsconfig.json` needs `skipLibCheck: true`: the emulator's declaration file is generated and
  does not check cleanly on its own.
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
