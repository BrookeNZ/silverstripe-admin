const path = require('path');
const { BannerPlugin } = require('webpack');
const bindHotModuleServerToLoopback = require('./loopback-hmr');

// Unhashed output names, so LeftAndMain can require client/dist/shell/main.js and main.css by path;
// Requirements adds its own mtime query string for cache busting. Shared dependency bundles keep
// their chunk names, which the import map in index.js references
module.exports = function (config) {
  config.output.filename = '[name].js';
  config.output.chunkFilename = '[name].js';

  // @silverstripe/admin-patterns is linked from ../patterns, so its imports would otherwise
  // resolve react from the fork root's legacy node_modules and bundle a second copy
  config.resolve.modules = [path.resolve(__dirname, 'node_modules'), 'node_modules'];

  for (const plugin of config.plugins) {
    if (plugin.constructor.name === 'MiniCssExtractPlugin') {
      plugin.options.filename = '[name].css';
      plugin.options.chunkFilename = '[name].css';
    }
  }

  if (config.mode === 'development') {
    // LeftAndMain serves the dev bundle from SS_PIRAL_SHELL_DEV_URL on another origin, so chunks
    // resolve against the script's own URL rather than the page
    config.output.publicPath = 'auto';
    bindHotModuleServerToLoopback();

    const piletApi = process.env.PIRAL_DEV_PILET_API;
    if (piletApi) {
      // Read by piral-core's codegen when the bundle compiles: compiles in Piral's pilet emulator,
      // which merges the pilet debug server's pilets over the real feed and re-injects them on rebuild
      process.env.DEBUG_PILET = 'on';
      config.plugins.push(
        new BannerPlugin({
          raw: true,
          entryOnly: true,
          include: /^main\.js$/,
          banner: `window['dbg:pilet-api'] = ${JSON.stringify(piletApi)}; sessionStorage.setItem('dbg:load-pilets', 'on');`,
        }),
      );
    }
  }

  return config;
};
