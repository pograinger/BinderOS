import solid from 'eslint-plugin-solid/configs/typescript';
import tsParser from '@typescript-eslint/parser';

export default [
  // Ignore auto-generated WASM bindings
  {
    ignores: ['src/wasm/pkg/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    ...solid,
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: './tsconfig.json' },
    },
  },
];
