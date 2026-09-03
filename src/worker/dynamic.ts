/**
 * Optional dynamic QR module (feature-flagged, D1-backed).
 *
 * Disabled unless DYNAMIC_QR_ENABLED="true" AND a D1 binding named DYNAMIC_DB
 * exists. The static generator never depends on this module.
 *
 * Privacy: only aggregate scan counters (total + per UTC day) are stored. No
 * IP addresses, user agents, referrers, cookies or fingerprints.
 */
import { z } from 'zod';

import { dynamicQrEnabled, type Env } from './env';
import { bearerToken, HttpError, json, readJsonBody, safeEqual } from './http';

const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_REGEX = /^[A-Za-z0-9_-]{4,32}$/;

const LinkInputSchema = z
  .object({
    code: z
      .string()
      .regex(CODE_REGEX, 'Code must be 4-32 characters: letters, digits, "-" or "_".')
      .optional(),
    destination: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine((v) => /^https?:\/\//i.test(v), 'Destination must be an http(s) URL.'),
    label: z.string().trim().max(120).optional(),
    enabled: z.boolean().default(true),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    maxScans: z.number().int().min(1).max(1_000_000_000).nullable().optional(),
  })
  .strict();

const LinkPatchSchema = LinkInputSchema.omit({ code: true }).partial().strict();

interface LinkRow {
  code: string;
  destination: string;
  label: string | null;
  enabled: number;
  expires_at: string | null;
  max_scans: number | null;
  scan_count: number;
  created_at: string;
  updated_at: string;
}

function toPublic(row: LinkRow, origin: string) {
  return {
    code: row.code,
    shortUrl: `${origin}/r/${row.code}`,
    destination: row.destination,
    label: row.label,
    enabled: row.enabled === 1,
    expiresAt: row.expires_at,
    maxScans: row.max_scans,
    scanCount: row.scan_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function randomCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function requireAdmin(request: Request, env: Env): void {
  if (!env.DYNAMIC_ADMIN_TOKEN) {
    throw new HttpError(
      503,
      'ADMIN_TOKEN_MISSING',
      'Set the DYNAMIC_ADMIN_TOKEN secret to manage dynamic links.',
    );
  }
  const token = bearerToken(request);
  if (!token || !safeEqual(token, env.DYNAMIC_ADMIN_TOKEN)) {
    throw new HttpError(401, 'UNAUTHORIZED', 'A valid admin bearer token is required.');
  }
}

function db(env: Env): D1Database {
  if (!env.DYNAMIC_DB) throw new HttpError(404, 'FEATURE_DISABLED', 'The dynamic QR module is not enabled.');
  return env.DYNAMIC_DB;
}

function unavailablePage(reason: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link unavailable</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#0b1220;color:#e2e8f0}main{text-align:center;padding:2rem}h1{font-size:1.5rem}p{color:#94a3b8}</style></head><body><main><h1>This link is unavailable</h1><p>${reason}</p></main></body></html>`;
  return new Response(html, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    },
  });
}

/** GET /r/:code – public redirect. */
export async function handleRedirect(request: Request, env: Env, code: string): Promise<Response> {
  if (!dynamicQrEnabled(env)) return unavailablePage('Dynamic links are not enabled on this deployment.');
  if (!CODE_REGEX.test(code)) return unavailablePage('The link code is invalid.');
  const database = db(env);
  const row = await database.prepare('SELECT * FROM links WHERE code = ?1').bind(code).first<LinkRow>();
  if (!row) return unavailablePage('No link exists for this code.');
  if (row.enabled !== 1) return unavailablePage('The link has been disabled.');
  if (row.expires_at && Date.parse(row.expires_at) < Date.now())
    return unavailablePage('The link has expired.');
  if (row.max_scans !== null && row.scan_count >= row.max_scans)
    return unavailablePage('The link reached its scan limit.');

  const day = new Date().toISOString().slice(0, 10);
  // Counters are aggregate only – nothing about the visitor is stored.
  await database.batch([
    database.prepare('UPDATE links SET scan_count = scan_count + 1 WHERE code = ?1').bind(code),
    database
      .prepare(
        'INSERT INTO scan_daily (code, day, count) VALUES (?1, ?2, 1) ON CONFLICT(code, day) DO UPDATE SET count = count + 1',
      )
      .bind(code, day),
  ]);

  return new Response(null, {
    status: 302,
    headers: {
      Location: row.destination,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/** /api/v1/dynamic/* – admin API. */
export async function handleDynamicApi(request: Request, env: Env, subPath: string): Promise<Response> {
  if (!dynamicQrEnabled(env)) {
    throw new HttpError(404, 'FEATURE_DISABLED', 'The dynamic QR module is not enabled on this deployment.');
  }
  requireAdmin(request, env);
  const database = db(env);
  const origin = new URL(request.url).origin;
  const segments = subPath.split('/').filter(Boolean);

  if (segments[0] !== 'links') throw new HttpError(404, 'NOT_FOUND', 'Unknown dynamic endpoint.');
  const code = segments[1];

  if (!code) {
    if (request.method === 'GET') {
      const { results } = await database
        .prepare('SELECT * FROM links ORDER BY created_at DESC LIMIT 500')
        .all<LinkRow>();
      return json({ links: results.map((r) => toPublic(r, origin)) });
    }
    if (request.method === 'POST') {
      const body = LinkInputSchema.safeParse(await readJsonBody(request, 16_384));
      if (!body.success) {
        throw new HttpError(
          400,
          'VALIDATION',
          'Invalid link.',
          body.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        );
      }
      const now = new Date().toISOString();
      let linkCode = body.data.code ?? randomCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await database
          .prepare('SELECT code FROM links WHERE code = ?1')
          .bind(linkCode)
          .first();
        if (!existing) break;
        if (body.data.code) throw new HttpError(409, 'CONFLICT', 'A link with this code already exists.');
        linkCode = randomCode();
      }
      await database
        .prepare(
          'INSERT INTO links (code, destination, label, enabled, expires_at, max_scans, scan_count, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?7)',
        )
        .bind(
          linkCode,
          body.data.destination,
          body.data.label ?? null,
          body.data.enabled ? 1 : 0,
          body.data.expiresAt ?? null,
          body.data.maxScans ?? null,
          now,
        )
        .run();
      const row = await database
        .prepare('SELECT * FROM links WHERE code = ?1')
        .bind(linkCode)
        .first<LinkRow>();
      return json({ link: row ? toPublic(row, origin) : null }, { status: 201 });
    }
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.');
  }

  if (!CODE_REGEX.test(code)) throw new HttpError(400, 'VALIDATION', 'Invalid link code.');
  const row = await database.prepare('SELECT * FROM links WHERE code = ?1').bind(code).first<LinkRow>();
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Link not found.');

  if (request.method === 'GET') {
    const { results } = await database
      .prepare('SELECT day, count FROM scan_daily WHERE code = ?1 ORDER BY day DESC LIMIT 90')
      .bind(code)
      .all<{ day: string; count: number }>();
    return json({ link: toPublic(row, origin), scansByDay: results });
  }
  if (request.method === 'PATCH') {
    const body = LinkPatchSchema.safeParse(await readJsonBody(request, 16_384));
    if (!body.success) {
      throw new HttpError(
        400,
        'VALIDATION',
        'Invalid update.',
        body.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    const patch = body.data;
    const next = {
      destination: patch.destination ?? row.destination,
      label: patch.label === undefined ? row.label : patch.label,
      enabled: patch.enabled === undefined ? row.enabled : patch.enabled ? 1 : 0,
      expires_at: patch.expiresAt === undefined ? row.expires_at : patch.expiresAt,
      max_scans: patch.maxScans === undefined ? row.max_scans : patch.maxScans,
    };
    await database
      .prepare(
        'UPDATE links SET destination = ?2, label = ?3, enabled = ?4, expires_at = ?5, max_scans = ?6, updated_at = ?7 WHERE code = ?1',
      )
      .bind(
        code,
        next.destination,
        next.label,
        next.enabled,
        next.expires_at,
        next.max_scans,
        new Date().toISOString(),
      )
      .run();
    const updated = await database.prepare('SELECT * FROM links WHERE code = ?1').bind(code).first<LinkRow>();
    return json({ link: updated ? toPublic(updated, origin) : null });
  }
  if (request.method === 'DELETE') {
    await database.batch([
      database.prepare('DELETE FROM scan_daily WHERE code = ?1').bind(code),
      database.prepare('DELETE FROM links WHERE code = ?1').bind(code),
    ]);
    return new Response(null, { status: 204 });
  }
  throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET, PATCH or DELETE.');
}
