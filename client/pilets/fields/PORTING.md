# Porting notes: fields pilet

Legacy source: `silverstripe/silverstripe-admin` branch 3, `client/src/components/SearchableDropdownField`.
Registered as `SearchableDropdownField`, the schema component name both `SearchableDropdownField` and
`SearchableMultiDropdownField` send.

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
| `components/FieldHolder` HOC | `src/FieldHolder/FieldHolder.tsx` | maps `FieldComponentProps` to the flat FormBuilder props and draws label, description, message; the shell's own holder is not exposed |
| `containers/EmotionCssCacheProvider` | `src/legacy/EmotionCssCacheProvider.tsx`, cache in a module variable instead of `window.ssReactSelectCache` | pilet-scoped, no global |
| `FormConstants.CSRF_HEADER` | `CSRF_HEADER` exported by the Backend shim | one constant was all it held |
| `url.parse`/`url.format` | `new URL(optionUrl, document.baseURI)` | Node's `url` is not polyfilled by webpack 5 |
| `PropTypes` | a TypeScript props interface | the pilet is TypeScript; prop-types dropped as a dependency |
| `createRef()` | `createRef<any>()` | typing only |
| SCSS (Bootstrap variables, `!important` focus outline) | `SearchableDropdownField.css`: focus ring as a box-shadow on the shell's tokens | the shell has no Bootstrap; react-select's `outline: 0 !important` rules out an outline |

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
