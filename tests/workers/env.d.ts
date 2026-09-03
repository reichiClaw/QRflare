import type { D1Migration } from '@cloudflare/vitest-pool-workers';

import type { Env as WorkerEnv } from '../../src/worker/env';

declare global {
  namespace Cloudflare {
    // `env` from cloudflare:test is typed as Cloudflare.Env.
    interface Env extends WorkerEnv {
      DYNAMIC_DB: D1Database;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
