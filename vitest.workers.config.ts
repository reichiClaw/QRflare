import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Runs the HTTP API tests inside the Cloudflare Workers runtime (workerd via
 * Miniflare), using the real wrangler.jsonc configuration.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          API_TOKEN: '',
          CORS_ALLOWED_ORIGINS: 'https://allowed.example',
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('test'),
    __APP_COMMIT__: JSON.stringify('test'),
    __APP_BUILD_TIME__: JSON.stringify('1970-01-01T00:00:00.000Z'),
  },
  test: {
    name: 'workers',
    include: ['tests/workers/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
