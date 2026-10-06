const base = require('@silverstripe/eslint-config/.stylelintrc');

// The Piral shell, patterns package and pilets keep every colour literal in the patterns package's
// tokens.css, so a theme stays one block there. They also use relative colour syntax, which only the
// modern notation can express. Pseudo-elements take the double colon throughout
const piralCss = ['client/patterns/src/**/*.css', 'client/shell/src/**/*.css', 'client/pilets/*/src/**/*.css'];

module.exports = {
  ...base,
  overrides: [
    {
      files: piralCss,
      rules: {
        'color-function-notation': 'modern',
        'color-no-hex': true,
        'selector-pseudo-element-colon-notation': 'double',
        'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'],
      },
    },
    {
      files: ['client/patterns/src/css/tokens.css'],
      rules: {
        'color-no-hex': null,
        'function-disallowed-list': null,
      },
    },
  ],
};
