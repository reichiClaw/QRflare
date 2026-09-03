/**
 * Dynamic links: short URLs whose destination can change after the QR code
 * has been printed. Two providers share one API and UI:
 *
 *  - `builtin`: stored in this Worker's D1 database, served from `/r/<code>`.
 *    Only aggregate scan counters are kept – no IP addresses, user agents,
 *    referrers, cookies or fingerprints.
 *  - `sink`: links live in a self-hosted Sink instance (miantiao-me/sink);
 *    this Worker proxies the admin operations to Sink's API.
 *
 * Which provider is active, and whether unauthenticated users may manage
 * links, is configured in the Admin area.
 */
import { z } from 'zod';

import type { AppSettings } from '@shared/settings/schema';
import { resolveLinkBaseUrl } from '@shared/settings/schema';

import { requireAdmin } from './admin';
import { getDb, hasStorage } from './db';
import type { Env } from './env';
import { HttpError, json, readJsonBody } from './http';
import { loadSettings } from './settings';
import { SinkClient, type SinkLink } from './sink';

const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_REGEX = /^[A-Za-z0-9_-]{2,64}$/;

const LinkInputSchema = z
  .object({
    code: z
      .string()
      .regex(CODE_REGEX, 'Code must be 2-64 characters: letters, digits, "-" or "_".')
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

export interface DynamicLink {
  code: string;
  shortUrl: string;
  destination: string;
  label: string | null;
  enabled: boolean;
  expiresAt: string | null;
  maxScans: number | null;
  /** Aggregate scan count (built-in provider only). */
  scanCount: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  provider: 'builtin' | 'sink';
  /** Where to inspect statistics for this link (Sink dashboard) if available. */
  statsUrl: string | null;
}

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

function randomCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
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

/* ---------- provider interface ---------- */

interface LinkProvider {
  readonly kind: 'builtin' | 'sink';
  list(): Promise<DynamicLink[]>;
  get(code: string): Promise<{ link: DynamicLink; scansByDay: Array<{ day: string; count: number }> }>;
  create(input: z.infer<typeof LinkInputSchema>): Promise<DynamicLink>;
  update(code: string, patch: z.infer<typeof LinkPatchSchema>): Promise<DynamicLink>;
  remove(code: string): Promise<void>;
}

class BuiltinProvider implements LinkProvider {
  readonly kind = 'builtin' as const;
  constructor(
    private readonly db: D1Database,
    private readonly baseUrl: string,
  ) {}

  private toPublic(row: LinkRow): DynamicLink {
    return {
      code: row.code,
      shortUrl: `${this.baseUrl}/r/${row.code}`,
      destination: row.destination,
      label: row.label,
      enabled: row.enabled === 1,
      expiresAt: row.expires_at,
      maxScans: row.max_scans,
      scanCount: row.scan_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      provider: 'builtin',
      statsUrl: null,
    };
  }

  private async row(code: string): Promise<LinkRow> {
    const row = await this.db.prepare('SELECT * FROM links WHERE code = ?1').bind(code).first<LinkRow>();
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Link not found.');
    return row;
  }

  async list(): Promise<DynamicLink[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM links ORDER BY created_at DESC LIMIT 500')
      .all<LinkRow>();
    return results.map((r) => this.toPublic(r));
  }

  async get(code: string) {
    const row = await this.row(code);
    const { results } = await this.db
      .prepare('SELECT day, count FROM scan_daily WHERE code = ?1 ORDER BY day DESC LIMIT 90')
      .bind(code)
      .all<{ day: string; count: number }>();
    return { link: this.toPublic(row), scansByDay: results };
  }

  async create(input: z.infer<typeof LinkInputSchema>): Promise<DynamicLink> {
    const now = new Date().toISOString();
    let code = input.code ?? randomCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await this.db.prepare('SELECT code FROM links WHERE code = ?1').bind(code).first();
      if (!existing) break;
      if (input.code) throw new HttpError(409, 'CONFLICT', 'A link with this code already exists.');
      code = randomCode();
    }
    await this.db
      .prepare(
        'INSERT INTO links (code, destination, label, enabled, expires_at, max_scans, scan_count, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?7)',
      )
      .bind(
        code,
        input.destination,
        input.label ?? null,
        input.enabled ? 1 : 0,
        input.expiresAt ?? null,
        input.maxScans ?? null,
        now,
      )
      .run();
    return this.toPublic(await this.row(code));
  }

  async update(code: string, patch: z.infer<typeof LinkPatchSchema>): Promise<DynamicLink> {
    const row = await this.row(code);
    await this.db
      .prepare(
        'UPDATE links SET destination = ?2, label = ?3, enabled = ?4, expires_at = ?5, max_scans = ?6, updated_at = ?7 WHERE code = ?1',
      )
      .bind(
        code,
        patch.destination ?? row.destination,
        patch.label === undefined ? row.label : patch.label,
        patch.enabled === undefined ? row.enabled : patch.enabled ? 1 : 0,
        patch.expiresAt === undefined ? row.expires_at : patch.expiresAt,
        patch.maxScans === undefined ? row.max_scans : patch.maxScans,
        new Date().toISOString(),
      )
      .run();
    return this.toPublic(await this.row(code));
  }

  async remove(code: string): Promise<void> {
    await this.row(code);
    await this.db.batch([
      this.db.prepare('DELETE FROM scan_daily WHERE code = ?1').bind(code),
      this.db.prepare('DELETE FROM links WHERE code = ?1').bind(code),
    ]);
  }
}

class SinkProvider implements LinkProvider {
  readonly kind = 'sink' as const;
  private readonly client: SinkClient;
  constructor(
    private readonly settings: AppSettings['dynamic']['sink'],
    private readonly linkBaseUrl: string,
  ) {
    this.client = new SinkClient(settings.baseUrl, settings.token);
  }

  private toPublic(link: SinkLink): DynamicLink {
    const toIso = (seconds?: number | null) =>
      typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
    return {
      code: link.slug,
      shortUrl: `${this.linkBaseUrl}/${link.slug}`,
      destination: link.url,
      label: link.comment ?? null,
      enabled: link.expiration ? link.expiration * 1000 > Date.now() : true,
      expiresAt: toIso(link.expiration),
      maxScans: null,
      scanCount: null,
      createdAt: toIso(link.createdAt),
      updatedAt: toIso(link.updatedAt),
      provider: 'sink',
      statsUrl: `${this.settings.baseUrl}/dashboard/link?slug=${encodeURIComponent(link.slug)}`,
    };
  }

  async list(): Promise<DynamicLink[]> {
    return (await this.client.list()).map((l) => this.toPublic(l));
  }

  async get(code: string) {
    return { link: this.toPublic(await this.client.get(code)), scansByDay: [] };
  }

  async create(input: z.infer<typeof LinkInputSchema>): Promise<DynamicLink> {
    const result = await this.client.create({
      url: input.destination,
      ...(input.code ? { slug: input.code } : {}),
      ...(input.label ? { comment: input.label } : {}),
      ...(input.expiresAt ? { expiration: Math.floor(Date.parse(input.expiresAt) / 1000) } : {}),
    });
    return this.toPublic(result.link);
  }

  async update(code: string, patch: z.infer<typeof LinkPatchSchema>): Promise<DynamicLink> {
    const current = await this.client.get(code);
    const expiresAt =
      patch.expiresAt === undefined
        ? (current.expiration ?? undefined)
        : patch.expiresAt
          ? Math.floor(Date.parse(patch.expiresAt) / 1000)
          : undefined;
    const result = await this.client.edit({
      slug: code,
      url: patch.destination ?? current.url,
      comment: patch.label === undefined ? current.comment : (patch.label ?? undefined),
      ...(expiresAt ? { expiration: expiresAt } : {}),
    });
    return this.toPublic(result.link);
  }

  async remove(code: string): Promise<void> {
    await this.client.delete(code);
  }
}

async function providerFor(env: Env, settings: AppSettings, requestOrigin: string): Promise<LinkProvider> {
  const baseUrl = resolveLinkBaseUrl(settings, requestOrigin);
  if (settings.dynamic.provider === 'sink') return new SinkProvider(settings.dynamic.sink, baseUrl);
  if (settings.dynamic.provider === 'builtin') {
    if (!hasStorage(env))
      throw new HttpError(503, 'STORAGE_UNAVAILABLE', 'Built-in links need a D1 database.');
    return new BuiltinProvider(await getDb(env), baseUrl);
  }
  throw new HttpError(
    404,
    'FEATURE_DISABLED',
    'Dynamic links are disabled. Enable them in Admin → Settings.',
  );
}

/* ---------- public redirect (built-in provider) ---------- */

export async function handleRedirect(request: Request, env: Env, code: string): Promise<Response> {
  const settings = await loadSettings(env);
  if (settings.dynamic.provider !== 'builtin')
    return unavailablePage('Dynamic links are not enabled on this deployment.');
  if (!CODE_REGEX.test(code)) return unavailablePage('The link code is invalid.');
  const db = await getDb(env);
  const row = await db.prepare('SELECT * FROM links WHERE code = ?1').bind(code).first<LinkRow>();
  if (!row) return unavailablePage('No link exists for this code.');
  if (row.enabled !== 1) return unavailablePage('The link has been disabled.');
  if (row.expires_at && Date.parse(row.expires_at) < Date.now())
    return unavailablePage('The link has expired.');
  if (row.max_scans !== null && row.scan_count >= row.max_scans)
    return unavailablePage('The link reached its scan limit.');

  const day = new Date().toISOString().slice(0, 10);
  await db.batch([
    db.prepare('UPDATE links SET scan_count = scan_count + 1 WHERE code = ?1').bind(code),
    db
      .prepare(
        'INSERT INTO scan_daily (code, day, count) VALUES (?1, ?2, 1) ON CONFLICT(code, day) DO UPDATE SET count = count + 1',
      )
      .bind(code, day),
  ]);

  return new Response(null, {
    status: 302,
    headers: { Location: row.destination, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

/* ---------- management API: /api/v1/links ---------- */

export async function handleLinksApi(request: Request, env: Env, subPath: string): Promise<Response> {
  const settings = await loadSettings(env);
  if (settings.dynamic.provider === 'off') {
    throw new HttpError(
      404,
      'FEATURE_DISABLED',
      'Dynamic links are disabled. Enable them in Admin → Settings.',
    );
  }
  if (!settings.dynamic.publicAccess) await requireAdmin(request, env);

  const provider = await providerFor(env, settings, new URL(request.url).origin);
  const segments = subPath.split('/').filter(Boolean);
  const code = segments[0];

  if (!code) {
    if (request.method === 'GET') return json({ provider: provider.kind, links: await provider.list() });
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
      return json({ link: await provider.create(body.data) }, { status: 201 });
    }
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.');
  }

  if (!CODE_REGEX.test(code)) throw new HttpError(400, 'VALIDATION', 'Invalid link code.');
  if (request.method === 'GET') return json(await provider.get(code));
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
    return json({ link: await provider.update(code, body.data) });
  }
  if (request.method === 'DELETE') {
    await provider.remove(code);
    return new Response(null, { status: 204 });
  }
  throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET, PATCH or DELETE.');
}
