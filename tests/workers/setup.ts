import { applyD1Migrations, env } from 'cloudflare:test';

// Apply the dynamic-module migrations to the throw-away test database.
await applyD1Migrations(env.DYNAMIC_DB, env.TEST_MIGRATIONS);
