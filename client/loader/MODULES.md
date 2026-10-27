# Client modules

A client module is an ES module the admin page loads in the browser, exporting a `setup` function the loader calls
once, with the module's list item as its argument. This page is for a module author. The path from request to `setup`
is in [IMPORT-MAP.md](IMPORT-MAP.md); the package in [README.md](README.md).

## Writing a module

```ts
import { clientConfig } from '@silverstripe/admin';
import type { ModuleMetadata } from '@silverstripe/admin';

export function setup(module: Readonly<ModuleMetadata>): void | Promise<void> {
  console.log(module.name, clientConfig().adminUrl);
}
```

`setup` receives the module's list item (`ModuleMetadata`: `name` and `specifier`), deep-frozen. It may return a
promise; the loader waits for it before setting up the next module (see *When something fails*). The page's body is
empty, so a module that renders appends its own element to it and renders there, with `createRoot` from
`react-dom/client` for React. Appending to the body is interim, until the admin's layout offers places to render.

A module imports the shared packages by their bare names ([IMPORT-MAP.md](IMPORT-MAP.md), *Shared files*), and the
page's import map resolves them to the admin's single copies. It can also import another module by name, and a
library another module provides (see *Shared libraries*). Anything else it uses, it bundles. Any bundler that writes
ES modules will do, and a hand-written file with a `setup` export is a valid module when it is plain JavaScript that
imports only specifiers in the map; a file with JSX or TypeScript, or one importing an npm package the map does not
provide, needs a build.

`@silverstripe/admin` is a file in the import map, beside React. It exports one function for modules:

- `clientConfig()`: the client config the page carries (`LeftAndMain::getCombinedClientConfig()`: `sections`,
  `baseUrl`, `absoluteBaseUrl`, `adminUrl`, the CSRF token under its own name, `environment` and `debugging`),
  deep-frozen, and the same object for every module. The loader reads it before importing any module, so a module
  may call it anywhere, its top level included. The CSRF token in it is the value at page load; a request helper
  that owns the live token is still to come. `adminUrl` is the admin's route relative to the base URL, `admin` by
  default, with no leading or trailing slash, so a module appends it to `baseUrl`, which always ends in `/`, or joins
  it to `absoluteBaseUrl`, which ends in `/` only when `Controller.add_trailing_slash` is on. A site that turns off
  `SSViewer.enable_base_tag` gets `adminUrl` with the base URL already in front, and `Controller.add_trailing_slash`
  adds a trailing slash to it.

The item `setup` receives is the module's handle for the admin's registration APIs, which are still to come; it stays
valid after an `await`, and `setup` may receive further arguments after it.

The types are exported from the same specifier (`ModuleSetup`, `ModuleMetadata`, `ClientConfig`,
`Section`); import them with `import type`. A module's own tests resolve the package's `runtime.js`, where
`clientConfig()` throws until something sets it.

## Declaring a module

A module is declared under `ModuleRegistry.modules`, keyed by module name, in a config file such as
`_config/client.yml`. This declaration is what replaces `LeftAndMain.extra_requirements_javascript` and
`extra_requirements_css`: the chrome page loads no `Requirements` at all, so a script a section used to add that way
reaches the admin only as a module, and a stylesheet only through a `css` key, a module's or that of an entry with no
`link` (see *Module CSS*). The `expose` block in `composer.json` stays: it is what makes the module's built files
public. A module is named `vendor/name` after its Composer package: the name is also its import map specifier, and the
loader imports the module by it. A module name without exactly one `/` leaves the entry out with the warning `Module
"<name>" is not vendor/name: a module is named after its Composer package, one vendor and one name, so single words stay
free for other owners; the entry was left out`. An entry that is not a map is left out with a warning. A key in a
module's entry that is not in the table is ignored, and in dev logged with a warning naming it, which catches a misspelt
key such as `require`; an entry with no `link` sets only `imports`, `css` and `enabled`, and any other key leaves it out
with a warning. Two config fragments that declare one name merge as Silverstripe config does: a later fragment's value
replaces an earlier one key by key, its `imports` are added to the earlier map, and its `requires` to the earlier list.

```yaml
---
Name: mymodule-client
---
SilverStripe\Admin\Client\ModuleRegistry:
  modules:
    vendor-name/module-name:
      link: 'vendor-name/module-name:client/dist/module/index.js'
      css: 'vendor-name/module-name:client/dist/module/main.css'
```

| Key | Meaning |
|---|---|
| `link` | Required for a module. A `vendor/package:path` link, a path relative to the project root (for the project's own files, see below), or a URL (`http://`, `https://`, `//` or a path starting with `/`). A value that is not a string (such as `5`), a file link with a `..` segment, to a file that does not exist, or to a project file the site does not serve (see below), skips the entry with a warning, and a skipped module provides none of its `imports` |
| `css` | A stylesheet, a link of the same forms as `link`, with the same cache-busting query. There is no default file: an entry with no `css` has no stylesheet. A missing file, a `..` segment, a project file the site does not serve or a value that is not a link drops the stylesheet with a warning, and the module still loads. An entry with `css` and no `link` is a stylesheet-only entry, or a library package when it also has `imports`. See *Module CSS* |
| `enabled` | `false` drops the entry. This is how a later config fragment removes an entry, since YAML merging cannot unset a key. Any other value, even `1` or the quoted string `'true'`, drops the entry with a warning |
| `imports` | A map of bare specifier to a link of the same forms as `link`: libraries the module adds to the import map (see *Shared libraries*). Anything but a map with named keys leaves the entry out with a warning |
| `requires` | A list of bare specifiers the module imports from the map and does not bundle |

A project's own file is given by its path from the project root, and is accepted only where the site serves it. A
path under `public/` is served from the web root as it is, so `link: 'public/my-module/index.js'` is served as
`/my-module/index.js`. Any other (such as one under `app/`) is served from its copy under `public/_resources/`, which
exists only once the root `composer.json` lists its folder in `extra.expose` and `composer vendor-expose` has run. A
`link`, `css` or `imports` path with neither is handled as a missing file is, with a warning that names both steps.

A file's URL carries the framework's modification-time `?m=` query, so a rebuilt file gets a new URL; a link given
as a URL is used as it is. A URL may name another origin (`https://host/...` or `//host/...`), as
`extra_requirements_javascript` could, and the admin then loads whatever that origin serves, under the page's nonce;
a module or `imports` file there must be served with CORS headers, a stylesheet need not.

Warnings are logged when a browser loads an admin page, not on flush, and a stock site discards them until the
project gives the logger a handler (see [IMPORT-MAP.md](IMPORT-MAP.md), *Warnings*).

## Module CSS

The page writes a `<link rel="stylesheet">` in the head for each stylesheet, in config order, before the loader runs,
so the styles apply before any `setup`. Each link carries the page's nonce. A stylesheet a bundler extracts from a
CSS import in the module's JavaScript is a separate file the built JavaScript never references, so it loads only
when the entry's `css` names it.

- **A module's stylesheet** is linked when the module is in the page's module list. Its link carries
  `data-module="<name>"`, and when the module fails to load (see *When something fails*) the loader removes it, so a
  broken module's styles do not linger.
- **A stylesheet-only entry** has a `css` and no `link`, and is the replacement for `extra_requirements_css`. It is
  not a module: it adds nothing to the import map or the module list, and its name is not a specifier, so the name
  rules do not apply. Its link has no `data-module`, so the loader never removes it. A library package may carry a
  `css` the same way. An entry whose `link` is present but empty, as a later config fragment leaves it when it clears
  the link, is left out with a warning, stylesheet included; set `enabled: false` to turn a module off.

```yaml
SilverStripe\Admin\Client\ModuleRegistry:
  modules:
    acme/admin-theme:
      css: 'acme/admin-theme:client/dist/theme.css'
```

Module stylesheets always load after the admin's own, so a module's rule beats an admin rule of equal specificity
(the chrome page links no admin stylesheet yet). Restyling runs on CSS custom properties, never on selectors the
module does not own:

- **A module documents the CSS custom properties it supports**, with what each one sets. They are its styling
  contract with other modules and projects; its class names are not. It names them after itself and never declares
  them: it reads each through a `--local-` copy with its default as the fallback, so a value set on any ancestor
  reaches it:

  ```css
  .acme-calendar {
    --local-bg-color: var(--acme-calendar-bg-color, Canvas);
    background-color: var(--local-bg-color);
  }
  ```

- **To restyle the admin or another module, set the custom properties it documents, on `:root` for every instance
  or on a wrapper for one area; don't select `admin-*` classes or another module's classes.** Since a module never
  declares them, the value applies whichever stylesheet loads first. The admin's stylesheet, once the chrome page
  links one, declares the admin's own custom properties with zero specificity (`:where()`), so a value set on a
  bare `:root` wins in every colour scheme without cascade layers:

  ```css
  :root {
    --acme-calendar-bg-color: LightYellow;
  }
  ```

  Nothing checks these rules yet.

## Shared libraries

A module can provide a library that others import by a bare specifier, downloaded once and shared by every importer:

```yaml
SilverStripe\Admin\Client\ModuleRegistry:
  modules:
    acme/dates:
      link: 'acme/dates:client/dist/index.js'
      css: 'acme/dates:client/dist/dates.css'
      imports:
        '@acme/dates': 'acme/dates:client/dist/dates.js'
    acme/calendar:
      link: 'acme/calendar:client/dist/index.js'
      requires:
        - '@acme/dates'
```

- Each `imports` path gets a `link`'s forms and cache-busting query; a value that is not a string, a missing file, a
  `..` segment or a project file the site does not serve leaves that specifier out with a warning.
- Any entry may add bare specifiers, scoped or not. Choosing a scope for a library, such as `@acme/` for the
  `acme` packages, is a convention; nothing checks it.
- Module names, specifiers and `requires` values must be bare: no whitespace or control characters (a browser strips
  them from a map key), and no URL scheme, `/`, `./` or `../` prefix. A module name also has exactly one `/`, as
  `vendor/name`, and may not start with `@`, and an `imports` specifier may not end with `/`. A module
  named otherwise is dropped with a warning, since its name would remap a URL, a path or a whole prefix in the map;
  `@` scopes and single words are left to shared files and `imports` keys. A library package's name is not a
  specifier either, so it keeps any name.
- A **library package** (`acme/dayjs: { imports: { dayjs: 'acme/dayjs:dist/dayjs.js' } }`) has `imports` and no
  `link`: a Composer package giving one npm library to the map. It has no `setup` and is never listed.
- One specifier has one owner, whether it is a shared file, a module's name or an `imports` key. A specifier claimed
  twice (two entries' `imports`, a module named `react/jsx-runtime`, or an `imports` key `@silverstripe/admin`) is a
  configuration error: in dev it throws a `RuntimeException` naming every claimant; elsewhere it is logged as an
  error and every entry's claim is dropped (a module whose name is claimed is dropped whole), while a shared file
  keeps its specifier. Modules importing a dropped specifier fail in the browser. Any other rule broken drops the
  offending entry or specifier with a logged warning, and the rest of the admin runs.
- A module that imports a library lists it under `requires`, keeps it external in its build, and requires the
  providing package in `composer.json`, whose docs say which library version each of its majors supplies. In dev, a
  `requires` specifier nothing in the map provides is warned about.
- An external library has no types unless the module gives it some: a `.d.ts` file with
  `declare module '@acme/dates' { ... }`, or, when the module provides the library itself, a `compilerOptions.paths`
  entry mapping the specifier to its source, such as `"@acme/dates": ["./src/dates.ts"]`. A providing package may
  ship types to install instead.

## Permissions

The module list is written into the page for a member the section being served lets in (its `canView()`). Every
module in it is listed for every such member. Listing decides what loads, not who can fetch the files, which are
public; a module's server endpoints check permissions themselves.

## When something fails

- A module that fails to import (a 404, a network error, a syntax error), exports no `setup`, or whose `setup` throws
  or rejects gets one console error, `The admin module "<name>" failed to load`, with the cause, and the other modules
  still run. It is not fetched again until the page reloads, and its stylesheet link is removed.
- The loader imports every listed module at once with `Promise.allSettled`, then calls each `setup` in list order,
  waiting for a returned promise before the next. There is no timeout: a module whose import or `setup` never
  settles holds back every module after it.
- Every stylesheet is linked before the loader script, and the browser runs no module script while a stylesheet
  before it is still loading, so a stylesheet that never finishes loading holds back the loader and every module.
- A name listed twice keeps its first item, with a console warning; its stylesheet link follows the same item, so the
  order `updateModuleItems` leaves decides which wins.
- A page without its client config logs `The admin could not start` and loads no module. A module list that is
  missing or not a JSON list logs `The page module list is missing or not a JSON list` and loads no module. A loader
  that is not built is logged on the server in dev.

## Building a module

`@silverstripe/admin` (`client/loader`) is not on npm. The Composer dist carries its `package.json`, `runtime.js`,
`shared.js`, `shared.d.ts`, `types/`, `README.md`, `MODULES.md` and `IMPORT-MAP.md`, so a module links it by `file:`
path into any install of the admin, such as `"@silverstripe/admin": "file:vendor/silverstripe/admin/client/loader"`
from the project root. A `file:` link installs none of the package's devDependencies, so the module installs its own
bundler, and `typescript`, `react`, `react-dom`, `@types/react` and `@types/react-dom` for types and tests only:
React pinned to the exact versions `sharedVersions` in `@silverstripe/admin/shared` gives, which the shared files are
built from, and the types at the same major. React 19 ships no types of its own, so `tsc` needs the two `@types`
packages. The package's `peerDependencies` name only the major, `^19.0.0`. For example, with npm (`-E` saves the
exact versions):

```sh
npm install -D -E vite@7 typescript@5 react@19.3.0 react-dom@19.3.0 @types/react@19 @types/react-dom@19
```

Build with any bundler that writes ES modules, keeping external the shared specifiers and every specifier the
module imports from the map. The specifier list is `sharedSpecifiers` in `@silverstripe/admin/shared`; it and the
types are all a build takes from the admin, which ships no generator or build preset. The loader itself builds with
webpack 5, and the example below is for Vite 7. Vite's app build drops an entry's exports, `setup` included, so a
module builds in library mode. A Vite config for the `acme/dates` module above, which provides `@acme/dates` from its
own `src/dates.ts` and writes `dist/index.js`, `dist/dates.js` and `dist/dates.css` under `client/`, for example:

```ts
import { defineConfig } from 'vite';
import { sharedSpecifiers } from '@silverstripe/admin/shared';

export default defineConfig({
  build: {
    lib: {
      entry: { index: 'src/index.ts', dates: 'src/dates.ts' },
      formats: ['es'],
      cssFileName: 'dates',
    },
    outDir: 'client/dist',
    rollupOptions: { external: [...sharedSpecifiers, '@acme/dates'] },
  },
});
```

A module that imports another module by name marks that name external too, since a bundler would otherwise try to
resolve `acme/dates` as the npm package `acme`.

A module that bundles a shared package gets a second copy, which shares no hooks or context with the page's React
and none of the loader's state in `@silverstripe/admin`.

Commit the built folder and list it in `extra.expose` in the `composer.json` of the package that holds it, so
`vendor-plugin` publishes it: a module package's own, or the project's root one for a module outside `public/`.

## Development loop

Rebuild a module with its bundler's watch mode, or the loader and shared files with `npm run watch` in
`client/loader`, and reload: the registry reads file times on every request. A YAML or PHP change needs
`vendor/bin/sake flush`.

### Dev override

To load a module from a dev server rather than its committed build, set `SS_ADMIN_MODULE_DEV_URLS` in the site's
`.env`. It is read on every request, so no flush is needed, and the committed build must still exist, because an
entry with no build is dropped before the override is applied:

```sh
SS_ADMIN_MODULE_DEV_URLS="vendor-name/module-name=http://localhost:8080/index.js http://localhost:8080/main.css"
```

- Pairs are separated by commas (so no URL may contain one): a listed module's name, its entry file's URL and,
  after a space, an optional stylesheet URL. With one, the page links it in place of the module's committed
  stylesheet, or adds one when the module has no `css`; without one, the committed stylesheet stays.
- It applies only in `dev`; anywhere else it is ignored with a logged warning. Every URL must be absolute `http://`
  or `https://`; a pair with any other URL, or naming a module no entry configures, is ignored with a warning.
- It applies to every member who opens the admin on that site, not only the developer, so set it only on a dev site
  others cannot reach.
- The override replaces the module's URL in the import map, so the loader, which imports the module by name, and any
  module importing it by name get the dev server's copy.
- The dev server must answer cross-origin requests with CORS headers, since the page imports the module with
  `import()`. A nonce-only policy needs no origin for it, since the import inherits the loader's nonce and PHP writes
  the same nonce on the stylesheet link ([IMPORT-MAP.md](IMPORT-MAP.md), *Content Security Policy*); a live-reload
  socket needs `connect-src`.
