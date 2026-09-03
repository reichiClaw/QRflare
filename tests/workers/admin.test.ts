import { env, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import worker from '../../src/worker/index';

const BASE = 'https://flareqr.test';
const PASSWORD = 'correct-horse-battery';

function readJson<T>(res: Response): Promise<T> {
  return res.json<T>();
}

function call(path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return SELF.fetch(`${BASE}${path}`, { ...init, headers });
}

async function setupAdmin(): Promise<string> {
  const res = await call('/api/admin/setup', {
    method: 'POST',
    body: JSON.stringify({ password: PASSWORD }),
  });
  expect(res.status).toBe(201);
  return (await readJson<{ token: string }>(res)).token;
}

async function saveSettings(
  token: string,
  settings: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  const res = await call(
    '/api/admin/settings',
    { method: 'PUT', body: JSON.stringify({ settings, ...extra }) },
    token,
  );
  expect(res.status, await res.text().catch(() => '')).toBe(200);
}

describe('admin: first-run setup and login', () => {
  it('requires setup first, then issues sessions and protects settings', async () => {
    const status = await readJson<{ setupRequired: boolean; authenticated: boolean; storage: boolean }>(
      await call('/api/admin/status'),
    );
    expect(status).toMatchObject({ setupRequired: true, authenticated: false, storage: true });

    expect(
      (await call('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: PASSWORD }) }))
        .status,
    ).toBe(409);
    expect((await call('/api/admin/settings')).status).toBe(401);
    expect(
      (await call('/api/admin/setup', { method: 'POST', body: JSON.stringify({ password: 'short' }) }))
        .status,
    ).toBe(400);

    const token = await setupAdmin();
    expect(
      (await call('/api/admin/setup', { method: 'POST', body: JSON.stringify({ password: PASSWORD }) }))
        .status,
    ).toBe(409);

    const after = await readJson<{ setupRequired: boolean; authenticated: boolean }>(
      await call('/api/admin/status', {}, token),
    );
    expect(after).toMatchObject({ setupRequired: false, authenticated: true });

    expect(
      (
        await call('/api/admin/login', {
          method: 'POST',
          body: JSON.stringify({ password: 'wrong-password' }),
        })
      ).status,
    ).toBe(401);
    const login = await call('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(login.status).toBe(200);
    const session = (await readJson<{ token: string }>(login)).token;
    expect(session.split('.')).toHaveLength(2);

    expect((await call('/api/admin/settings', {}, 'forged.token')).status).toBe(401);
    const settings = await call('/api/admin/settings', {}, session);
    expect(settings.status).toBe(200);
    const body = await readJson<{ settings: { api: { token: string }; secrets: { apiToken: boolean } } }>(
      settings,
    );
    expect(body.settings.api.token).toBe('');
    expect(body.settings.secrets.apiToken).toBe(false);
  });

  it('accepts ADMIN_PASSWORD from the environment without setup', async () => {
    const custom = { ...env, ADMIN_PASSWORD: 'env-password-123' } as Cloudflare.Env;
    const status = await worker.fetch(new Request(`${BASE}/api/admin/status`), custom);
    expect(await readJson<{ setupRequired: boolean; passwordSource: string }>(status)).toMatchObject({
      setupRequired: false,
      passwordSource: 'env',
    });
    const login = await worker.fetch(
      new Request(`${BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'env-password-123' }),
      }),
      custom,
    );
    expect(login.status).toBe(200);
    const change = await worker.fetch(
      new Request(`${BASE}/api/admin/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await readJson<{ token: string }>(login)).token}`,
        },
        body: JSON.stringify({ currentPassword: 'env-password-123', newPassword: 'another-long-password' }),
      }),
      custom,
    );
    expect(change.status).toBe(409);
  });

  it('changes the stored password', async () => {
    const token = await setupAdmin();
    const change = await call(
      '/api/admin/password',
      {
        method: 'POST',
        body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'brand-new-password-1' }),
      },
      token,
    );
    expect(change.status).toBe(204);
    expect(
      (await call('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: PASSWORD }) }))
        .status,
    ).toBe(401);
    expect(
      (
        await call('/api/admin/login', {
          method: 'POST',
          body: JSON.stringify({ password: 'brand-new-password-1' }),
        })
      ).status,
    ).toBe(200);
  });
});

describe('admin: settings', () => {
  it('validates, saves and applies settings (API token, CORS, app name)', async () => {
    const token = await setupAdmin();

    const invalid = await call(
      '/api/admin/settings',
      { method: 'PUT', body: JSON.stringify({ settings: { api: { requireToken: true, token: 'short' } } }) },
      token,
    );
    expect(invalid.status).toBe(400);
    expect(
      (await readJson<{ error: { issues: Array<{ path: string }> } }>(invalid)).error.issues[0]?.path,
    ).toBe('api.token');

    await saveSettings(token, {
      general: { appName: 'Acme QR' },
      api: {
        requireToken: true,
        token: 'a-very-secret-api-token',
        corsAllowedOrigins: ['https://cors.example'],
      },
    });

    const health = await readJson<{ name: string; features: { apiTokenRequired: boolean } }>(
      await call('/api/health'),
    );
    expect(health.name).toBe('Acme QR');
    expect(health.features.apiTokenRequired).toBe(true);

    const generate = (auth?: string) =>
      call(
        '/api/v1/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            content: { type: 'text', value: { text: 'x' } },
            output: { format: 'svg' },
          }),
        },
        auth,
      );
    expect((await generate()).status).toBe(401);
    expect((await generate('a-very-secret-api-token')).status).toBe(200);
    const sameOrigin = await SELF.fetch(`${BASE}/api/v1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', Origin: BASE },
      body: JSON.stringify({ content: { type: 'text', value: { text: 'x' } }, output: { format: 'svg' } }),
    });
    expect(sameOrigin.status).toBe(200);

    const cors = await call('/api/health', { headers: { Origin: 'https://cors.example' } });
    expect(cors.headers.get('Access-Control-Allow-Origin')).toBe('https://cors.example');

    // Secrets are never echoed and are kept when the field is left empty.
    const stored = await readJson<{ settings: { api: { token: string }; secrets: { apiToken: boolean } } }>(
      await call('/api/admin/settings', {}, token),
    );
    expect(stored.settings.api.token).toBe('');
    expect(stored.settings.secrets.apiToken).toBe(true);
    await saveSettings(token, { general: { appName: 'Acme QR 2' }, api: { requireToken: true, token: '' } });
    expect((await generate('a-very-secret-api-token')).status).toBe(200);
    await saveSettings(token, { api: { requireToken: false } }, { clearApiToken: true });
    expect((await generate()).status).toBe(200);
  });
});

describe('dynamic links: built-in provider', () => {
  it('is admin-only by default, manages links, redirects and counts scans', async () => {
    const token = await setupAdmin();
    expect((await call('/api/v1/links')).status).toBe(404); // provider off

    const badDomain = await call(
      '/api/admin/settings',
      {
        method: 'PUT',
        body: JSON.stringify({
          settings: {
            dynamic: {
              provider: 'builtin',
              builtin: { domains: [], publicBaseUrl: 'https://qr.example.com' },
            },
          },
        }),
      },
      token,
    );
    expect(badDomain.status).toBe(400);
    expect(
      (await readJson<{ error: { issues: Array<{ path: string }> } }>(badDomain)).error.issues[0]?.path,
    ).toBe('dynamic.builtin.publicBaseUrl');

    await saveSettings(token, {
      dynamic: {
        provider: 'builtin',
        builtin: {
          domains: ['https://qr.example.com', 'https://qr.example.org'],
          publicBaseUrl: 'https://qr.example.com',
        },
      },
    });
    const health = await readJson<{ features: { dynamicLinks: { provider: string; linkBaseUrl: string } } }>(
      await call('/api/health'),
    );
    expect(health.features.dynamicLinks).toMatchObject({
      provider: 'builtin',
      linkBaseUrl: 'https://qr.example.com',
    });

    expect((await call('/api/v1/links')).status).toBe(401);

    const created = await call(
      '/api/v1/links',
      {
        method: 'POST',
        body: JSON.stringify({ destination: 'https://example.com/spring', label: 'Spring' }),
      },
      token,
    );
    expect(created.status).toBe(201);
    const { link } = await readJson<{ link: { code: string; shortUrl: string; provider: string } }>(created);
    expect(link.provider).toBe('builtin');
    expect(link.shortUrl).toBe(`https://qr.example.com/r/${link.code}`);

    const redirect = await call(`/r/${link.code}`, { redirect: 'manual' });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('Location')).toBe('https://example.com/spring');
    expect(redirect.headers.get('Referrer-Policy')).toBe('no-referrer');
    await call(`/r/${link.code}`, { redirect: 'manual' });

    const details = await readJson<{ link: { scanCount: number }; scansByDay: Array<{ count: number }> }>(
      await call(`/api/v1/links/${link.code}`, {}, token),
    );
    expect(details.link.scanCount).toBe(2);
    expect(details.scansByDay[0]?.count).toBe(2);
    expect(JSON.stringify(details)).not.toMatch(/ip|userAgent|referer/i);

    expect(
      (
        await call(
          `/api/v1/links/${link.code}`,
          { method: 'PATCH', body: JSON.stringify({ destination: 'https://example.com/summer' }) },
          token,
        )
      ).status,
    ).toBe(200);
    expect((await call(`/r/${link.code}`, { redirect: 'manual' })).headers.get('Location')).toBe(
      'https://example.com/summer',
    );

    await call(
      `/api/v1/links/${link.code}`,
      { method: 'PATCH', body: JSON.stringify({ enabled: false }) },
      token,
    );
    expect((await call(`/r/${link.code}`, { redirect: 'manual' })).status).toBe(404);

    const expired = await readJson<{ link: { code: string } }>(
      await call(
        '/api/v1/links',
        {
          method: 'POST',
          body: JSON.stringify({ destination: 'https://example.com/old', expiresAt: '2000-01-01T00:00:00Z' }),
        },
        token,
      ),
    );
    expect((await call(`/r/${expired.link.code}`, { redirect: 'manual' })).status).toBe(404);
    const limited = await readJson<{ link: { code: string } }>(
      await call(
        '/api/v1/links',
        { method: 'POST', body: JSON.stringify({ destination: 'https://example.com/once', maxScans: 1 }) },
        token,
      ),
    );
    expect((await call(`/r/${limited.link.code}`, { redirect: 'manual' })).status).toBe(302);
    expect((await call(`/r/${limited.link.code}`, { redirect: 'manual' })).status).toBe(404);

    expect(
      (
        await call(
          '/api/v1/links',
          // eslint-disable-next-line no-script-url -- deliberately unsafe input
          { method: 'POST', body: JSON.stringify({ destination: 'javascript:alert(1)' }) },
          token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          '/api/v1/links',
          { method: 'POST', body: JSON.stringify({ destination: 'https://example.com', code: 'menu' }) },
          token,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await call(
          '/api/v1/links',
          { method: 'POST', body: JSON.stringify({ destination: 'https://example.com', code: 'menu' }) },
          token,
        )
      ).status,
    ).toBe(409);

    expect((await call(`/api/v1/links/${link.code}`, { method: 'DELETE' }, token)).status).toBe(204);
    expect((await call(`/api/v1/links/${link.code}`, {}, token)).status).toBe(404);
  });

  it('can be opened to the public through a setting', async () => {
    const token = await setupAdmin();
    await saveSettings(token, { dynamic: { provider: 'builtin', publicAccess: true } });
    const created = await call('/api/v1/links', {
      method: 'POST',
      body: JSON.stringify({ destination: 'https://example.com/public' }),
    });
    expect(created.status).toBe(201);
    const { link } = await readJson<{ link: { shortUrl: string; code: string } }>(created);
    expect(link.shortUrl).toBe(`${BASE}/r/${link.code}`);
  });
});

describe('dynamic links: Sink provider', () => {
  interface MockRoute {
    method: string;
    path: string | RegExp;
    status: number;
    body?: unknown;
    expectAuth?: string;
  }
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  let routes: MockRoute[] = [];

  function mockSink(list: MockRoute[]) {
    routes = [...list];
    calls.length = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method ?? 'GET';
      const pathWithQuery = url.pathname + url.search;
      const index = routes.findIndex(
        (r) =>
          r.method === method &&
          (typeof r.path === 'string' ? r.path === pathWithQuery : r.path.test(pathWithQuery)),
      );
      if (index === -1) throw new Error(`Unexpected outbound request ${method} ${url.href}`);
      const route = routes.splice(index, 1)[0]!;
      const headers = new Headers(init?.headers);
      if (route.expectAuth && headers.get('Authorization') !== `Bearer ${route.expectAuth}`)
        return Promise.resolve(new Response('{}', { status: 401 }));
      calls.push({
        method,
        url: url.href,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      return Promise.resolve(
        new Response(route.body === undefined ? null : JSON.stringify(route.body), {
          status: route.status,
          headers: route.body === undefined ? {} : { 'Content-Type': 'application/json' },
        }),
      );
    });
  }

  afterEach(() => {
    expect(routes, 'all mocked Sink routes should have been called').toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('tests the connection and proxies link management to Sink', async () => {
    const token = await setupAdmin();
    mockSink([
      {
        method: 'GET',
        path: '/api/verify',
        status: 200,
        body: { name: 'Sink', authMethod: 'token' },
        expectAuth: 'sink-site-token',
      },
      {
        method: 'GET',
        path: '/api/verify',
        status: 200,
        body: { name: 'Sink' },
        expectAuth: 'sink-site-token',
      },
    ]);
    const test = await call(
      '/api/admin/settings/test-sink',
      {
        method: 'POST',
        body: JSON.stringify({ baseUrl: 'https://sink.example/', token: 'sink-site-token' }),
      },
      token,
    );
    expect(test.status).toBe(200);
    expect((await readJson<{ message: string }>(test)).message).toContain('Sink');
    const bad = await call(
      '/api/admin/settings/test-sink',
      { method: 'POST', body: JSON.stringify({ baseUrl: 'https://sink.example', token: 'wrong' }) },
      token,
    );
    expect(bad.status).toBe(502);
    expect((await readJson<{ message: string }>(bad)).message).toMatch(/token/i);

    await saveSettings(token, {
      dynamic: {
        provider: 'sink',
        sink: {
          baseUrl: 'https://sink.example',
          token: 'sink-site-token',
          domains: ['https://go.example.com'],
          linkBaseUrl: 'https://go.example.com',
        },
      },
    });
    const health = await readJson<{ features: { dynamicLinks: { provider: string; linkBaseUrl: string } } }>(
      await call('/api/health'),
    );
    expect(health.features.dynamicLinks).toMatchObject({
      provider: 'sink',
      linkBaseUrl: 'https://go.example.com',
    });

    mockSink([
      {
        method: 'POST',
        path: '/api/link/create',
        status: 201,
        expectAuth: 'sink-site-token',
        body: {
          link: {
            slug: 'promo',
            url: 'https://example.com/promo',
            comment: 'Promo',
            createdAt: 1_700_000_000,
          },
          shortLink: 'https://sink.example/promo',
        },
      },
      {
        method: 'GET',
        path: /^\/api\/link\/list\?/,
        status: 200,
        body: { links: [{ slug: 'promo', url: 'https://example.com/promo' }], list_complete: true },
      },
      {
        method: 'GET',
        path: '/api/link/query?slug=promo',
        status: 200,
        body: { slug: 'promo', url: 'https://example.com/promo', comment: 'Promo' },
      },
      {
        method: 'PUT',
        path: '/api/link/edit',
        status: 201,
        body: {
          link: { slug: 'promo', url: 'https://example.com/promo-2', comment: 'Promo' },
          shortLink: 'https://sink.example/promo',
        },
      },
      { method: 'POST', path: '/api/link/delete', status: 204 },
      { method: 'POST', path: '/api/link/create', status: 423, body: {} },
    ]);

    const created = await call(
      '/api/v1/links',
      {
        method: 'POST',
        body: JSON.stringify({ destination: 'https://example.com/promo', code: 'promo', label: 'Promo' }),
      },
      token,
    );
    expect(created.status).toBe(201);
    const { link } = await readJson<{ link: { shortUrl: string; provider: string; statsUrl: string } }>(
      created,
    );
    expect(link.provider).toBe('sink');
    expect(link.shortUrl).toBe('https://go.example.com/promo');
    expect(link.statsUrl).toBe('https://sink.example/dashboard/link?slug=promo');
    expect(calls[0]?.body).toEqual({ url: 'https://example.com/promo', slug: 'promo', comment: 'Promo' });

    const list = await readJson<{ provider: string; links: Array<{ code: string }> }>(
      await call('/api/v1/links', {}, token),
    );
    expect(list.provider).toBe('sink');
    expect(list.links[0]?.code).toBe('promo');

    const patched = await call(
      '/api/v1/links/promo',
      { method: 'PATCH', body: JSON.stringify({ destination: 'https://example.com/promo-2' }) },
      token,
    );
    expect(patched.status).toBe(200);
    expect((await readJson<{ link: { destination: string } }>(patched)).link.destination).toBe(
      'https://example.com/promo-2',
    );

    expect((await call('/api/v1/links/promo', { method: 'DELETE' }, token)).status).toBe(204);

    const notReady = await call(
      '/api/v1/links',
      { method: 'POST', body: JSON.stringify({ destination: 'https://example.com/x' }) },
      token,
    );
    expect(notReady.status).toBe(502);
    expect((await readJson<{ error: { code: string } }>(notReady)).error.code).toBe('SINK_NOT_READY');

    // Redirects are not served locally for the Sink provider.
    expect((await call('/r/promo', { redirect: 'manual' })).status).toBe(404);
  });
});
