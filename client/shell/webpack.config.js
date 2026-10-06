const path = require('path');

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

  return config;
};
