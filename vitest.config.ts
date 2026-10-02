import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __PLATFORM__: '"web"', __E2E__: 'false', __APP_VERSION__: '"test"' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/types.ts'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
      reporter: ['text-summary', 'text'],
    },
  },
});
