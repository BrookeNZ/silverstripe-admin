# Silverstripe admin shell

The Piral app shell for the Silverstripe CMS admin. `LeftAndMain` renders `templates/SilverStripe/Admin/PiralShell.ss`
with the real `window.ss.config`, `data-menu`, `data-admin-url` and `data-feed-url`, and requires the shell bundle.
The Pilet API is described in [PILET-API.md](PILET-API.md); how a module ships a pilet, from the feed entry to
the rendered page, is in [MODULES.md](MODULES.md).

## Development

The PHP page stays the front door in every mode, so the shell always boots with the real session, config and menu.
In dev, `LeftAndMain` loads `main.js` from a `piral debug` server on the host instead of `client/dist/shell`, and that
bundle merges pilets from a `pilet debug` server over the real feed. Nothing goes through the container's file sync,
and no `npm run build` or dist commit is needed until the change is ready.

Node 24.21.0 for everything under `client/` (`nvm use 24.21.0`).

### Shell

1. In the site's `.env` (dev only; `PiralShellAssets` ignores it, with a logged warning, in any other environment):

   ```sh
   SS_PIRAL_SHELL_DEV_URL="http://localhost:1234/shell-dev/"
   ```

2. Start the dev server:

   ```sh
   cd client/shell
   npm start   # piral debug --port 1234 --strict-port --hmr-port 61234 --public-url /shell-dev/ --krasrc debug.krasrc
   ```

3. Browse `https://<site>/admin/` as usual.

| Port | Serves |
|---|---|
| 1234 | `/shell-dev/main.js` and its chunks (`output.publicPath` is `auto` in dev, so chunks load from this origin) |
| 61234 | webpack HMR event stream |

Both listen on 127.0.0.1 only: `debug.krasrc` sets the dev server's `host`, and `loopback-hmr.js` (required from
`webpack.config.js` in dev) patches piral-cli-webpack5's `HotModuleServerPlugin`, which has no host option and
otherwise listens on every interface. Recheck the patch after a piral-cli upgrade with
`lsof -nP -iTCP -sTCP:LISTEN | grep node`.

- CSS changes apply in place without a reload. TypeScript changes reload the page (about half a second to rebuild),
  because the shell has no React Fast Refresh and no module accepts the update.
- In dev there is no `main.css` link: the dev bundle injects its styles from the script.
- The page CSP must allow `localhost`. The development site does it with a dev-only policy that extends the CMS one while
  `SS_PIRAL_SHELL_DEV_URL` is set.
- PHP, YAML and template changes still need `?flush=1`. JS and CSS changes never do.
- Unset `SS_PIRAL_SHELL_DEV_URL` before stopping the server, or the admin loads a script that is no longer there.

### Pilets

1. Start the pilet debug server for the pages and fields pilets, in one process so they share one pilet API:

   ```sh
   cd client/pilets/pages
   npx pilet debug ./src/index.tsx ../fields/src/index.tsx --port 1235 --strict-port --schema v2 --krasrc ../debug.krasrc
   ```

2. Start the shell dev server with the pilet API:

   ```sh
   cd client/shell
   PIRAL_DEV_PILET_API='http://localhost:1235/$pilet-api' npm start
   ```

With `PIRAL_DEV_PILET_API` set, the dev bundle compiles in Piral's pilet emulator. It loads the real feed, then
replaces feed items with the same name by the local pilets, and re-injects a pilet over the debug server's WebSocket
when it rebuilds. The pilet's own HMR client can reload the page first, so a change shows either in place or after
a fast reload.

- `../debug.krasrc` binds the pilet server to 127.0.0.1 and sets its asset URL. Without it the re-inject message links the pilet bundle to the
  page origin, which 404s. Keep its port in step with `--port`.
- Keep HMR on: `pilet debug --hmr false` never reports ready in piral-cli 1.12.4, and its pilet API hangs.
- **Never run `pilet debug --feed` against the admin feed** (`/admin/pilets/`). The debug server forwards the session
  cookie without the browser's `User-Agent`, and `Session.strict_user_agent_check` then destroys the session.
- The same rule applies to scripted checks: log in with the same `User-Agent` the browser or tool will send.

### Emulator

`pilet new` and `pilet debug` read the shell from the emulator tarball. It is gitignored, so a clean checkout builds
it before installing a pilet:

```sh
cd client/pilets/pages   # or fields
npm run setup            # shell npm ci, shell build:emulator, then the pilet's npm ci
```

Rebuild it after shell API changes:

```sh
cd client/shell
npm run build:emulator   # dist/emulator/silverstripe-admin-shell-1.0.0.tgz, gitignored
```

The pilets install it through a `file:` dependency whose lockfile entry carries no `integrity`: the tarball embeds
the checkout's absolute path, so its hash differs per machine and per build. `npm install` in a pilet writes the hash
back; delete that `integrity` line before committing the lockfile. To refresh an installed copy without reinstalling,
unpack the tarball over `node_modules/@silverstripe/admin-shell`.

### New pilets

`pilets` in `piral.json` is the scaffold `pilet new` applies, baked into the emulator, so rebuild the emulator after
changing it. From `client/pilets`:

```sh
../shell/node_modules/.bin/pilet new ../shell/dist/emulator/silverstripe-admin-shell-1.0.0.tgz --target <name> --bundler none --npm-client npm
```

- `scaffold/` holds the files copied in: `tsconfig.json`, `vitest.config.mts` (React deduped against the linked
  patterns package), `.npmrc` and `.nvmrc`. Keep them identical to the existing pilets' copies. `pilet upgrade`
  re-copies any the pilet has not changed.
- `devDependencies` and `scripts` are the set every pilet shares; `--bundler none` because `piral-cli-webpack5` is
  already in the list.
- `postScaffold` sets the build target to `../../dist/pilets/<folder>/index.js`, since `files` are copied without
  templating, and repoints `@silverstripe/admin-patterns` at `file:../../patterns`: the emulator records the
  shell's absolute path to it. It then reinstalls.
- The scaffold assumes the pilet lives in `client/pilets/<name>`.

### Before committing

`npm run build` in `client/shell` and in each changed pilet writes the release bundles into `client/dist`, which are
committed. The release build has no emulator and no debug bridge.

`yarn lint` at the module root (Node 18) runs `yarn lint:classes`, the dead-class check in
`client/tools/css-classes.mjs`. It fails when a class in the package, shell or pilet CSS has a rule but nothing
emits it (non-test TypeScript, the module's PHP and templates, or `PILET-API.md`), or when the TypeScript emits a
class of a styled block that has no rule. A class kept on purpose without one of the two, such as a test hook or
markup a vendor stylesheet targets, goes in `client/tools/css-classes-allowlist.json` with its reason; the check
also fails on an entry that is no longer needed.

### Stopping

`Ctrl+C` in each terminal. When the servers were started in the background, kill the bundler children too:

```sh
pkill -f piral-cli/lib/build/run-debug-piral.js
pkill -f piral-cli/lib/build/run-debug-pilet.js
kill $(lsof -tiTCP:1234 -sTCP:LISTEN) $(lsof -tiTCP:1235 -sTCP:LISTEN)
```
