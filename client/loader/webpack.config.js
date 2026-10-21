/**
 * Builds the loader release into ../dist/loader/: main.js from src/index.ts, the shared files
 * (webpack.shared.config.js) and manifest.json. --watch rebuilds and rewrites the manifest.
 *
 * The manifest is a contract with the PHP that writes the admin page, which reads nothing else from the build:
 * `shared` maps each import map specifier to its file, which the PHP turns into the map's imports, and `files` maps
 * every JavaScript file of the release to its `sha384-` digest, from which the PHP takes each shared file's
 * cache-busting query string. Renaming a key or changing a digest's form breaks the PHP with no build error.
 *
 * Digests are taken from the files on disk after every build, so they match the bytes served. Keys are written in a
 * fixed order so an unchanged rebuild writes the same file.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import { sharedFiles, sharedSpecifiers } from './shared.js';
import sharedConfigs, { baseConfig } from './webpack.shared.config.js';

const releaseDir = path.resolve(import.meta.dirname, '../dist/loader');
const sha384 = (file) => `sha384-${crypto.createHash('sha384').update(fs.readFileSync(file)).digest('base64')}`;

function writeManifest() {
  const shared = Object.fromEntries(sharedSpecifiers.map((name) => [name, `shared/${sharedFiles[name]}.js`]));
  const files = Object.fromEntries(
    fs
      .globSync('**/*.js', { cwd: releaseDir })
      .map((name) => name.split(path.sep).join('/'))
      .sort()
      .map((name) => [name, sha384(path.join(releaseDir, name))]),
  );
  for (const file of new Set(Object.values(shared))) {
    if (!files[file]) {
      throw new Error(`${file} is missing from ${releaseDir}`);
    }
  }
  fs.writeFileSync(path.join(releaseDir, 'manifest.json'), `${JSON.stringify({ shared, files }, null, 2)}\n`);
}

const loaderConfig = {
  ...baseConfig,
  name: 'loader',
  entry: { main: './src/index.ts' },
  output: { ...baseConfig.output, path: releaseDir, publicPath: 'auto' },
  externals: Object.fromEntries(sharedSpecifiers.map((name) => [name, name])),
};

const configs = [loaderConfig, ...sharedConfigs];

function report(error, stats) {
  if (error) {
    throw error;
  }
  process.stdout.write(`${stats.toString({ preset: 'summary', colors: false })}\n`);
  if (stats.hasErrors()) {
    process.exitCode = 1;
    return;
  }
  writeManifest();
}

export default configs;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
  const compiler = webpack(configs);
  if (process.argv.includes('--watch')) {
    compiler.watch({}, report);
  } else {
    compiler.run((error, stats) => {
      report(error, stats);
      compiler.close(() => {});
    });
  }
}
