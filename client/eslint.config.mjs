import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default tseslint.config(
  { ignores: ['.next/**', '.next-e2e/**', 'node_modules/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals'),
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The vendored shared index re-exports with server-style `.js` paths that
    // Next's bundler can't resolve, so a value import 500s the page while
    // Vitest stays green. Types are erased, so they're safe (client/INSIGHTS.md).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/vendor/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@devdigest/shared',
              allowTypeImports: true,
              message:
                'Only `import type` from @devdigest/shared in the client — a runtime import breaks the Next build (see client/INSIGHTS.md).',
            },
          ],
        },
      ],
    },
  },
);
