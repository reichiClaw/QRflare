import type { Env as WorkerEnv } from '../../src/worker/env';

declare global {
  namespace Cloudflare {
    // `env` from cloudflare:test is typed as Cloudflare.Env.
    interface Env extends WorkerEnv {
      DB: D1Database;
    }
  }
}
