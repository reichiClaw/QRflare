import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Runs the HTTP API tests inside the Cloudflare Workers runtime (workerd via
 * Miniflare), using the real wrangler.jsonc configuration. A throw-away D1
 * database is attached so the optional dynamic module can be exercised too;
 * the module stays disabled by default (DYNAMIC_QR_ENABLED=false) exactly as
 * in a fresh deployment.
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url)));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            API_TOKEN: '',
            CORS_ALLOWED_ORIGINS: 'https://allowed.example',
            TEST_MIGRATIONS: migrations,
          },
          d1Databases: { DYNAMIC_DB: 'edgeqr-test-db' },
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
      setupFiles: ['./tests/workers/setup.ts'],
      testTimeout: 60_000,
    },
  };
});
