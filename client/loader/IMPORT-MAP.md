# The admin page and its import map

How a browser request to an admin section becomes a page that loads client modules: what PHP writes, what the
loader does with it, how React is shared, what a Content Security Policy must allow, and the decisions behind the
design. For writing a module, see [MODULES.md](MODULES.md).

## From request to setup

1. **The navigation test.** `LeftAndMain::isChromeNavigation()` (`code/LeftAndMain.php`) tells a browser page load
   from a data request. A request is a navigation when it is a `GET`, is not XHR (`isAjax()`), sends neither
   `X-Pjax` nor `X-Formschema-Request`, and its last URL segment, or the one before a trailing record ID, is not in
   `LeftAndMain.server_url_segments` (`printable`, `print` and `export` by default), and then:
   - when the browser sends `Sec-Fetch-Dest`, it is `document` and `Sec-Fetch-Mode` is absent or `navigate`;
   - otherwise the `Accept` header takes `text/html` or `application/xhtml+xml` with a quality above 0 and no lower
     than any JSON type (`*/json`, `*+json`). Wildcards count as neither, so `Accept: */*` is a data request.
2. **Routing.** On a navigation, `init()` adds none of the legacy requirements. `LeftAndMain::handleRequest()` runs
   `init()`, then renders the chrome page with `renderChrome()` unless `init()` has already redirected or refused,
   before any URL rule or action lookup, so every URL under a section gets the same page and a client route with no
   server action, even one named `run` or `doinit`, neither 404s nor 403s. Section access is still `canView()` in
   `AdminController::init()`, and section-wide access belongs in `canView()` or a section's `init()`: on a navigation
   no `url_handlers` rule, action, `allowed_actions` check or `handleAction()` override runs, so
   `getCombinedClientConfig()` sees only the params `AdminRootController` matched against the section's `url_rule`,
   and a section's config must not key off params its `url_handlers` would set. The reports module's `ReportAdmin`
   refuses an unknown report (404) or one the member cannot view in `handleAction()`, so a navigation to either gets
   the chrome page, which holds no report data, and only a data request gets the refusal. `ModelAdmin::init()` treats
   an unknown model segment as the landing tab on a navigation, since it may be a client route.
3. **The page.** `renderChrome()` builds the client config (`getCombinedClientConfig()`) first, since that
   instantiates section forms that add requirements, then clears every requirement and renders `ChromePage`
   (`code/Client/ChromePage.php`) with `templates/SilverStripe/Admin/Client/ChromePage.ss` into the controller's
   response, so headers set during `init()`, such as a policy header, stay on the page. The section controller is
   the page's failover, so `$Title` and `$Locale` are the section's. In the head, in order:
   - the import map, `<script type="importmap">`, from `ImportMap::getMap()`: the shared files, then each module's
     name and each library from `ModuleRegistry::getImports()` (see *Modules and libraries in the map*);
   - `<link rel="modulepreload">`, from `ChromePage::ModulePreloads()`: the loader's `main.js`, then `shared/admin.js`,
     then the other shared files only when the page lists at least one module, then each listed module, each at the
     URL the map gives it;
   - `<link rel="stylesheet">`, in config order, for each listed module with a `css`, carrying
     `data-module="<name>"`, and for each stylesheet-only entry or library package with a `css`, with no
     `data-module` ([MODULES.md](MODULES.md), *Module CSS*). PHP writes these links; the module list does not carry
     them. The browser runs no module script while a stylesheet before it is loading, so a stylesheet that hangs holds
     back the loader;
   - the module list as JSON in `#ss-admin-modules`, from `ModuleRegistry::getModuleItems()`, and empty for a member the
     section's `canView()` refuses. Each item is `{name, specifier}`. The list travels in the page, there is no
     separate module endpoint, and an item carries no version: a file's URL carries its modification time. A later
     item of a name listed twice is ignored ([MODULES.md](MODULES.md), *When something fails*);
   - the client config as JSON in `#ss-admin-config`;
   - the loader, `<script type="module">`, when `main.js` is built; in dev a missing one is logged.

   The client config is encoded once, in `getCombinedClientConfig()`, and the import map and module list by
   `ChromePage`, each with `JSON_HEX_TAG`, so no value can close its element. The body is empty.
4. **The loader** (`client/loader/src/index.ts`, built to `client/dist/loader/main.js`) reads the config and module
   list, imports every listed module by its specifier with `Promise.allSettled`, then calls each one's `setup()` with
   its deep-frozen list item in list order, each in a try and catch (failures: [MODULES.md](MODULES.md), *When
   something fails*), removing a failed module's stylesheet link. Importing by specifier makes the map the one source
   of a module's URL, so an override of the module's map URL changes what loads rather than loading a second copy.
   The loader imports `@silverstripe/admin` through the map as modules do, so both share one instance, and claims its
   setter before any module loads.

## Contracts and hooks

The element ids `ss-admin-modules` and `ss-admin-config`, and a module stylesheet link's `data-module`, are a contract
between the template and the loader: renaming one breaks the loader with no server error.

`ModuleRegistry` fires `updateModuleItems(array &$items)` on the module list. It changes what the loader imports, not
the import map, so an item it adds must name a specifier a module or library package adds; any other item is dropped
with a warning. `ChromePage::NonceAttribute()` fires `updateChromeNonce(string &$nonce)` on the section controller.

The public surface is the `ModuleRegistry.modules` YAML and its keys, the `updateModuleItems` and
`updateChromeNonce` hooks, `LeftAndMain.server_url_segments`, `SS_ADMIN_MODULE_DEV_URLS`, and what the
`@silverstripe/admin` package exports for modules: `clientConfig()`, the types and
`@silverstripe/admin/shared` (`claimInternals()` is `@internal`, claimed by the loader). Every PHP class under
`SilverStripe\Admin\Client` except `ModuleRegistry` is `@internal`, as are `ModuleRegistry::getImports()` and
`getStylesheets()` and what the chrome page adds to `LeftAndMain` (`isChromeNavigation()` and `renderChrome()`).

## Shared files

The loader build writes five files to `client/dist/loader/shared/`, one per import map specifier:

| Specifier | File |
|---|---|
| `@silverstripe/admin` | `shared/admin.js` |
| `react` | `shared/react.js` |
| `react/jsx-runtime` | `shared/react-jsx-runtime.js` |
| `react-dom` | `shared/react-dom.js` |
| `react-dom/client` | `shared/react-dom-client.js` |

The list has one source, `client/loader/shared.js`, published as `@silverstripe/admin/shared`, which the shared-file
build (`webpack.shared.config.js`), the loader build and every module build read, so a specifier is external
everywhere or nowhere. Each shared file imports the others by bare name and contains none of their code, so the set
holds one copy of each package. `admin.js` is the admin's own runtime file, built from `client/loader/src/runtime.ts`
and importing nothing; the others are built from the loader package's devDependencies, which pin the exact versions
`sharedVersions` exports. The package's `peerDependencies` name only the major, `^19.0.0`. The loader imports
`admin.js` and none of the others (step 3 gives the preloads).

`client/loader/webpack.config.js` writes `manifest.json` from the files on disk after every build: `shared`
(specifier to file) and `files` (every JavaScript file of the release to its `sha384-` digest). `LoaderAssets`
reads it from `LoaderAssets.release_dir` (`silverstripe/admin:client/dist/loader/`). `ImportMap` takes only plain file
names inside the build folder, and maps each specifier to `<release URL>shared/<file>.js?v=<first 8 hex of its
digest>`, so a rebuilt file gets a new URL. A missing or empty manifest gives an empty map and a logged warning.

React is shared through the map because its hooks and context live in module-level state: a component rendered by
one copy of React cannot use hooks or read context from another. One map gives the page and every module the same
instance, fetched and evaluated once and cached by URL. The admin owns the versions. The map is written once, first
in the head, before any module script or preload, which is the only position every browser accepts, so everything in
it comes from PHP. A package that is neither shared nor provided by a module (below) is bundled by each module that
uses it.

The page loads no import map polyfill, so it needs native import maps and `structuredClone`: Chrome 98, Firefox 108 or
Safari 16.4 at the earliest.

## Modules and libraries in the map

Besides the shared files, `ImportMap::getMap()` writes `ModuleRegistry::getImports()`:

- **One specifier per module**: its name to its `link`'s URL, cache-busting query included. A
  module can import another by name (`import('vendor/name')`) and gets the instance the loader set up, since both
  resolve to one URL.
- **One specifier per library an enabled entry provides** through its `imports` key: a library package's, or a
  module's whose `link` resolves. Each maps to the file's URL with the framework's modification-time `?m=` query a
  `link` gets. Any module can import it by that specifier; the file downloads only when one does, and every
  importer shares one instance.

Both are in the map for every member, whether or not the page lists modules for them. `ModuleEntryChecker` enforces
the bare-name and one-owner rules for every module name and `imports` key, and the `vendor/name` rule for every
module name, before anything is listed ([MODULES.md](MODULES.md), *Shared libraries*).

## Content Security Policy

The page writes a nonce on the import map, every modulepreload, every stylesheet link and the loader's script. It comes
from `updateChromeNonce`; an extension on `LeftAndMain` supplies it for every section, and it must equal the nonce in
the response's policy header, which is the site's to send. With no extension the page writes no nonce attributes.

What a policy must allow:

- `script-src` with the nonce only. It covers the import map, the loader, the shared files and every module:
  `import()` runs with the nonce of the script that calls it, so the modules the loader imports need no origin in the
  policy. The two JSON blocks are data, not scripts. Neither `'unsafe-inline'` nor `'unsafe-eval'` is needed.
- `style-src` with the nonce only. It covers every stylesheet a module or entry names, since PHP writes each link with
  the nonce; no `'self'` is needed. The page writes no `<style>` element and no `style` attribute.
- Do not add `'strict-dynamic'`. Under it a modulepreload with no nonce is allowed, and a module script with the wrong
  nonce for that preloaded URL then runs, so a wrong nonce no longer stops the loader.

A working policy:

```
default-src 'none'; script-src 'nonce-<n>'; style-src 'nonce-<n>'; connect-src 'self'; img-src 'self'; base-uri 'self'; form-action 'self'
```

With a wrong nonce the import map, the loader, the shared files, the modules and the stylesheets are each refused,
and the loader never runs.

The nonce covers only the `<link>` fetch, not what the stylesheet itself loads. Under this policy an `@import` inside
a module stylesheet is refused by `style-src`, a font from `@font-face` needs a `font-src` allowing its origin, and an
image from `url()` on another site needs `img-src` to allow that site.

## Warnings

`ModuleRegistry`, `ModuleEntryChecker`, `ImportMap` and `ChromePage` log every warning (a skipped entry, a missing file,
a dropped module stylesheet, a bad dev override, an item `updateModuleItems` added for an unmapped specifier, a missing
or empty loader manifest, and in dev an unbuilt loader, a `requires` nothing in the map provides or a key in a module's
entry the registry does not read). A warning never stops the page; only a specifier claimed twice does, and only in
dev.

They log to `Psr\Log\LoggerInterface` when a navigation renders the chrome page, not on flush. The framework's
`logging.yml` gives that logger no handler, so a stock site discards every warning until the project adds one, for
example:

```yaml
---
Name: app-logging
After: '#logging'
---
SilverStripe\Core\Injector\Injector:
  Psr\Log\LoggerInterface:
    calls:
      AppLogHandler: [ pushHandler, [ '%$AppLogHandler' ] ]
  AppLogHandler:
    class: Monolog\Handler\StreamHandler
    constructor: [ '/var/log/silverstripe/admin.log', 'warning' ]
```

Use an absolute path the web server can write. A relative path resolves against PHP's working directory, `public/`
under the web server, and a path the server cannot write throws on the first warning and takes the request down with
it. The handler receives every warning and error the logger gets, not only the registry's.

## Decisions

Why import maps and a small loader rather than a micro-frontend framework:

- A module installs a types package rather than a package of the whole app shell with its own install and rebuild
  workflow.
- A module is a native ES module any bundler can write, and a hand-written file is valid, rather than a framework
  format built through the framework's CLI and bundler plugin.
- The shared list and its versions have one source, where a framework resolves a shared bare name to whatever the
  shell exports, unchecked.
- Module authors learn no vocabulary beyond Silverstripe's, and the admin depends on no framework for what is, at the
  loading layer, a few hundred lines.
- Loading uses web platform features only: import maps, `import()`, modulepreload and CSP nonces. One failed module
  does not stop the others.

**No legacy accommodation and no flag.** The legacy client under `client/src` keeps its own React build and is not
loaded by the chrome page; nothing is shared with it, no `window` globals are bridged, and the loader is not injected
into the legacy page. There is no setting to turn the chrome page off: every navigation into a section renders it,
apart from the server URL segments below.

## What still reaches the legacy endpoints

Every request that fails the navigation test (step 1) keeps its legacy action and response: XHR, PJAX and form schema
requests, every non-`GET`, and a `GET` whose `Sec-Fetch-Dest` is not `document`, such as a `fetch()` or an iframe
load. So does a page load whose last URL segment, or the one before a trailing record ID, is one of
`LeftAndMain.server_url_segments`, so print views such as `admin/pages/printable/5` and GridField exports work from a
link. The match is by name only: any admin URL ending in `print` or `export` reaches its server action.

Known gaps:

- An error response to any request that is not XHR and not JSON still renders in the legacy error template
  (`afterHandleRequest()`), for example the 404 that `save()` or `delete()` answers when a form posted without XHR
  names a record that does not exist. A permission failure does not reach it: the member is redirected to a section
  they can view, or to the login form.
