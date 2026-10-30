/**
 * The specifiers the admin page's import map provides, each mapped to its file in the loader build's `shared/`
 * folder. The shared-file build and every module build read this list, so a specifier is external everywhere or
 * nowhere. The loader build copies it into client/dist/loader/manifest.json, which the PHP reads to write the map.
 * Keep the keys in step with LoaderAssets::SHARED_SPECIFIERS.
 *
 * `sharedVersions` holds the exact versions this package's dev dependencies pin, which the shared files are built
 * from, and what a module installs to type and test against. The peer dependencies only name the major.
 *
 * It has no dependencies, so a module built with any bundler can read it as `@silverstripe/admin/shared`.
 */
import adminPackage from './package.json' with { type: 'json' };

export const sharedFiles = {
  '@silverstripe/admin': 'admin',
  react: 'react',
  'react/jsx-runtime': 'react-jsx-runtime',
  'react-dom': 'react-dom',
  'react-dom/client': 'react-dom-client',
};

export const sharedSpecifiers = Object.keys(sharedFiles);

function packageOf(specifier) {
  const segments = specifier.startsWith('@') ? 2 : 1;
  return specifier.split('/').slice(0, segments).join('/');
}

const sharedPackages = [...new Set(sharedSpecifiers.map(packageOf))];

const devDependencies = adminPackage.devDependencies ?? {};

export const sharedVersions = Object.fromEntries(
  sharedPackages.filter((name) => name in devDependencies).map((name) => [name, devDependencies[name]]),
);
