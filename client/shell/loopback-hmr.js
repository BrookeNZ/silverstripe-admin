/**
 * piral-cli-webpack5's HotModuleServerPlugin listens on every interface and has no host option, and its
 * enhancer adds the plugin after webpack.config.js has run, so its prototype is patched to listen on the
 * loopback address instead. Recheck on a piral-cli upgrade.
 */
const express = require('express');
const { HotModuleServerPlugin } = require('piral-cli-webpack5/lib/enhancers/hmr-webpack-config-enhancer/HotModuleServerPlugin');

module.exports = function bindHotModuleServerToLoopback() {
  HotModuleServerPlugin.prototype.apply = function apply(compiler) {
    const middleware = require('piral-cli-webpack5/src/webpack-hot-middleware/middleware');
    express().use(middleware(compiler)).listen(this.hmrPort, '127.0.0.1');
  };
};
