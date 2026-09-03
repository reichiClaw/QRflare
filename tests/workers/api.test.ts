import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { isJpeg, isPng, jpegDimensions, pngDimensions } from '@shared/raster/signatures';
import { base64Encode } from '@shared/security/data-url';

const BASE = 'https://flareqr.test';

function readJson<T>(res: Response): Promise<T> {
  return res.json<T>();
}

function post(path: string, body: unknown, init: RequestInit = {}) {
  return SELF.fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
}

const urlRequest = (output: Record<string, unknown> = {}) => ({
  content: { type: 'url', value: { url: 'https://example.com' } },
  qr: { errorCorrection: 'H' },
  style: { moduleShape: 'rounded', foreground: '#082F49' },
  output: { format: 'png', size: 256, filename: 'example-qr', ...output },
});

describe('GET /api/health', () => {
  it('returns status, version and limits without secrets', async () => {
    const res = await SELF.fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    const body = await readJson<Record<string, unknown>>(res);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('test');
    expect((body.api as Record<string, string>).version).toBe('v1');
    const features = body.features as {
      storage: boolean;
      adminSetupRequired: boolean;
      dynamicLinks: { provider: string };
    };
    expect(features.storage).toBe(true);
    expect(features.adminSetupRequired).toBe(true);
    expect(features.dynamicLinks.provider).toBe('off');
    expect(JSON.stringify(body)).not.toMatch(/API_TOKEN|ADMIN_PASSWORD|CORS_ALLOWED_ORIGINS|token"/);
  });

  it('sends security and caching headers', async () => {
    const res = await SELF.fetch(`${BASE}/api/health`);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('Permissions-Policy')).toBeTruthy();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('GET /api/v1/schema', () => {
  it('returns the JSON schema and the OpenAPI reference', async () => {
    const res = await SELF.fetch(`${BASE}/api/v1/schema`);
    expect(res.status).toBe(200);
    const body = await readJson<{ openapi: string; requestSchema: { properties: Record<string, unknown> } }>(
      res,
    );
    expect(body.openapi).toBe('/openapi.yaml');
    expect(Object.keys(body.requestSchema.properties)).toEqual(['content', 'qr', 'style', 'output']);
  });
});

describe('POST /api/v1/validate', () => {
  it('returns normalized settings, capacity info and warnings', async () => {
    const res = await post('/api/v1/validate', {
      content: { type: 'wifi', value: { ssid: 'Cafe Guest', password: 'latte;art', encryption: 'WPA' } },
      style: { foreground: '#CCCCCC' },
    });
    expect(res.status).toBe(200);
    const body = await readJson<{
      ok: boolean;
      payload: string;
      qr: { version: number; errorCorrection: string };
      reliability: { status: string; warnings: Array<{ id: string }> };
      normalized: { style: { foreground: string } };
    }>(res);
    expect(body.ok).toBe(true);
    expect(body.payload).toBe('WIFI:T:WPA;S:Cafe Guest;P:latte\\;art;;');
    expect(body.qr.version).toBeGreaterThanOrEqual(1);
    expect(body.normalized.style.foreground).toBe('#CCCCCC');
    expect(body.reliability.warnings.some((w) => w.id.startsWith('contrast'))).toBe(true);
  });

  it('rejects invalid content with field-level issues and no payload echo', async () => {
    const res = await post('/api/v1/validate', {
      content: { type: 'email', value: { to: 'not-an-email', subject: 'top secret payload text' } },
    });
    expect(res.status).toBe(400);
    const body = await readJson<{ error: { code: string; issues: Array<{ path: string }> } }>(res);
    expect(body.error.code).toBe('VALIDATION');
    expect(body.error.issues.some((i) => i.path === 'content.value.to')).toBe(true);
    expect(JSON.stringify(body)).not.toContain('top secret payload text');
  });
});

describe('POST /api/v1/generate', () => {
  it('returns a genuine PNG with correct headers', async () => {
    const res = await post('/api/v1/generate', urlRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Content-Disposition')).toContain('filename="example-qr.png"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-QR-Error-Correction')).toBe('H');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(isPng(bytes)).toBe(true);
    expect(pngDimensions(bytes)).toEqual({ width: 256, height: 256 });
  });

  it('returns a genuine JPEG flattened onto an opaque background', async () => {
    const res = await post('/api/v1/generate', {
      ...urlRequest({ format: 'jpeg', size: 200, jpegQuality: 80, jpegBackground: '#FFEE00' }),
      style: { transparentBackground: true },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Content-Disposition')).toContain('filename="example-qr.jpg"');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(isJpeg(bytes)).toBe(true);
    expect(jpegDimensions(bytes)).toEqual({ width: 200, height: 200 });
  });

  it('returns a self-contained SVG', async () => {
    const res = await post('/api/v1/generate', urlRequest({ format: 'svg' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(res.headers.get('Content-Disposition')).toContain('filename="example-qr.svg"');
    const svg = await res.text();
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).not.toMatch(/href="https?:/);
    expect(svg).not.toMatch(/url\(\s*['"]?https?:/);
    expect(svg).not.toMatch(/<script/i);
  });

  it('renders captions with the bundled font', async () => {
    const res = await post('/api/v1/generate', {
      ...urlRequest({ format: 'png', size: 300 }),
      style: {
        layout: {
          caption: {
            enabled: true,
            text: 'Scan me',
            fontSize: 80,
            fontWeight: 700,
            align: 'center',
            letterSpacing: 0,
            color: '#000000',
            position: 'bottom',
            gap: 20,
          },
        },
      },
    });
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const dims = pngDimensions(bytes);
    expect(dims?.width).toBe(300);
    expect(dims?.height ?? 0).toBeGreaterThan(300);
  });

  it('rejects unsupported output formats', async () => {
    const res = await post('/api/v1/generate', urlRequest({ format: 'gif' }));
    expect(res.status).toBe(400);
    const body = await readJson<{ error: { code: string; issues: Array<{ path: string }> } }>(res);
    expect(body.error.code).toBe('VALIDATION');
    expect(body.error.issues.some((i) => i.path.includes('output.format'))).toBe(true);
  });

  it('rejects invalid dimensions before rendering', async () => {
    for (const size of [64, 10000, -1, 1.5]) {
      const res = await post('/api/v1/generate', urlRequest({ size }));
      expect(res.status, `size ${size}`).toBe(400);
    }
  });

  it('rejects payloads that exceed QR capacity with 422', async () => {
    const res = await post('/api/v1/generate', {
      content: { type: 'text', value: { text: 'x'.repeat(3000) } },
      qr: { errorCorrection: 'H' },
      output: { format: 'svg' },
    });
    expect(res.status).toBe(422);
    const body = await readJson<{ error: { code: string; message: string } }>(res);
    expect(body.error.code).toBe('CAPACITY');
    expect(body.error.message).not.toContain('xxxxxxxx');
  });

  it('rejects oversized request bodies', async () => {
    const huge = JSON.stringify({
      content: { type: 'text', value: { text: 'a' } },
      style: { pad: 'x'.repeat(1_700_000) },
    });
    const res = await post('/api/v1/generate', huge);
    expect(res.status).toBe(413);
  });

  it('rejects unsafe SVG logos and malformed base64', async () => {
    const evil = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>`;
    const evilUrl = `data:image/svg+xml;base64,${base64Encode(new TextEncoder().encode(evil))}`;
    const res = await post('/api/v1/generate', {
      ...urlRequest({ format: 'svg' }),
      style: { logo: { enabled: true, dataUrl: evilUrl } },
    });
    // Scripts are stripped by the sanitizer; the response must never contain them.
    expect(res.status).toBe(200);
    const svg = await res.text();
    expect(svg).not.toMatch(/<script/i);
    expect(svg).toContain('<image');

    const bad = await post('/api/v1/generate', {
      ...urlRequest({ format: 'svg' }),
      style: { logo: { enabled: true, dataUrl: 'data:image/png;base64,@@@notbase64' } },
    });
    expect(bad.status).toBe(400);

    const mismatch = await post('/api/v1/generate', {
      ...urlRequest({ format: 'svg' }),
      style: {
        logo: {
          enabled: true,
          dataUrl: `data:image/png;base64,${base64Encode(new TextEncoder().encode(evil))}`,
        },
      },
    });
    expect(mismatch.status).toBe(400);
    const mismatchBody = await readJson<{ error: { code: string } }>(mismatch);
    expect(mismatchBody.error.code).toBe('LOGO');
  });

  it('rejects non-JSON bodies and unknown fields', async () => {
    const text = await SELF.fetch(`${BASE}/api/v1/generate`, {
      method: 'POST',
      body: 'hello',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(text.status).toBe(415);
    const unknown = await post('/api/v1/generate', { ...urlRequest(), extra: true });
    expect(unknown.status).toBe(400);
    const badJson = await post('/api/v1/generate', '{not json');
    expect(badJson.status).toBe(400);
  });

  it('returns 404/405 for unknown routes and methods with the JSON error format', async () => {
    const missing = await SELF.fetch(`${BASE}/api/v1/nope`);
    expect(missing.status).toBe(404);
    expect((await readJson<{ error: { code: string } }>(missing)).error.code).toBe('NOT_FOUND');
    const wrongMethod = await SELF.fetch(`${BASE}/api/v1/generate`);
    expect(wrongMethod.status).toBe(405);
  });
});

describe('CORS', () => {
  it('does not emit CORS headers for unknown origins', async () => {
    const res = await SELF.fetch(`${BASE}/api/health`, { headers: { Origin: 'https://evil.example' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const preflight = await SELF.fetch(`${BASE}/api/v1/generate`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    expect(preflight.status).toBe(403);
  });

  it('allows configured origins only', async () => {
    const res = await SELF.fetch(`${BASE}/api/health`, { headers: { Origin: 'https://allowed.example' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://allowed.example');
    expect(res.headers.get('Vary')).toContain('Origin');
    const preflight = await SELF.fetch(`${BASE}/api/v1/generate`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://allowed.example' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});

describe('dynamic links (off by default)', () => {
  it('reports the feature as disabled and serves a 404 page for /r/*', async () => {
    expect(env.DB).toBeDefined();
    const api = await SELF.fetch(`${BASE}/api/v1/links`, { headers: { Authorization: 'Bearer x' } });
    expect(api.status).toBe(404);
    const redirect = await SELF.fetch(`${BASE}/r/abcd1234`, { redirect: 'manual' });
    expect(redirect.status).toBe(404);
    expect(redirect.headers.get('Content-Type')).toContain('text/html');
  });
});
