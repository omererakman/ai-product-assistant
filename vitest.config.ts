import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'backend/tests/**/*.test.ts',  // Unit tests only (excludes .e2e.test.ts)
    ],
    exclude: [
      '**/*.e2e.test.ts',  // Exclude e2e tests from default run
      'node_modules/**',
    ],
    testTimeout: 30000, // 30 seconds default timeout
    hookTimeout: 60000, // 60 seconds for setup hooks
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['backend/src/**/*.ts'],
      exclude: [
        'backend/src/**/*.test.ts',
        'backend/src/**/*.spec.ts',
        'backend/tests/**',
        'node_modules/**',
      ],
    },
    setupFiles: [],
  },
});
