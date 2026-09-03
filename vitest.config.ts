import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Two Vitest projects:
 *  - `unit`    → Node runtime; shared library, payload builders, renderer, round-trip decoding.
 *  - `workers` → Cloudflare workerd runtime via @cloudflare/vitest-pool-workers; HTTP API tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
      './vitest.workers.config.ts',
    ],
  },
});
