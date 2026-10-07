# How a module adds to the admin

What happens between a Composer module and a page in the admin shell, using `silverstripe/admin-hello` as the
worked example: a local module installed
through a Composer path repository. Open `/admin/hello/` to see the result: a "Hello" item last in
the menu, current, and a page titled "Hello" with one paragraph about the module.

The shell is a Piral app instance (`client/shell`). A module contributes a **pilet**: a small JavaScript bundle
that the shell downloads at runtime and hands a Pilet API. The module ships that bundle with its PHP, through
Composer, and registers it with one YAML block. Nothing is published to npm and no build step runs on the
server.

## The parts

| Part | Where, for the hello module | Owned by |
|---|---|---|
| Section | `code/HelloAdmin.php`, a `LeftAndMain` subclass configured in `_config/config.yml` | the module |
| Pilet source | `client/pilet/src/index.tsx` | the module |
| Built pilet | `client/dist/pilet/index.js`, committed | the module |
| Feed entry | `_config/piral.yml` under `PiletFeed.pilets` | the module |
| Feed | `GET /admin/pilets/`, `PiletFeedController` | admin |
| Shell page | `PiralShell.ss`, served for every admin URL while `LeftAndMain.piral_shell` is on | admin |
| Shell bundle | `client/dist/shell/main.js` and `main.css` | admin |
| Pilet API | `client/shell/src/api/silverstripe.ts`, documented in `PILET-API.md` | admin |

A vendor module does the same with its own paths: the elemental pilet lives at
`client/dist/pilets/elemental/index.js` in this repo and its feed entry sits in `_config/piral-elemental.yml`.

## From request to page

1. **The browser asks for `/admin/hello/`.** `LeftAndMain` sees the shell flag on and treats the request as a
   shell navigation: it answers with the shell page whatever the path, so a bookmark or a reload lands on the
   same view (`LeftAndMain::hasAction()` and `handleAction()`, guarded by `isPiralNavigation()`). The page is
   `templates/SilverStripe/Admin/PiralShell.ss`: one `div#ss-admin-shell` carrying the feed URL, the admin base
   URL and the CMS menu as data attributes, plus the shell bundle and the `window.ss.config` script that the
   legacy admin also writes.

2. **The shell boots and fetches the feed.** `client/shell/src/index.tsx` reads `data-feed-url` and calls
   `/admin/pilets/`. The feed needs a CMS session (`CMS_ACCESS`) and answers JSON:

   ```json
   {
     "name": "silverstripe-admin-hello",
     "version": "0.0.0-dev-main+97a9f30",
     "link": "https://example.test/_resources/vendor/silverstripe/admin-hello/client/dist/pilet/index.js?m=1791355521",
     "spec": "v2",
     "requireRef": "webpackChunkpr_silverstripeadminhello",
     "dependencies": {},
     "custom": {},
     "integrity": "sha384-Y9/x..."
   }
   ```

   `PiletFeed` builds each item from the YAML entry and the built file: the `link` becomes an absolute
   `_resources` URL with the file's modification time as a cache buster; `spec`, `requireRef` and
   `dependencies` come from the `//@pilet v:2(...)` header on the bundle's first line; `integrity` is the
   file's sha384. An entry whose file is missing or whose link leaves the project is dropped with a logged
   warning rather than breaking the feed. Modules can adjust the list through the `updatePilets` extension
   hook.

3. **Piral loads each pilet.** The shell's Piral instance downloads every `link` and evaluates it with
   SystemJS. The bundle's `System.register(["react", "react-router-dom"], ...)` header names the shared
   dependencies it wants; SystemJS resolves those from the shell's import map, so a pilet never ships its own
   React. The shared set is part of the Pilet API contract (`PILET-API.md`, **Versioning**).

4. **The pilet's `setup()` runs** with the Pilet API. The section, its menu item, icon and permission come from
   the server, so the hello pilet only claims the section's route:

   ```tsx
   export function setup(app: PiletApi) {
     const section = app.getConfig().sections.find((candidate) => candidate.name === helloAdmin);
     if (!section?.reactRoutePath) {
       return;
     }
     app.registerPage(`/${section.reactRoutePath}/*`, HelloPage);
   }
   ```

   - `getConfig().sections` is the client config every `AdminController` contributes; `reactRoutePath` is its
     `url_segment` relative to the admin. Reading it rather than hard-coding `/hello` keeps the route right when
     a site changes the segment in YAML.
   - `registerPage(path, ...)` adds a client route. Routes are relative to the admin base, so `/hello/*` is
     `/admin/hello/` and everything under it. The shell's router (react-router 6, data router) renders the page
     without a server round trip once the shell is loaded, and the server renders the shell again on a hard
     reload.
   - The page calls `setSectionHeader({ title: 'Hello' })` from an effect and returns the disposer, so the header
     goes when the page unmounts.

   A pilet page with no server section behind it adds its menu link with `registerMenuItem({ code, label, to,
   Icon? })`, which the shell draws like a section item (`PILET-API.md`, **Menu items**).

   Everything a pilet registers is tied to the pilet: Piral records the registrations, and unloading the pilet
   removes them. A second registration of the same name wins and the previous one comes back when it is
   disposed (`registerSilverstripeComponent`).

5. **The shell renders.** Layout, menu, section header and toasts are the shell's. The pilet's page renders in
   the content column. A section URL no pilet has claimed shows "No pilet owns ... yet" instead.

## What a pilet can register

The full list and the props contracts are in `PILET-API.md`. In short:

- **Pages and routes**: `registerPage(path, Component)`, as above. A section pilet claims its section's
  `url_segment` so legacy links and `CMSEditLink()` keep working (`client/pilets/pages` claims `/pages/*`).
- **Form field components**: `registerSilverstripeComponent(name, Component)`. FormSchema sends each field's
  `componentCandidates` (class, declared alias, parent classes); the shell picks the first registered name,
  so a module replaces a field for the whole admin by registering under the field's class name. The fields
  pilet registers `UploadField`, `LinkField`, `TreeDropdownField` and `SearchableDropdownField` this way, and
  the htmleditor pilet registers `TinyMceHtmlEditorField`.
- **Slots**: `registerExtensionComponent(name, slot, Component)` for named slots. `menu.bottom` is legacy.
- **Menu**: `registerMenuItem(item)` for a pilet-only link; a server section is already in the menu.
- **Section header and icons**: `setSectionHeader(header)` and `registerSectionIcon(code, Icon)`.
- **Form hooks and state**: `registerBeforeSubmit(formId, handler)`, `setUnsavedChanges(key, dirty)`, shared
  state and the `silverstripe:records-changed` event.
- **Config**: `getConfig()` is a frozen copy of `window.ss.config`.

Server-side nothing changes for the module's PHP: `getCMSFields()`, FormSchema, permissions and
`url_segment` are read by the shell the same way the legacy admin reads them. A `LeftAndMain` subclass with no
pilet still gets a section, a menu item and its `EditForm` rendered by the shell's form renderer; a pilet is
needed only for behaviour the schema cannot describe.

## Writing one

1. Scaffold from the shell's emulator, which carries the Pilet API types:

   ```sh
   cd client/shell && npm run build:emulator          # dist/emulator/silverstripe-admin-shell-<version>.tgz
   cd /path/to/module/client/pilet
   npx -p piral-cli@1.12.4 pilet new ../../../silverstripe-admin/client/shell/dist/emulator/*.tgz --bundler webpack5 --npm-client npm
   ```

   `pilet.json` selects `@silverstripe/admin-shell` as the instance and `schemaVersion: v2`. The hello module's
   `client/pilet/package.json` is the smallest working example; its `npm run setup` builds the emulator and
   installs. Delete the `integrity` line npm writes for `@silverstripe/admin-shell` in the lockfile.

2. Write `src/index.tsx` exporting `setup(app: PiletApi)`. Import shared libraries (`react`,
   `react-router-dom`, `@silverstripe/admin-patterns`) as usual; the build marks them external.

3. Build into the module's exposed `client/dist`:

   ```sh
   npx pilet build --target ../dist/pilet/index.js --schema v2
   ```

   Commit the output. Composer's `vendor-expose` publishes `client/dist` under `_resources`, which is what the
   feed links to. A module must list `client/dist` in `extra.expose` in its `composer.json`.

4. Register it:

   ```yaml
   ---
   Name: mymodule-admin-piral
   ---
   SilverStripe\Admin\UserInterface\PiletFeed:
     pilets:
       mymodule-admin:
         link: 'vendor-name/module-name:client/dist/pilet/index.js'
   ```

   `link` is `vendor/package:path` for a vendor module, a project-relative path (`app/client/dist/...`) for
   the project, or a URL. `version` defaults to the module's Composer version. Add `Only: moduleexists:` when
   the pilet depends on another module, as `_config/piral-elemental.yml` does.

5. Flush. The feed lists the pilet and the shell loads it on the next page load.

For a dev loop that rebuilds on save instead of committing a bundle, see **Development** in `README.md`.

## Where the pieces are in this repo

| | |
|---|---|
| Feed and controller | `code/UserInterface/PiletFeed.php`, `PiletFeedController.php` |
| Shell page and routing | `code/LeftAndMain.php` (`piral_shell`, `requirePiralShell()`, `isPiralNavigation()`), `templates/SilverStripe/Admin/PiralShell.ss` |
| Shell boot | `client/shell/src/index.tsx`, layout in `src/layout.tsx`, menu in `src/menu/` |
| Pilet API | `client/shell/src/api/silverstripe.ts`, `PILET-API.md` |
| First-party pilets | `client/pilets/{fields,pages,elemental,htmleditor,history}`, feed entries in `_config/piral-*.yml` |
| Shared components | `client/patterns` (`@silverstripe/admin-patterns`) |
| Example hello module | A local repository, installed through a path repository in the site's `composer.json` |
