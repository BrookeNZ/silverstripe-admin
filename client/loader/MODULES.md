# Client modules and entries

A module is a Composer package. A client entry is a JavaScript file a module ships, an ES module the admin page loads in
the browser, exporting a `setup` function the loader calls once, with an `admin` object as its argument. This page is
for a module author. The path from request to `setup` is in [IMPORT-MAP.md](IMPORT-MAP.md); the package in
[README.md](README.md).

## Writing a module

```ts
import { clientConfig } from '@silverstripe/admin';
import type { AdminApi } from '@silverstripe/admin';

export function setup(admin: Readonly<AdminApi>): void | Promise<void> {
  console.log(admin.entry.name, admin.entry.module, clientConfig().adminUrl);
}
```

`setup` receives `admin`, a deep-frozen object with one read-only property: `entry`, the entry's list item
(`ClientEntry`: `name`, which is `<module>/<entry>`, and `module`, the Composer name of the module that ships the
entry). It may return a promise; the loader waits for it before setting up the next entry (see *When
something fails*). The page's body is empty, so an entry that renders appends its own element to it and renders there,
with `createRoot` from `react-dom/client` for React. Appending to the body is interim, until the admin's layout offers
places to render.

An entry imports the shared packages by their bare names ([IMPORT-MAP.md](IMPORT-MAP.md), *Shared files*), and the
page's import map resolves them to the admin's single copies. It can also import another entry by name, and a
library another module provides (see *Shared libraries*). Anything else it uses, it bundles. Any bundler that writes
ES modules will do, and a hand-written file with a `setup` export is a valid entry when it is plain JavaScript that
imports only specifiers in the map; a file with JSX or TypeScript, or one importing an npm package the map does not
provide, needs a build.

`@silverstripe/admin` is a file in the import map, beside React. It exports one function for entries:

- `clientConfig()`: the client config the page carries (`LeftAndMain::getCombinedClientConfig()`: `sections`,
  `baseUrl`, `absoluteBaseUrl`, `adminUrl`, the CSRF token under its own name, `environment` and `debugging`),
  deep-frozen, and the same object for every entry. The loader reads it before importing any entry, so an entry
  may call it anywhere, its top level included. The CSRF token in it is the value at page load; a request helper
  that owns the live token is still to come. `adminUrl` is the admin's route relative to the base URL, `admin` by
  default, with no leading or trailing slash, so an entry appends it to `baseUrl`, which always ends in `/`, or joins
  it to `absoluteBaseUrl`, which ends in `/` only when `Controller.add_trailing_slash` is on. A site that turns off
  `SSViewer.enable_base_tag` gets `adminUrl` with the base URL already in front, and `Controller.add_trailing_slash`
  adds a trailing slash to it.

`admin` is the entry's handle for the admin's registration APIs, which are still to come; it stays valid after an
`await`, and `setup` may receive further arguments after it.

The types are exported from the same specifier (`AdminApi`, `ClientEntry`, `EntrySetup`, `ClientConfig`, `Section`);
import them with `import type`. An entry's own tests resolve the package's `runtime.js`, where `clientConfig()` throws
until something sets it (see *Testing a module*).

## Declaring a module

A module is declared under `SilverStripe\Admin\Client\ClientRegistry.modules`, keyed by its Composer package name, with its
client entries nested under it, in a config file such as `_config/client.yml`. This declaration is what replaces
`LeftAndMain.extra_requirements_javascript` and `extra_requirements_css`: the chrome page loads no `Requirements` at
all, so a script a section used to add that way reaches the admin only as an entry, and a stylesheet only through a
`css` key (see *Module CSS*). The `expose` block in `composer.json` stays: it is what makes the module's built files
public. The project's own entries go under the root package's name, the `name` in the root `composer.json`.

```yaml
---
Name: mymodule-client
---
SilverStripe\Admin\Client\ClientRegistry:
  modules:
    vendor-name/module-name:
      entries:
        main:
          link: 'vendor-name/module-name:client/dist/main/index.js'
          css: 'vendor-name/module-name:client/dist/main/main.css'
```

**Names.** A module key is `vendor/name`: exactly one `/`, between a vendor and a name, no `@` scope, and bare as
*Shared libraries* describes, so single words and `@` scopes stay free for shared files and `imports` keys. An entry
key is one segment of letters, digits, `.`, `_` and `-`, starting with a letter or digit. The entry's import map name,
which the loader imports it by and the list item carries, is `<module>/<entry>`: `vendor-name/module-name/main` above.
A module or entry that breaks a rule is left out with a warning. A module or entry that is not a map is left out with
a warning too. In dev, a key the tables below don't list is logged with a warning naming it, which catches a misspelt
key such as `require`, and so is a module key that names no installed Composer package, which would otherwise turn
nothing off when it carries `enabled: false`; the module is still listed, since its files may live outside the package
that names them.

**Module keys**

| Key | Meaning |
|---|---|
| `entries` | A map of entry key to the entry's keys, below. Anything but a map with named keys leaves the module out with a warning. A module with no entries and some `imports` is a library package (see *Shared libraries*) |
| `imports` | A map of bare specifier to a link of the same forms as an entry's `link`: libraries the module adds to the import map (see *Shared libraries*). Anything but a map with named keys leaves the module out with a warning |
| `requires` | A list of bare specifiers the module's entries import from the map and do not bundle, another entry's name included when one imports it by name. Anything but a list leaves the module out with a warning |
| `enabled` | `false` drops everything the module adds to the admin: its entries, their stylesheets and its imports. This is how a later config fragment removes a module, since YAML merging cannot unset a key. Any other value, even `1` or the quoted string `'true'`, leaves the module out with a warning |

**Entry keys**

| Key | Meaning |
|---|---|
| `link` | Required for a client entry. A `vendor/package:path` link, a path relative to the project root (for the project's own files, see below), or a URL (`http://`, `https://`, `//` or a path starting with `/`). A value that is not a string (such as `5`), a file link with a `..` segment, to a file that does not exist, or to a file the site does not serve (see below), skips the entry with a warning; the module's `imports` stay |
| `css` | A stylesheet, a link of the same forms as `link`, with the same cache-busting query. There is no default file: an entry with no `css` has no stylesheet. A missing file, a `..` segment, a file the site does not serve or a value that is not a link drops the stylesheet with a warning, and the entry still loads. An entry with `css` and no `link` is a stylesheet entry. See *Module CSS* |
| `enabled` | `false` drops that entry and its stylesheet and leaves the module's other entries and imports alone. Any other value drops the entry with a warning |

An entry takes no `imports` or `requires`, which belong to its module; setting one leaves the entry out with a warning
naming the module. An entry with neither `link` nor `css`, or with a `link` that is present but empty (as a later config
fragment leaves it when it clears the link), is left out with a warning; set `enabled: false` to turn an entry off. An
entry set to `null` (`main: ~`) is dropped without a warning, as config merging leaves it. A module set to `null` is
left out with a warning that points at `enabled: false`.

**Order.** Entries are listed, and their stylesheets linked, module by module in the order the modules were first
declared, and within a module in the order its entries were first declared. A later config fragment that adds an entry
to a module declared earlier puts it among that module's entries, not after the modules declared since. Entries
that load together run `setup` in this order.

Two config fragments that declare one module merge as Silverstripe config does: a later fragment's value replaces an
earlier one key by key, entries and imports are added to the earlier map, and its `requires` to the earlier list.

A project's own file is given by its path from the project root, and is accepted only where the site serves it. A
path under `public/` is served from the web root as it is, so `link: 'public/my-module/index.js'` is served as
`/my-module/index.js`. Any other (such as one under `app/`) is served from its copy under `public/_resources/`, which
exists only once the root `composer.json` lists its folder in `extra.expose` and `composer vendor-expose` has run. A
`link`, `css` or `imports` path with neither is handled as a missing file is, with a warning that names both steps.
The simplest route for an entry in the project itself: build it to a folder under `public/`, declare `link`, `css`
and `imports` paths starting `public/` under the root package's name, and run `vendor/bin/sake flush`.

A `vendor/package:path` value for `link`, `css` or an `imports` entry is served from its copy under
`public/_resources/`, so its folder must be in `extra.expose` and `composer vendor-expose` must have run; a file with
neither is left out with the same warning.

A file's URL carries the framework's modification-time `?m=` query, so a rebuilt file gets a new URL; a link given
as a URL is used as it is. A URL may name another origin (`https://host/...` or `//host/...`), as
`extra_requirements_javascript` could, and the admin then loads whatever that origin serves, under the page's nonce;
an entry or `imports` file there must be served with CORS headers, a stylesheet need not.

Warnings are logged when a browser loads an admin page, not on flush, and a stock site discards them until the
project gives the logger a handler (see [IMPORT-MAP.md](IMPORT-MAP.md), *Warnings*).

## Module CSS

The page writes a `<link rel="stylesheet">` in the head for each stylesheet, in config order, before the loader runs,
so the styles apply before any `setup`. Each link carries the page's nonce. A stylesheet a bundler extracts from a
CSS import in an entry's JavaScript is a separate file the built JavaScript never references, so it loads only
when the entry's `css` names it.

- **A client entry's stylesheet** is linked when the entry is in the page's entry list. Its link carries
  `data-entry="<module>/<entry>"`, and when the entry fails to load (see *When something fails*) the loader removes it,
  so a broken entry's styles do not linger.
- **A stylesheet entry** has a `css` and no `link`, and is the replacement for `extra_requirements_css`. It is
  not a client entry: it adds nothing to the import map or the entry list, and its key is not a specifier. Its link has
  no `data-entry`, so the loader never removes it.

```yaml
SilverStripe\Admin\Client\ClientRegistry:
  modules:
    acme/admin-theme:
      entries:
        theme:
          css: 'acme/admin-theme:client/dist/theme.css'
```

Stylesheets always load after the admin's own, so an entry's rule beats an admin rule of equal specificity
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

A module can provide a library that others import by a bare specifier, downloaded once and shared by every importer.
`imports` and `requires` belong to the module, not to one of its entries:

```yaml
SilverStripe\Admin\Client\ClientRegistry:
  modules:
    acme/dates:
      imports:
        '@acme/dates': 'acme/dates:client/dist/dates.js'
      entries:
        main:
          link: 'acme/dates:client/dist/index.js'
          css: 'acme/dates:client/dist/dates.css'
    acme/calendar:
      requires:
        - '@acme/dates'
      entries:
        main:
          link: 'acme/calendar:client/dist/index.js'
```

- Each `imports` path gets a `link`'s forms and cache-busting query; a value that is not a string, a missing file, a
  `..` segment or a file the site does not serve leaves that specifier out with a warning.
- A module's imports survive a broken entry: an entry whose file is missing or fails to load does not take the module's
  libraries out of the map. They go only with the module, when it is disabled or left out whole.
- Any module may add bare specifiers, scoped or not. Choosing a scope for a library, such as `@acme/` for the
  `acme` packages, is a convention; nothing checks it.
- Specifiers and `requires` values must be bare, since any other would remap a URL, a path or a whole
  prefix in the map: no whitespace or control characters (a browser strips them from a map key), no byte that is
  not UTF-8 (the page's JSON encoder would substitute it, so two keys could reach the browser as one), no URL scheme,
  `/`, `./` or `../` prefix, and no trailing `/` on an `imports` specifier.
- A **library package** (`acme/dayjs: { imports: { dayjs: 'acme/dayjs:dist/dayjs.js' } }`) is a module with
  `imports` and no entries: a Composer package giving one npm library to the map. It has no `setup` and nothing is
  listed for it.
- One specifier has one owner, whether it is a shared file, a client entry's name or an `imports` key. A specifier
  claimed twice (two modules' `imports`, an `imports` key that is another module's entry name, or an `imports` key
  `@silverstripe/admin`) is a configuration error: in dev it throws a `RuntimeException` naming every claimant;
  elsewhere it is logged as an error and every claim is dropped (an entry whose name is claimed is dropped whole), while
  a shared file keeps its specifier. Entries importing a dropped specifier fail in the browser. Any other rule broken
  drops the offending module, entry or specifier with a logged warning, and the rest of the admin runs.
- A module whose entries import a library lists it under `requires`, keeps it external in its build, and requires the
  providing package in `composer.json`, whose docs say which library version each of its majors supplies. In dev, a
  `requires` specifier nothing in the map provides is warned about while any of the module's entries is listed.
- An external library has no types unless the module gives it some: a `.d.ts` file with
  `declare module '@acme/dates' { ... }`, or, when the module provides the library itself, a `compilerOptions.paths`
  entry mapping the specifier to its source, such as `"@acme/dates": ["./src/dates.ts"]`. A providing package may
  ship types to install instead.

## Permissions

The entry list is written into the page for a member the section being served lets in (its `canView()`). Every
entry in it is listed for every such member. Listing decides what loads, not who can fetch the files, which are
public; a module's server endpoints check permissions themselves.

## When something fails

- A client entry that fails to import (a 404, a network error, a syntax error), exports no `setup`, or whose `setup`
  throws or rejects gets one console error, `The client entry "<name>" failed to load`, with the cause, and the other
  entries still run. It is not fetched again until the page reloads, and its stylesheet link is removed.
- The loader starts every listed entry's import at once, then calls each `setup` in list order as soon as that
  entry's import arrives, waiting for a returned promise before the next. There is no timeout: an entry whose import
  or `setup` never settles holds back every entry after it, and an entry held back that way is never reported.
- Every stylesheet is linked before the loader script, and the browser runs no module script while a stylesheet
  before it is still loading, so a stylesheet that never finishes loading holds back the loader and every entry.
- A name listed twice (two items from `updateEntries` naming one entry) keeps its first item; the later one is left
  out with a logged warning, and the order `updateEntries` leaves decides which wins. An item that names no entry in
  the import map, or whose module is not a module name, is left out with a logged warning. The loader loads the list
  as the page carries it, dropping only an item with no name, and checks none of this again.
- A page without its client config logs `The admin could not start` and loads no entry. An entry list that is
  missing or not a JSON list logs `The page entry list is missing or not a JSON list` and loads no entry. A loader
  that is not built is logged on the server in dev.

## Building a module

`@silverstripe/admin` (`client/loader`) is not on npm. The Composer dist carries the package ([README.md](README.md)),
so a module links it by `file:` path into any install of the admin, from the project root with:

```sh
npm install -D file:vendor/silverstripe/admin/client/loader
```

A module in its own repository links it the same way, so it needs silverstripe/admin installed there, as a Composer
dev requirement.

A `file:` link installs none of the package's devDependencies, so the module installs its own bundler, and
`typescript`, `react`, `react-dom`, `@types/react` and `@types/react-dom` for types and tests only: React pinned to the
exact versions `sharedVersions` in `@silverstripe/admin/shared` gives, which the shared files are built from, and the
types at the same major. React 19 ships no types of its own, so `tsc` needs the two `@types` packages, and Vite's own
types need `@types/node` when `tsc` checks the Vite config. The package's `peerDependencies` name only the major,
`^19.0.0`. Once the package is linked, this prints the versions:

```sh
node --input-type=module -e "import { sharedVersions } from '@silverstripe/admin/shared'; console.log(sharedVersions)"
```

Then install with React at the versions it prints, which the line below gives for this release; for example, with npm
(`-E` saves the exact versions):

```sh
npm install -D -E vite@7 typescript@5 react@19.3.0 react-dom@19.3.0 @types/react@19 @types/react-dom@19 @types/node@24
```

A `tsconfig.json` for the `acme/dates` module above, for example, with the `paths` entry for the library it provides
(see *Shared libraries*):

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "paths": { "@acme/dates": ["./src/dates.ts"] }
  },
  "include": ["src"]
}
```

Build with any bundler that writes ES modules, keeping external the shared specifiers and every specifier the
module imports from the map. The specifier list is `sharedSpecifiers` in `@silverstripe/admin/shared`; it and the
types are all a build takes from the admin, which ships no generator or build preset. The loader itself builds with
webpack 5, and the example below is for Vite 7. Vite's app build drops an entry's exports, `setup` included, so a
module builds in library mode. In library mode Vite 7 names an ES file `.mjs` unless the module's `package.json` sets
`"type": "module"` (`npm pkg set type=module`), so set it, or the YAML's `.js` links point at missing files. Vite also
writes one stylesheet for all the entries, named by `cssFileName`. A Vite config for the `acme/dates` module above,
which provides `@acme/dates` from its own `src/dates.ts` and writes `dist/index.js`, `dist/dates.js` and
`dist/dates.css` under `client/`, for example:

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

An entry that imports another entry by name marks that name external too, since a bundler would otherwise try to
resolve `acme/dates` as the npm package `acme`.

A module that bundles a shared package gets a second copy, which shares no hooks or context with the page's React
and none of the loader's state in `@silverstripe/admin`.

Commit the built folder and list it in `extra.expose` in the `composer.json` of the package that holds it, so
`vendor-plugin` publishes it: a module package's own, or the project's root one for a module outside `public/`.

## Testing a module

Only the loader can set the client config, so in a module's own tests `clientConfig()` throws, and a module that calls
it at its top level cannot even be imported. Mock the package with a stub config. Vitest hoists `vi.mock` above the
imports, so the module under test loads with the stub:

```ts
import { vi } from 'vitest';

vi.mock('@silverstripe/admin', () => ({
  clientConfig: () => ({
    sections: [],
    baseUrl: '/',
    absoluteBaseUrl: 'http://localhost/',
    adminUrl: 'admin',
    environment: 'dev',
    debugging: false,
  }),
}));
```

`clientConfig()` is the only runtime export an entry uses, so the stub needs nothing else. Add the fields the module
reads, the CSRF token under its name included.

## Development loop

Rebuild a module with its bundler's watch mode, or the loader and shared files with `npm run watch` in
`client/loader` of a git checkout of the admin, and reload: the registry reads file times on every request. A YAML
or PHP change needs `vendor/bin/sake flush`.

### Dev override

To load an entry from a dev server rather than its committed build, set `SS_ADMIN_ENTRY_DEV_URLS` in the site's
`.env`. It is read on every request, so no flush is needed, and the committed build must still exist, because an
entry with no build is dropped before the override is applied:

```sh
SS_ADMIN_ENTRY_DEV_URLS="vendor-name/module-name/main=http://localhost:8080/index.js http://localhost:8080/main.css"
```

- Pairs are separated by commas (so no URL may contain one): a listed entry's name, `<module>/<entry>`, its file's URL and,
  after a space, an optional stylesheet URL. With one, the page links it in place of the entry's committed
  stylesheet, or adds one when the entry has no `css`; without one, the committed stylesheet stays.
- It applies only in `dev`; anywhere else it is ignored with a logged warning. Every URL must be absolute `http://`
  or `https://`; a pair with any other URL, or naming an entry no module configures, is ignored with a warning.
- It applies to every member who opens the admin on that site, not only the developer, so set it only on a dev site
  others cannot reach.
- The override replaces the entry's URL in the import map, so the loader, which imports the entry by name, and any
  entry importing it by name get the dev server's copy.
- The dev server must answer cross-origin requests with CORS headers, since the page imports the entry with
  `import()`. A nonce-only policy needs no origin for it, since the import inherits the loader's nonce and PHP writes
  the same nonce on the stylesheet link ([IMPORT-MAP.md](IMPORT-MAP.md), *Content Security Policy*); a live-reload
  socket needs `connect-src`.
