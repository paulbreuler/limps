import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/'],
      thresholds: {
        statements: 70,
        branches: 63, // ~63% currently; target 70%
        functions: 70,
        lines: 70,
      },
    },
  },
});
