import { reset } from 'cloudflare:test';
import { beforeEach } from 'vitest';

import { resetSchemaCache } from '../../src/worker/db';
import { resetSettingsCache } from '../../src/worker/settings';

// Give every test a clean D1 database and forget the per-isolate caches that
// would otherwise remember tables and settings from the previous test.
beforeEach(async () => {
  await reset();
  resetSchemaCache();
  resetSettingsCache();
});
