/*
 * Lint config for the Piral shell, shared components and pilets (`yarn lint:ts`).
 *
 * Every tsconfig uses the automatic JSX runtime (react-jsx), so React is not imported for JSX alone.
 * react-hooks 7 ships its recommended config as flat-only, so its rules are listed by hand:
 * - static-components, purity, immutability, preserve-manual-memoization, incompatible-library are off: React Compiler checks, the compiler is not in use
 * - globals is off in tests, which mutate module state on purpose
 * anchor-has-content is off in the Link and TabStrip wrappers, whose bare `<a {...props} />` gets its children from callers; the rule's `components` option adds elements to check rather than exempting them
 * Server HTML goes through DOMPurify (client/shell/src/forms/serverHtml.ts) and onto the page as nodes, so no-danger is an error.
 * no-explicit-any warns in the ported legacy field code and in tests, which wrap untyped libraries and mocks.
 * Type-aware rules run only on files their package tsconfig includes; *.d.ts and patterns tests sit outside it.
 */
const componentStyle = 'Declare components as `const X = ({ a, b = 1 }: XProps) => ...`, not React.FC';

const typedPackages = ['shell', 'patterns', 'pilets/fields', 'pilets/pages', 'pilets/elemental', 'pilets/htmleditor', 'pilets/history', 'pilets/archive', 'pilets/files'];

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'jsx-a11y'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:jsx-a11y/recommended',
  ],
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    '@typescript-eslint/no-restricted-types': ['error', {
      types: {
        'React.FC': componentStyle,
        FC: componentStyle,
        'React.FunctionComponent': componentStyle,
        FunctionComponent: componentStyle,
        'React.VFC': componentStyle,
        VFC: componentStyle,
      },
    }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/method-signature-style': ['error', 'property'],
    '@typescript-eslint/array-type': ['error', { default: 'generic' }],
    '@typescript-eslint/consistent-type-imports': 'error',
    'react/prop-types': 'off',
    'react/display-name': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'error',
    'react-hooks/refs': 'error',
    'react-hooks/set-state-in-effect': 'error',
    'react-hooks/static-components': 'off',
    'react-hooks/purity': 'off',
    'react-hooks/immutability': 'off',
    'react-hooks/preserve-manual-memoization': 'off',
    'react-hooks/incompatible-library': 'off',
    'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
    'react/no-danger': 'error',
    'react/jsx-no-script-url': 'error',
    'no-eval': 'error',
    'no-new-func': 'error',
  },
  overrides: [
    {
      files: ['client/patterns/src/{Link,TabStrip}.tsx'],
      rules: {
        'jsx-a11y/anchor-has-content': 'off',
      },
    },
    {
      files: ['**/*.test.*'],
      rules: {
        'react-hooks/globals': 'off',
      },
    },
    {
      files: [
        'client/pilets/fields/src/{legacy,TreeDropdownField,focuspoint,UsedOnTable,SearchableDropdownField}/**',
        '**/*.test.*',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
      },
    },
    {
      files: typedPackages.map((pkg) => `client/${pkg}/src/**/*.{ts,tsx}`),
      excludedFiles: ['**/*.d.ts', 'client/patterns/src/**/*.test.*', 'client/patterns/src/test/**'],
      parserOptions: {
        project: typedPackages.map((pkg) => `./client/${pkg}/tsconfig.json`),
        tsconfigRootDir: __dirname,
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
        '@typescript-eslint/await-thenable': 'error',
      },
    },
  ],
};
