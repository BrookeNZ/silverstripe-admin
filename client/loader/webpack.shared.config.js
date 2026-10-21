/**
 * Builds one ES module per shared file into ../dist/loader/shared/. Each marks every other shared name external, so
 * react-dom imports react by bare name and the page holds one copy of each. File names carry no hash because the PHP
 * that writes the map adds a digest query string. Each file re-exports a package from src/shared/, except
 * `admin.js`, built from src/runtime.ts.
 *
 * webpack.config.js runs these builds and writes manifest.json after them. Its loader build starts from `baseConfig`
 * too, so a setting changed there changes every file of the release.
 */
import path from 'node:path';
import TerserPlugin from 'terser-webpack-plugin';
import { sharedFiles, sharedSpecifiers } from './shared.js';

const sharedDir = path.resolve(import.meta.dirname, '../dist/loader/shared');

const externalsFor = (fileName) =>
  Object.fromEntries(sharedSpecifiers.filter((name) => sharedFiles[name] !== fileName).map((name) => [name, name]));

const sources = { admin: './src/runtime.ts' };

export const baseConfig = {
  mode: 'production',
  target: 'web',
  devtool: false,
  context: import.meta.dirname,
  experiments: { outputModule: true },
  output: { filename: '[name].js', module: true },
  externalsType: 'module',
  resolve: { extensions: ['.ts', '.js'] },
  module: {
    rules: [{ test: /\.ts$/, loader: 'ts-loader', options: { transpileOnly: true } }],
  },
  optimization: {
    minimizer: [new TerserPlugin({ extractComments: false })],
  },
  performance: { hints: false },
};

const configFor = (fileName) => ({
  ...baseConfig,
  name: fileName,
  entry: { [fileName]: sources[fileName] ?? `./src/shared/${fileName}.js` },
  output: { ...baseConfig.output, path: sharedDir, library: { type: 'module' } },
  externals: externalsFor(fileName),
});

export default [...new Set(Object.values(sharedFiles))].map(configFor);
