import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import worker from '../../src/worker/index';

const BASE = 'https://edgeqr.test';
const ADMIN = 'test-admin-token';

function readJson<T>(res: Response): Promise<T> {
  return res.json<T>();
}

/** Environment with the optional module switched on (as a deployment following docs/dynamic-qr.md would have). */
const dynamicEnv: Cloudflare.Env = { ...env, DYNAMIC_QR_ENABLED: 'true', DYNAMIC_ADMIN_TOKEN: ADMIN };

function call(path: string, init: RequestInit = {}, environment: Cloudflare.Env = dynamicEnv) {
  const request = new Request(`${BASE}${path}`, init) as Request<unknown, IncomingRequestCfProperties>;
  return worker.fetch(request, environment);
}

const admin = (path: string, method: string, body?: unknown) =>
  call(path, {
    method,
    headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('dynamic QR module (enabled)', () => {
  it('requires the admin token', async () => {
    expect((await call('/api/v1/dynamic/links')).status).toBe(401);
    expect((await call('/api/v1/dynamic/links', { headers: { Authorization: 'Bearer wrong' } })).status).toBe(
      401,
    );
    const missingToken = await call(
      '/api/v1/dynamic/links',
      {},
      { ...dynamicEnv, DYNAMIC_ADMIN_TOKEN: undefined },
    );
    expect(missingToken.status).toBe(503);
  });

  it('creates, redirects, counts, updates, disables and deletes links', async () => {
    const created = await admin('/api/v1/dynamic/links', 'POST', {
      destination: 'https://example.com/spring',
      label: 'Spring',
    });
    expect(created.status).toBe(201);
    const { link } = await readJson<{ link: { code: string; shortUrl: string; enabled: boolean } }>(created);
    expect(link.shortUrl).toBe(`${BASE}/r/${link.code}`);

    const redirect = await call(`/r/${link.code}`, { redirect: 'manual' });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('Location')).toBe('https://example.com/spring');
    expect(redirect.headers.get('Cache-Control')).toBe('no-store');
    expect(redirect.headers.get('Referrer-Policy')).toBe('no-referrer');

    await call(`/r/${link.code}`, { redirect: 'manual' });
    const details = await admin(`/api/v1/dynamic/links/${link.code}`, 'GET');
    const body = await readJson<{ link: { scanCount: number }; scansByDay: Array<{ count: number }> }>(
      details,
    );
    expect(body.link.scanCount).toBe(2);
    expect(body.scansByDay[0]?.count).toBe(2);
    expect(JSON.stringify(body)).not.toMatch(/ip|userAgent|referer/i);

    const updated = await admin(`/api/v1/dynamic/links/${link.code}`, 'PATCH', {
      destination: 'https://example.com/summer',
    });
    expect(updated.status).toBe(200);
    const after = await call(`/r/${link.code}`, { redirect: 'manual' });
    expect(after.headers.get('Location')).toBe('https://example.com/summer');

    await admin(`/api/v1/dynamic/links/${link.code}`, 'PATCH', { enabled: false });
    expect((await call(`/r/${link.code}`, { redirect: 'manual' })).status).toBe(404);

    expect((await admin(`/api/v1/dynamic/links/${link.code}`, 'DELETE')).status).toBe(204);
    expect((await admin(`/api/v1/dynamic/links/${link.code}`, 'GET')).status).toBe(404);
  });

  it('honours expiry and scan limits', async () => {
    const expired = await admin('/api/v1/dynamic/links', 'POST', {
      destination: 'https://example.com/old',
      expiresAt: '2000-01-01T00:00:00Z',
    });
    const { link: old } = await readJson<{ link: { code: string } }>(expired);
    expect((await call(`/r/${old.code}`, { redirect: 'manual' })).status).toBe(404);

    const limited = await admin('/api/v1/dynamic/links', 'POST', {
      destination: 'https://example.com/once',
      maxScans: 1,
    });
    const { link: once } = await readJson<{ link: { code: string } }>(limited);
    expect((await call(`/r/${once.code}`, { redirect: 'manual' })).status).toBe(302);
    expect((await call(`/r/${once.code}`, { redirect: 'manual' })).status).toBe(404);
  });

  it('validates input and rejects unsafe destinations', async () => {
    expect(
      // eslint-disable-next-line no-script-url -- deliberately unsafe input
      (await admin('/api/v1/dynamic/links', 'POST', { destination: 'javascript:alert(1)' })).status,
    ).toBe(400);
    expect(
      (
        await admin('/api/v1/dynamic/links', 'POST', {
          destination: 'https://example.com',
          code: 'bad code!',
        })
      ).status,
    ).toBe(400);
    const first = await admin('/api/v1/dynamic/links', 'POST', {
      destination: 'https://example.com',
      code: 'fixed-code',
    });
    expect(first.status).toBe(201);
    expect(
      (
        await admin('/api/v1/dynamic/links', 'POST', {
          destination: 'https://example.com',
          code: 'fixed-code',
        })
      ).status,
    ).toBe(409);
    expect((await call('/r/%00', { redirect: 'manual' })).status).toBe(404);
  });

  it('reports the feature in health', async () => {
    const health = await call('/api/health');
    const body = await readJson<{ features: { dynamicQr: boolean } }>(health);
    expect(body.features.dynamicQr).toBe(true);
  });
});
