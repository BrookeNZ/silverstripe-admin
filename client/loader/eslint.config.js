/**
 * ESLint for the loader package: the TypeScript source and the plain-JavaScript re-exports under src/ lint as
 * browser code, the build and config scripts at the root as Node code. The generated files are ignored.
 */
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The indent matches .editorconfig in the admin root; quotes and semicolons are this package's own choice
const style = {
  indent: ['error', 2, { SwitchCase: 1 }],
  quotes: ['error', 'single', { avoidEscape: true }],
  semi: ['error', 'always'],
};

export default defineConfig(
  { ignores: ['types/**', 'runtime.js', 'node_modules/**'] },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    rules: style,
  },
  {
    files: ['src/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.browser },
    rules: style,
  },
  {
    files: ['*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: style,
  },
  {
    files: ['*.mts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: style,
  },
);
