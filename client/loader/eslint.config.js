import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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
);
