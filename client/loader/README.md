# @silverstripe/admin

The admin's module loader and shared files, built to `client/dist/loader/`, and the module types.
[MODULES.md](MODULES.md) is for module authors; [IMPORT-MAP.md](IMPORT-MAP.md) describes how the admin page loads
modules, from the request to `setup`.

- **The loader** (`src/`, built to `main.js`) reads the page's config and module list and sets up the listed modules;
  see [IMPORT-MAP.md](IMPORT-MAP.md), step 4.
- **The runtime file** (`src/runtime.ts`) is `@silverstripe/admin` at runtime, served as `shared/admin.js`; the same
  code is built as `runtime.js` for Node tooling and a module's tests ([MODULES.md](MODULES.md)).
- **The types** (`types/`, committed) that a module imports from `@silverstripe/admin`.
- **The shared files** under `shared/` and their list, `shared.js` (`@silverstripe/admin/shared`, typed by
  `shared.d.ts`): see [IMPORT-MAP.md](IMPORT-MAP.md), *Shared files*.

The package packs the types, `runtime.js`, the shared list and these three pages. The Composer dist carries those
files and `package.json`, so a module links the package by `file:` path from any install
([MODULES.md](MODULES.md), *Building a module*).

## Commands

On Node 24 (`.nvmrc`), with npm and its own `package-lock.json`, while the repository root uses Yarn on Node 18: the
root build cannot build the loader, and a standalone package is what a module links by `file:` path. The
`client-loader.yml` workflow runs the lint, tests and typecheck, then `npm run build`, and fails when the rebuild
leaves the checkout changed.

| Command | Does |
|---|---|
| `npm test` | Runs the Vitest suites |
| `npm run typecheck` | Typechecks `src/` |
| `npm run lint` | Lints `src/` and the package's own scripts |
| `npm run build` | Builds the release, then the types and `runtime.js`; an unchanged rebuild writes the same files |
| `npm run watch` | Rebuilds the release on change |
| `npm run build:package` | Builds the types and `runtime.js` only |
