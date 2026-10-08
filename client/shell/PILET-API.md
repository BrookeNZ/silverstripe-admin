# Pilet API v1

What a pilet can rely on from the Silverstripe admin shell. Types reach pilets through the emulator
(`npm run build:emulator`, then install the tarball as `@silverstripe/admin-shell`); the form types come
from `src/forms/types.ts` via `extraTypes` in `package.json`.

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
  resolution by `componentCandidates`; `setUnsavedChanges` and `hasUnsavedChanges`.
- 2026-10-07: `setSectionHeader` (title, then `preview`, `crumbs`, `badge`, `sidebar`); `registerSectionIcon`;
  `registerMenuItem`; GridField row actions and column contract; `registerBeforeSubmit` (since removed).
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

## Verbs

On `PiletApi`, besides Piral's own (`registerPage`, `registerExtension`, `showNotification` from
piral-notifications, ...):

| Verb | Use |
|---|---|
| `registerSilverstripeComponent(name, Component): Disposable` | Register a component under a registry name. The latest registration of a name wins; unloading the pilet restores the previous one. Field components register here too |
| `getSilverstripeComponent(name): ComponentType` | A stable component that renders the latest registration of `name` |
| `registerExtensionComponent(name, slot, Component): Disposable` | Fill the slot `<name>.<slot>`. `SilverStripe\Admin\LeftAndMain` / `menu.bottom` is legacy; use `registerMenuItem` |
| `getConfig(): Readonly<SilverstripeClientConfig>` | A deep-frozen copy of `window.ss.config` |
| `showNotification(content, options?)` | From piral-notifications |
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
| `useServerQuery(key, fetcher, options?): ServerQueryResult<T>` | Read and cache server data under a key; see **Server cache** |
| `useServerMutation(mutation, options?): ServerMutationResult<V, R>` | Run a write and announce the records it changed; see **Server cache** |
| `invalidateRecords(recordClass, ids): void` | Emit records-changed, which refetches every cached read of those records; see **Server cache** |
| `fetchJson(url, init?): Promise<T>` | The shell's fetch for admin JSON endpoints, with the session and CSRF handling; see **Server cache** |

No `registerFormField`: binding a field to the form is decided by the schema (`schemaType`, read-only
state, the posted set), not by the registration; holders are a component (`FieldHolder` in
`@silverstripe/admin-patterns`) that a field draws itself; and one registry namespace serves fields
and other components. A field component is typed by annotating it with `FieldComponentProps`.

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
| `config` | The deep-frozen config `getConfig` returns | Nothing; fixed at load |
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
those records; a view listing them (the page tree, the grid, the block list) re-reads them on `on`.

Piral's own data store (`setData`/`getData`) still carries `silverstripe:pages:current-page-id`, the page
the Pages section is editing or `null`, owned by the pages pilet. It is superseded by `currentRecord` and
goes once the Pages section sets that instead.

A section pilet renders a record edit form with the shell's renderer, registered as `FormSchemaForm`
(`getSilverstripeComponent('FormSchemaForm')`): props `schemaUrl`, `onSubmitted(response, action)`,
`onStateChange(state)` (the loaded state, and each state a save brings back, for a host showing a record
value such as the title in the section header), `omitFields` (names left out, for a host that shows
them itself), `renderLoadError(error)`, `trackUnsavedChanges`, `onLoad(response)` (the loaded response, for a
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
props `SchemaFormDialogProps`: `open`, `header`, `intro` (controls above the form, such as the HTML editor's choice of link kind), `schemaUrl`, `onClose()`, `onSubmitted(response, action)`):
the shared Dialog with the form headless in its body and Cancel, then the form's actions, in its footer.
Each action button posts its own action and shows `loading` while it runs; errors show in the body.
`onClose` is Cancel and Escape, and the host closes the dialog from `onSubmitted` as well.

### Server cache

Server reads are cached by the shell in one TanStack Query client. Pilets never import the library; they
use four verbs, and a records-changed event is what clears the cache, so emitters stay as they are.

- `fetchJson<T>(url, init?)` requests an admin JSON endpoint: `Accept: application/json` and
  `X-Requested-With` on every request, `X-SecurityID` from the config on anything but a GET, credentials
  same-origin. `init` takes `method`, `query` (added to the query string), `body` (sent as JSON;
  `URLSearchParams` and `FormData` are sent as they are), `headers` and `signal`. It resolves to the parsed
  body, or `null` for an empty one, and rejects with a `ServerRequestError`: `message` (what the server
  said, or a generic one), `status`, `serverMessage` (the CMS envelope's errors joined, or the first line
  of a dev-mode plain-text error; `null` when the server said nothing worth showing) and `sessionExpired`,
  set for a 401, a 403 with `X-Reauthenticate` and a redirect to the login form, whose message asks the
  viewer to reload and log in. A success whose body is not JSON (an HTML page) rejects too, and so does a
  200 that redirects by `X-ControllerURL` (a section the member cannot view), as a 403.
- `useServerQuery<T>(key, fetcher, options?)` is a React hook. `fetcher({signal, request})` loads the data,
  `request` being `fetchJson`; the same key on screen twice fetches once. Options: `enabled` (false holds the
  read back), `staleTime` in milliseconds (0 by default, so a remount refetches behind the cached data) and
  `keepPrevious` (keep the last key's data on screen while the next key loads) and `records(data)`, which
  returns the ids of the key's class that the result shows (the rows of a listing), so an event naming any
  of them refetches the listing even when the key itself names none. It returns
  `{status: 'pending' | 'error' | 'success', data, error, isFetching, refetch()}`. A failure with a status
  under 500 is not retried; anything else is retried once. Window focus does not refetch.
- `useServerMutation<V, R>(mutation, options?)` is a React hook for a write: `mutation(variables, request)`.
  It returns `{mutate(variables), status: 'idle' | 'pending' | 'error' | 'success', error, reset()}`;
  `mutate` resolves with the result or rejects with the error. On success, `options.changes(variables,
  result)` names the records changed (one `RecordsChangedEvent`, a list, or `null`), and each is emitted
  as records-changed.
- `invalidateRecords(recordClass, ids)` emits records-changed for those records.

Keys are arrays, `[scope, ...parts]` with parts that are strings, numbers, booleans or `null`. The shell
listens to records-changed and invalidates the keys an event matches:

| Key | Matched by |
|---|---|
| `['schema', ...]` (form schemas), `['grid', ...]` (grid rows), `['blocks', ...]` (an area's blocks) | Every event, since any of them can show any record |
| `[recordClass, id, ...]`, such as `['Page', 7, 'versions', 1]` for a record's versions | An event naming a related class with `id` among its ids, or with no ids |
| `[recordClass, 'list', ...]` or any non-numeric second part, a read over the class | Every event naming a related class |
| Any key whose `records(data)` returned an id the event names | That event, for a related class; this is how the pages tree's `[SiteTree, parentId, 'children', ...]` listings follow a saved row |

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
| A FormSchema form (shell) | `['schema', schemaUrl]` | A successful submit whose response carries `record` announces `[record.className, [record.id]]`; the save then waits for its own form's refetch, and a refetch resets the values only while the form is clean |
| A GridField's rows (shell) | `['grid', rowsUrl, params]`, keeping the last page on screen while the next loads | A row action announces `[grid.modelClass, [row.id]]`, then waits for the rows' refetch |
| A LinkField's links (fields) | `['SilverStripe\LinkField\Models\Link', 'data', ids]` | Delete, sort and a dialog save announce the links they changed under the Link class |
| A UsedOnTable's usage list (fields) | `[recordClass, recordId, 'usage']` | None; a save of the record refetches it |

Two loaders stay imperative on `fetchJson`, uncached: SearchableDropdownField's search-as-you-type and
TreeDropdownField's lazy tree levels, which keep their own stores. Shell components read through
`useShellServerQuery` and `useShellServerMutation` in `state/serverCache.ts`, on the same client the
Pilet API hands pilets. The elemental pilet's block list is not on the cache yet.

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
| `runUpdateHook(name, value, context)` | The value after every handler. Cheap enough to call during render; a handler registered later shows from the next render |
| `runBeforeHook(name, context)` | `Promise<boolean>`: `false` as soon as a handler cancels; rejects with a handler's thrown error |
| `runAfterHook(name, context)` | Nothing; handler errors and rejections are logged |

Each verb takes only names of its kind (`runUpdateHook` an `updateX` name, and so on) and throws on
another. The pilet declares its hook point's types by augmenting `HookPoints`, and a pilet registering
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
| `updateX` | `(value, context) => value` | Each handler gets the previous handler's result and returns the next value. Return a new value; in development builds the input is a deep-frozen copy, so mutating it throws |
| `onBeforeX` | `(context) => boolean \| void \| Promise<boolean \| void>` | Run one after another and awaited; the first to resolve `false` stops the rest and cancels. A handler that cancels says why itself (a toast) |
| `onAfterX` | `(context) => void` | Told once it has happened; the return value is ignored |

### Order

`options.id` names the registration `<pilet>:<id>` (a counter when omitted; a pilet registering the same
id twice for one hook is refused). `options.before` and `options.after` list other registrations by
that name, and the shell's own handlers are `shell:<id>`. Handlers run in that constrained order; where
the constraints leave a choice, the shell's handlers come first, then pilets in feed order, then
registration order. A `before` or `after` naming nothing registered is ignored. A cycle is logged with
the pilets in it and the hook's handlers run in feed order instead.

### Failures

Every handler runs on its own. An `updateX` handler that throws, or returns a promise (an update cannot
be awaited), is logged with its pilet's name and the previous value passes on to the next handler. An
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
| elemental | `elemental-fieldgroup` | Historic block view in the history detail | The history pilet's `VersionDetail` slot, filled by elemental |
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
