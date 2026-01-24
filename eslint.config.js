import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    rules: {
      // Require explicit return types on functions
      '@typescript-eslint/explicit-function-return-type': 'error',
      // Require explicit accessibility modifiers
      '@typescript-eslint/explicit-member-accessibility': 'off',
      // Allow empty functions for callbacks
      '@typescript-eslint/no-empty-function': 'off',
      // Allow non-null assertions where needed
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Consistent type imports
      '@typescript-eslint/consistent-type-imports': 'error',
      // Allow underscore-prefixed unused vars (intentionally unused)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Allow 'any' in test files (tests need flexibility for mocking/assertions)
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js', '!eslint.config.js'],
  }
);
