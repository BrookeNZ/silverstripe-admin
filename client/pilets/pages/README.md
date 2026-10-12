# Pages pilet

The Pages section of the admin under the Piral shell: the page tree beside the page edit form, at the
CMSMain route prefix (`/admin/pages/`, `/admin/pages/edit/show/<id>`).

In a real release this pilet ships in `silverstripe/cms`, which owns CMSMain, SiteTree and the page
edit form. It lives in the admin fork only because this proof of concept forks only admin. The tree endpoints it
reads (`admin/pages/tree/children|ancestors|search`, `PageTreeController`) sit in the admin fork for the
same reason.

## What it uses

- Tree: `@headless-tree/react` and `@headless-tree/core` 1.7.0 (the sync data loader over the pilet's
  own store, which pages the children endpoint) and `@tanstack/react-virtual` 3.14.13. Bundled into
  the pilet, not shared through the shell.
- Form: the shell's FormSchema renderer, taken from the registry as `FormSchemaForm`
  (`getSilverstripeComponent`), at `<CMSPageEditController url>/schema/EditForm/<id>`.
- Shared state: `setData('silverstripe:pages:current-page-id', id)` and the
  `silverstripe:records-changed` event, both described in `client/shell/PILET-API.md`.

## Building

Node 24.21.0 (`.nvmrc`). Install after the shell emulator exists (`npm run build:emulator` in
`client/shell`), as for the fields pilet. `npm run build` writes `client/dist/pilets/pages/index.js`
and `main.css`, which `_config/piral.yml` lists as `silverstripe-cms-pages`. `npm test` runs the store
and API tests; `npm run typecheck` checks types.
