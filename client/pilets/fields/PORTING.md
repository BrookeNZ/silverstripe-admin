# Porting notes: fields pilet

One section per field. Line counts compare the legacy file with the ported one
(`git diff --no-index --numstat`); "out" is legacy lines removed or changed, "in" is lines added.

The first sections cover SearchableDropdownField. Legacy source: `silverstripe/silverstripe-admin`
branch 3, `client/src/components/SearchableDropdownField`. Registered as `SearchableDropdownField`, the
schema component name both `SearchableDropdownField` and `SearchableMultiDropdownField` send.

## Survived unchanged

The component body: state, the lazy-load fetch cache, the 500ms `debounce-promise` search, change
handling, the non-multi value unwrapping, `classNamePrefix`, every react-select prop, the
`Component`/default export pair. 142 of the 178 legacy lines are untouched; the diff is 36 lines out,
30 in. Dependencies kept as they were: `react-select` 5, `classnames`, `debounce-promise`,
`@emotion/cache`, `@emotion/react` (bundled into the pilet, not shared). The value shape is the legacy
one: react-select option objects, as FormSchema state sends them.

## Changed

| Legacy | Pilet | Why |
|---|---|---|
| `lib/Backend` | `src/legacy/Backend.ts`, `fetch` with same-origin cookies and `X-Requested-With` | admin internals are not shipped to pilets |
| `lib/Config` | `src/legacy/Config.ts`, reads `api.getConfig()` handed over in `setup` | the Pilet API owns the client config |
| `i18n._t` | `src/legacy/i18n.ts`, returns the default text | no translation API in the shell yet |
| `components/FieldHolder` HOC | `src/legacy/fieldHolder.tsx` over `FieldHolder` from `@silverstripe/admin-patterns` | hands the field the flat props FormBuilder passed, picked by name from its typed schema-level props (`SearchableDropdownSchema`); label, description and message come from the shared holder |
| `containers/EmotionCssCacheProvider` | `src/legacy/EmotionCssCacheProvider.tsx`, cache in a module variable instead of `window.ssReactSelectCache` | pilet-scoped, no global |
| `FormConstants.CSRF_HEADER` | `CSRF_HEADER` exported by the Backend shim | one constant was all it held |
| `url.parse`/`url.format` | `new URL(optionUrl, document.baseURI)` | Node's `url` is not polyfilled by webpack 5 |
| `PropTypes` | a TypeScript props interface | the pilet is TypeScript; prop-types dropped as a dependency |
| `createRef()` | `createRef<any>()` | typing only |
| SCSS (Bootstrap variables, `!important` focus outline) | `SearchableDropdownField.css`: focus ring as a box-shadow on the `--admin-*` tokens | the shell has no Bootstrap; react-select's `outline: 0 !important` rules out an outline |

Outside the pilet, the shell's `encodeSubmission` now posts an option object's `value`, so
`ViewerMembers[]=3` is sent whether or not the field was touched.

## Dormant or stubbed

- The bubbling `change` event and `no-change-track` class feed the legacy PageForm change tracker,
  which the shell does not have; kept to keep the file recognisable, harmless
- `noOptionsMessage` reads its argument as a string but react-select passes `{ inputValue }`, so the
  "Type to search" message never shows; a legacy bug, kept
- Dropped legacy styling: hidden indicators in lazy-load mode, option borders, multi-value chip styling
- No translations, no Injector transforms (nothing can wrap this field the way `Injector.transform` could)
- A failed search (for example a 400 on a stale CSRF token) shows no message, as before

## Shared patterns package

The pilet first shipped its own copy of the shell's field holder (markup and CSS, 106 lines). It now
imports `FieldHolder` from `@silverstripe/admin-patterns`, which the shell shares through its import
map; the built pilet lists the package as a SystemJS dependency and contains none of its code.

| | Before | After |
|---|---|---|
| `client/dist/pilet/index.js` | 96,338 bytes (33,205 gzip) | 95,920 bytes (33,064 gzip) |
| `client/dist/pilet/main.css` | 625 bytes | 295 bytes |
| Source lines under `src/` | 423 | 365 |

The copy (`src/FieldHolder`, 106 lines) is gone; the adapter that stays (`src/legacy/fieldHolder.tsx`,
35 lines) only maps props. The legacy file gained 19 lines for the typed schema props. Most of the
bundle is react-select and emotion, so the byte saving is small; the line count is the measure.

## TreeDropdownField

Legacy source: `client/src/components/TreeDropdownField` and the `client/src/state/treeDropdownField`
Redux slice in this repo. Registered as `TreeDropdownField`; on the file edit form it draws ParentID and,
through `TreeMultiselectField`, ViewerGroups and EditorGroups.

| Legacy | Lines | Pilet | Lines | Out | In |
|---|---|---|---|---|---|
| `TreeDropdownField.js` | 889 | `src/TreeDropdownField/TreeDropdownField.tsx` | 834 | 105 | 50 |
| `treeUtils.js` | 98 | `src/TreeDropdownField/treeUtils.ts` | 141 | 2 | 45 |
| `TreeDropdownFieldReducer.js` (plus 72 lines of actions, 8 of action types) | 181 | `src/legacy/treeDropdownFieldState.tsx` | 118 | 148 | 85 |
| `lib/castStringToElement.js` | 78 | `src/legacy/castStringToElement.tsx` | 32 | 53 | 7 |
| `TreeDropdownField.scss` | 138 | `src/TreeDropdownField/TreeDropdownField.css` | 88 | 109 | 59 |

Survived: the component body (tree loading, search with flat list, breadcrumbs, multi-select, the
`unchanged` sentinel, keyboard handling, react-select props), the tree helpers, the reducer cases and
action creators.

| Legacy | Pilet | Why |
|---|---|---|
| Redux slice keyed by field id, react-redux `connect` | `connectTreeDropdownField`, a `useReducer` per field with the legacy cases | no store in the shell; nothing outside the field read its tree |
| `url.parse`/`url.format` fetch URL | `treeFetchUrl()` in `treeUtils.ts` over `URL` | Node's `url` is not polyfilled by webpack 5 |
| `isomorphic-fetch` default for the `fetch` prop | a wrapper around `window.fetch` | the component calls it as a method of props, which the browser's fetch rejects |
| `@emotion/styled` div for breadcrumbs | a plain div with react-select's class names | `@emotion/styled` dropped; react-select's own emotion cache stays |
| reactstrap `Input` | `input` with the holder's `aria-labelledby` | no reactstrap |
| `TreeDropdownFieldNode.js` (PropTypes only) | a `TreeDropdownFieldNode` type in `treeUtils.ts` | TypeScript |
| `PropTypes` | `TreeDropdownSchema` for the schema-level props | typed through `FormField<P>` |
| `mapHighlight` from `lib/castStringToElement` | only that function, copied | the rest of the file is unused here |

Added: an `aria-label` on the button that opens a node's children.

## UsedOnTable

Legacy source: `client/src/components/UsedOnTable` in this repo. Registered as `UsedOnTable`.

| Legacy | Lines | Pilet | Lines | Out | In |
|---|---|---|---|---|---|
| `UsedOnTable.js` | 127 | `src/UsedOnTable/UsedOnTable.tsx` | 125 | 22 | 20 |
| `provideUsedOnData.js` | 96 | `src/UsedOnTable/provideUsedOnData.tsx` | 65 | 85 | 54 |
| `UsedOnTable.scss` | 82 | `src/UsedOnTable/UsedOnTable.css` | 66 | 52 | 36 |

Survived: the table body, ancestors and links, the empty and error messages.

| Legacy | Pilet | Why |
|---|---|---|
| `usedOn` Redux slice (`state/usedOn`) and its `isomorphic-fetch` call | component state and `loadUsedOn()` over the browser `fetch` | no store in the shell |
| waits for its tab (`useTabContext`) | fetches on mount | the shell's tabs keep inactive panels mounted and offer no tab context |
| `Loading` component | the loading text | no admin internals in pilets |
| Bootstrap `table` class | `used-on__table` styles on `--admin-*` tokens | no Bootstrap |
| `colSpan="3"` on the message row | `colSpan={2}` | the table has two columns |
| `PropTypes` | TypeScript interfaces | typing only |
| `i18n.inject` | added to the i18n stand-in, fills `{name}` placeholders | the load error message names the cause with it |

## FocusPointField

Legacy source: `jonom/focuspoint` `client/src/components` (installed under `vendor/jonom/focuspoint`).
Carried in this pilet under `src/focuspoint/` until that module ships a pilet. Registered as
`FocusPointField`.

| Legacy | Lines | Pilet | Lines | Out | In |
|---|---|---|---|---|---|
| `FocusPointField.jsx` | 115 | `FocusPointField/FocusPointField.tsx` | 85 | 82 | 52 |
| `FocusPointPicker.jsx` | 70 | `FocusPointField/FocusPointPicker.tsx` | 84 | 17 | 31 |
| `styles/main.scss` | 82 | `FocusPointField/FocusPointField.css` | 74 | 69 | 61 |

`focusPoint.ts` (27 lines) holds the picker maths moved out unchanged so it can be unit tested.

| Legacy | Pilet | Why |
|---|---|---|
| `inject(['FieldGroup', 'FocusPointPicker'])` | direct import of the picker, `FieldHolder` from `@silverstripe/admin-patterns` | no Injector |
| redux-form `onAutofill` for the X and Y fields | the shell's `autofill(name, value)` field prop | the shell form owns the values |
| debug inputs cloned with their own change handlers | the X and Y child fields drawn with `renderFields` | they are bound form fields already |
| `componentWillReceiveProps` | `getDerivedStateFromProps`, plus `componentDidUpdate` for a refetched schema | removed lifecycle; a save can move the saved point |
| inline `style` on the marker | custom properties in rem | no inline layout values |
| `PropTypes` | `FocusPointState` for the schema data | typing only |

Added: the preview image's `alt` is the tooltip text. Not ported: `styles/debug.scss` (37 lines).

## PreviewImageField

Written fresh, not ported: asset-admin's source is not installed (its package ships `client/dist`
only). Carried under `src/asset-admin/` until asset-admin ships a pilet. Registered as
`PreviewImageField`. 59 lines plus 45 lines of CSS.

Read-only: the preview linking to the full file, the filename, and a status when the file is missing or
has no preview. The cache-busting `vid` parameter is kept. The legacy component is mostly the replace
flow (a dropzone posting to `data.uploadFileEndpoint`, progress and undo in Redux), which is not built.
The field posts nothing either way.

## Written fresh in the patterns package

PopoverField and UnsavedChangesIndicator are not ports. They live in `client/patterns` (64 and 63
lines, 45 and 21 lines of CSS) because neither knows anything about FormSchema. The indicator shows as
soon as the form is dirty and adds the elapsed minutes at the schema's notice and warning thresholds;
the legacy one waits for the first threshold.

## After the review fixes

The CSS line counts above are as ported and still stand, apart from `FocusPointField.css` (74 to 59
lines): the marker is placed in percentages of the image box, so it no longer depends on the root font
size, and the gradient and overlay shadow with their literal colours are gone. react-select and its
emotion cache stay as they are until the headless combobox replaces them (scorecard work item 29). The
focus point overlay is a slider: arrow keys nudge the point by 0.1 (Shift 0.01) and announce X and Y.
Tab with a react-select menu open selects the focused option, as in the legacy admin, which leaves
`tabSelectsValue` at its default. The usage table fetches when it first has a rendered box, so a
hidden tab costs no request.

## Headless combobox (work item 29)

SearchableDropdownField and TreeDropdownField render the patterns package's `Combobox` instead of
react-select, so react-select, emotion and `EmotionCssCacheProvider` left the pilet bundle (117,789 to
28,529 bytes, 39,092 to 9,377 gzip). Both keep their value shapes and posted values. Tab with the list
open now closes it without choosing, unlike react-select. TreeDropdownField's tree steps are the left
and right arrows on the active option and, for a pointer, the breadcrumb row and the arrow beside a
node with children; neither is a button inside an option any more.
