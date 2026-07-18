import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['server/**/*.test.ts', '.next/**', 'node_modules/**'],
  },
  {
    files: ['server/**/*.ts', 'app/**/*.ts', 'app/**/*.tsx', 'lib/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'prefer-const': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
];

export default eslintConfig;
