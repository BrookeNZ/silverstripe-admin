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

1. Each candidate (or `component` when there are none), first registered wins
2. Only when the field names no component: the `schemaType` default (FormBuilder's
   `getComponentForDataType` map, for example `Text` to `TextField`)
3. A visible missing-field notice naming the component; the field's value is still posted

A named but unregistered component never falls to the type default or to a parent class's component.
Examples: `SearchableMultiDropdownField` tries `SilverStripe\Forms\SearchableMultiDropdownField`, then
`SearchableDropdownField`; a project `SlugField extends TextField` tries `App\Forms\SlugField`,
`SilverStripe\Forms\TextField`, `SilverStripe\Forms\FormField`, then `TextField`.

## Patterns package

`@silverstripe/admin-patterns` (source in `client/patterns`) holds FieldHolder, the built-in field
components, the unsaved-changes dialog and the reveal-field event. Import it by name; the shell's copy is
used at runtime and its stylesheet is loaded by the shell, so pilets ship neither. Its CSS reads
`--admin-*` tokens, which a host can reassign.

## Building

- The shell and pilet builds read the `browserslist` in the fork root `package.json`; building a copy
  outside the fork tree produces different output.
- `npm run build`, `build:emulator` and `typecheck` build `client/patterns` first. The emulator lists the
  package as a `file:` dependency with an absolute local path, so outside this checkout a pilet needs
  the package published or linked.
- The fields pilet's lock file pins the emulator tarball, which is gitignored: a fresh clone runs
  `npm run build:emulator` in `client/shell` before `npm install` in `client/pilets/fields`.
