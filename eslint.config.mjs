import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const NODE_BUILTINS = [
  'fs', 'path', 'crypto', 'os', 'child_process', 'util', 'stream', 'buffer', 'process', 'url', 'events',
  'node:fs', 'node:path', 'node:crypto', 'node:os', 'node:child_process', 'node:util', 'node:stream',
  'node:buffer', 'node:process', 'node:url', 'node:events'
];

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: { globals: { ...globals.browser, ...globals.es2022 } }
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,mts,cts}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/array-type': ['error', { default: 'generic' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/naming-convention': [
        'warn',
        { selector: 'class', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
        { selector: 'interface', format: ['PascalCase'] },
        { selector: 'typeAlias', format: ['PascalCase'] },
        { selector: 'method', format: ['camelCase'] },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'enum', format: ['PascalCase'] }
      ],
      '@typescript-eslint/no-unused-vars': 'off',
      'no-restricted-syntax': [
        'error',
        { selector: 'ConditionalExpression', message: 'Use if/else or early returns instead of a ternary.' }
      ],
      'no-restricted-imports': ['error', { paths: NODE_BUILTINS }],
      'prefer-promise-reject-errors': 'warn',
      '@typescript-eslint/return-await': ['warn', 'in-try-catch'],
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-alert': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'never'],
      'brace-style': ['error', '1tbs', { allowSingleLine: true }],
      'curly': ['error', 'all'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'quotes': ['error', 'single', { allowTemplateLiterals: true }],
      'comma-spacing': ['error', { before: false, after: true }],
      'key-spacing': ['error', { beforeColon: false, afterColon: true }],
      'space-before-blocks': ['error', 'always'],
      'space-infix-ops': 'error',
      'space-before-function-paren': ['error', { anonymous: 'always', named: 'never', asyncArrow: 'always' }],
      'keyword-spacing': ['error', { before: true, after: true }],
      'no-trailing-spaces': 'error',
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'eol-last': ['error', 'always']
    }
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    files: ['src/shared/log.ts'],
    rules: { 'no-console': 'off' }
  },
  {
    ignores: ['main.js', 'node_modules/**']
  }
]);
