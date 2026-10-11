import { defineConfig, globalIgnores } from 'eslint/config';
import expo from 'eslint-config-expo/flat.js';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig([
  globalIgnores(['dist/', '.expo/', 'node_modules/', 'android/', 'ios/', 'web-build/']),
  expo,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
          pathGroups: [{ pattern: '@/**', group: 'internal', position: 'before' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    // src/core is pure TypeScript: it may only import from itself.
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/**',
                'react-*',
                'react-*/**',
                'expo',
                'expo/**',
                'expo-*',
                'expo-*/**',
                '@expo/**',
                '@/**',
                '!@/core',
                '!@/core/**',
                '../../**',
                '../../../**',
              ],
              message: 'src/core must stay pure: import only from within src/core.',
            },
          ],
        },
      ],
    },
  },
  prettier,
]);
