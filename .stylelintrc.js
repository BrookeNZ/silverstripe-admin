const base = require('@silverstripe/eslint-config/.stylelintrc');

// The Piral shell, patterns package and pilets keep every colour literal in the patterns package's
// tokens.css, so a theme stays one block there. They also use relative colour syntax, which only the
// modern notation can express. Pseudo-elements take the double colon throughout
const piralCss = ['client/patterns/src/**/*.css', 'client/shell/src/**/*.css', 'client/pilets/*/src/**/*.css'];

// Each package styles only the classes it owns, so a pilet retints a shared class through its tokens
// rather than selecting it. The grid's admin-* classes are the shell's, not the patterns package's
const bemClass = (blocks, exclude = '') => [
  `^${exclude}(?:${blocks.join('|')})(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$`,
  {
    message: (selector) => `${selector} is not a class this package owns (${blocks.join(', ')})`,
    resolveNestedSelectors: true,
  },
];
const classOwners = {
  'client/patterns/src/**/*.css': bemClass(['admin'], '(?!admin-grid|admin-data-table)'),
  'client/shell/src/**/*.css': bemClass(['shell', 'piral-notifications-host']),
  'client/shell/src/grid/*.css': bemClass(['admin-grid', 'admin-data-table']),
  'client/pilets/archive/src/**/*.css': bemClass(['archive']),
  'client/pilets/elemental/src/**/*.css': bemClass(['elemental']),
  'client/pilets/fields/src/**/*.css': bemClass(
    ['focuspoint', 'link-field', 'preview-image-field', 'treedropdownfield', 'upload-field', 'used-on'],
  ),
  'client/pilets/files/src/**/*.css': bemClass(['files']),
  'client/pilets/history/src/**/*.css': bemClass(['history']),
  'client/pilets/htmleditor/src/**/*.css': bemClass(['htmleditor']),
  'client/pilets/pages/src/**/*.css': bemClass(['pages']),
};

// Lengths come from tokens: a property reads var(), and a literal is only a token's default, in
// tokens.css or a component's own token block. Viewport units and percentages are layout, not scale
const lengthUnits = ['px', 'rem', 'em', 'ex', 'ch', 'cm', 'mm', 'in', 'pt', 'pc', 'q'];

module.exports = {
  ...base,
  plugins: [...base.plugins, './client/tools/stylelint-layer.js'],
  overrides: [
    {
      files: piralCss,
      rules: {
        'color-function-notation': 'modern',
        'color-no-hex': true,
        'declaration-property-unit-disallowed-list': [{ '/^(?!--)/': lengthUnits }],
        'selector-pseudo-element-colon-notation': 'double',
        'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'],
      },
    },
    ...Object.entries(classOwners).map(([files, pattern]) => ({ files: [files], rules: { 'selector-class-pattern': pattern } })),
    { files: ['client/shell/src/**/*.css'], rules: { 'admin/layer': 'shell' } },
    { files: ['client/shell/src/layers.css'], rules: { 'admin/layer': null } },
    { files: ['client/pilets/*/src/**/*.css'], rules: { 'admin/layer': 'pilets' } },
    {
      files: ['client/patterns/src/css/tokens.css'],
      rules: {
        'color-no-hex': null,
        'function-disallowed-list': null,
      },
    },
  ],
};
