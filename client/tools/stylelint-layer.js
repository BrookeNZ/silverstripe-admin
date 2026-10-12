/**
 * Stylelint rule admin/layer: every rule in the file sits inside `@layer <name> { }`. An unlayered rule
 * would beat every layer in shell/src/layers.css, so a file that forgets its wrapper silently wins every
 * tie with the package and the pilets
 */
const stylelint = require('stylelint');

const ruleName = 'admin/layer';
const messages = stylelint.utils.ruleMessages(ruleName, {
  expected: (layer) => `Expected this inside @layer ${layer} { }`,
});

const rule = (layer) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, ruleName, { actual: layer, possible: [(value) => typeof value === 'string'] })) {
    return;
  }
  root.each((node) => {
    if (node.type === 'comment' || (node.type === 'atrule' && node.name === 'layer' && node.params === layer && node.nodes)) {
      return;
    }
    stylelint.utils.report({ ruleName, result, node, message: messages.expected(layer) });
  });
};

rule.ruleName = ruleName;
rule.messages = messages;

module.exports = stylelint.createPlugin(ruleName, rule);
