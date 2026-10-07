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
| `registerExtensionComponent(name, slot, Component): Disposable` | Fill the slot `<name>.<slot>`. `SilverStripe\Admin\LeftAndMain` / `menu.bottom` is legacy; use `registerMenuItem` |
| `getConfig(): Readonly<SilverstripeClientConfig>` | A deep-frozen copy of `window.ss.config` |
| `showNotification(content, options?)` | From piral-notifications |
| `setUnsavedChanges(key, dirty): Disposable` | Report unsaved changes this pilet owns; the shell confirms before navigating away. The disposer clears the key |
| `hasUnsavedChanges(): boolean` | Whether anything in the shell is dirty |
| `setSectionHeader(header): Disposable` | Show the section header above the content; see **Section header** |
| `registerBeforeSubmit(formId, handler): Disposable` | Run `handler({action})` before the form with that element id posts; see **Before a form posts** |
| `registerSectionIcon(sectionCode, Icon): Disposable` | Draw `Icon` beside a section's menu item; see **Section icons** |
| `registerMenuItem({ code, label, to, Icon? }): Disposable` | Add a menu link the shell draws like a section's; see **Menu items** |

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

## Before a form posts

`registerBeforeSubmit(formId, handler)` runs `handler({action})` after the form is valid and before it
posts, where `formId` is the form element's id (`Form_EditForm`), which every field receives as `formId`.
Handlers run one after another in registration order and are awaited; one that resolves `false` cancels
the post and the rest, and should say why itself (a toast). A thrown error cancels too and its message
shows on the form. The form posts its values as they are once the handlers finish, so a field that
writes its pending value in a handler (the HTML editor flushing its content) is posted with it. The
elemental area uses it to save dirty blocks before the page saves:

```tsx
React.useEffect(() => piral.registerBeforeSubmit(formId, async () => saveDirtyBlocks()), [piral, formId]);
```

The disposer removes the handler; unloading a pilet removes all of its handlers.

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
