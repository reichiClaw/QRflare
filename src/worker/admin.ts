/**
 * Admin area backend: password setup/login, signed sessions and settings.
 *
 * - The admin password is either the `ADMIN_PASSWORD` environment variable or
 *   a PBKDF2 hash stored in D1 the first time someone opens the Admin area.
 * - Sessions are stateless HMAC-signed tokens (12 h) kept in the browser's
 *   sessionStorage; the signing secret lives in D1 (or is derived from
 *   ADMIN_PASSWORD when no database is bound).
 * - Login attempts are rate limited per client address in isolate memory only.
 */
import { z } from 'zod';

import { AppSettingsSchema, redactSettings, type AppSettings } from '@shared/settings/schema';
import { deepMerge } from '@shared/style/schema';

import { getDb, hasStorage, kvGet, kvSet } from './db';
import type { Env } from './env';
import { bearerToken, HttpError, json, readJsonBody, safeEqual } from './http';
import { envDefaults, loadSettings, saveSettings } from './settings';
import { testSinkConnection } from './sink';

const PASSWORD_KEY = 'admin.password';
const SECRET_KEY = 'admin.session_secret';
const PBKDF2_ITERATIONS = 25_000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 10;

const PasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(256);

/* ---------- encoding helpers ---------- */

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/* ---------- password hashing ---------- */

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !iterations || !salt || !hash) return false;
  const derived = await pbkdf2(password, fromBase64Url(salt), Number(iterations));
  return safeEqual(toBase64Url(derived), hash);
}

/* ---------- sessions ---------- */

async function sessionSecret(env: Env): Promise<Uint8Array> {
  if (hasStorage(env)) {
    const db = await getDb(env);
    const existing = await kvGet(db, SECRET_KEY);
    if (existing) return fromBase64Url(existing);
    const secret = randomBytes(32);
    await kvSet(db, SECRET_KEY, toBase64Url(secret));
    return secret;
  }
  if (env.ADMIN_PASSWORD) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(`flareqr-session:${env.ADMIN_PASSWORD}`),
    );
    return new Uint8Array(digest);
  }
  throw new HttpError(
    503,
    'ADMIN_UNAVAILABLE',
    'Admin login needs a D1 database or the ADMIN_PASSWORD variable.',
  );
}

async function hmac(secret: Uint8Array, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))));
}

export async function issueSession(env: Env): Promise<{ token: string; expiresAt: string }> {
  const secret = await sessionSecret(env);
  const payload = toBase64Url(
    encoder.encode(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS, n: toBase64Url(randomBytes(12)) })),
  );
  const signature = await hmac(secret, payload);
  return { token: `${payload}.${signature}`, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() };
}

export async function isValidSession(env: Env, token: string | null): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  try {
    const secret = await sessionSecret(env);
    const expected = await hmac(secret, payload);
    if (!safeEqual(expected, signature)) return false;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { exp?: number };
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export async function requireAdmin(request: Request, env: Env): Promise<void> {
  if (!(await isValidSession(env, bearerToken(request)))) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Admin login required.');
  }
}

/* ---------- password state ---------- */

export interface AdminState {
  storage: boolean;
  adminAvailable: boolean;
  setupRequired: boolean;
  passwordSource: 'env' | 'stored' | 'none';
}

export async function adminState(env: Env): Promise<AdminState> {
  const storage = hasStorage(env);
  if (env.ADMIN_PASSWORD)
    return { storage, adminAvailable: true, setupRequired: false, passwordSource: 'env' };
  if (!storage) return { storage, adminAvailable: false, setupRequired: false, passwordSource: 'none' };
  try {
    const db = await getDb(env);
    const stored = await kvGet(db, PASSWORD_KEY);
    return {
      storage,
      adminAvailable: true,
      setupRequired: !stored,
      passwordSource: stored ? 'stored' : 'none',
    };
  } catch {
    return { storage, adminAvailable: false, setupRequired: false, passwordSource: 'none' };
  }
}

async function checkPassword(env: Env, password: string): Promise<boolean> {
  if (env.ADMIN_PASSWORD) return safeEqual(password, env.ADMIN_PASSWORD);
  if (!hasStorage(env)) return false;
  const db = await getDb(env);
  const stored = await kvGet(db, PASSWORD_KEY);
  return stored ? verifyPassword(password, stored) : false;
}

/* ---------- rate limiting (isolate memory only, never persisted) ---------- */

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

function throttle(request: Request): void {
  const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry && entry.resetAt > now) {
    if (entry.count >= MAX_ATTEMPTS) {
      throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many login attempts. Try again in a few minutes.');
    }
    entry.count++;
  } else {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  }
  if (attempts.size > 5000) attempts.clear();
}

/* ---------- routes ---------- */

const CredentialsSchema = z.object({ password: z.string().min(1).max(256) }).strict();
const ChangePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(256), newPassword: PasswordSchema })
  .strict();
const SaveSettingsSchema = z
  .object({
    settings: z.unknown(),
    clearApiToken: z.boolean().optional(),
    clearSinkToken: z.boolean().optional(),
  })
  .strict();
const TestSinkSchema = z
  .object({ baseUrl: z.string().trim().max(500), token: z.string().trim().max(200).optional() })
  .strict();

export async function handleAdmin(request: Request, env: Env, subPath: string): Promise<Response> {
  const path = subPath.replace(/\/+$/, '') || '/';

  if (path === '/status' && request.method === 'GET') {
    const state = await adminState(env);
    const authenticated = state.adminAvailable && (await isValidSession(env, bearerToken(request)));
    return json({ ...state, authenticated });
  }

  if (path === '/setup' && request.method === 'POST') {
    const state = await adminState(env);
    if (!state.storage)
      throw new HttpError(
        503,
        'STORAGE_UNAVAILABLE',
        'A D1 database is required to store the admin password.',
      );
    if (!state.setupRequired)
      throw new HttpError(409, 'ALREADY_CONFIGURED', 'An admin password already exists.');
    const body = CredentialsSchema.safeParse(await readJsonBody(request, 4096));
    if (!body.success) throw new HttpError(400, 'VALIDATION', 'Invalid request.');
    const strength = PasswordSchema.safeParse(body.data.password);
    if (!strength.success)
      throw new HttpError(400, 'WEAK_PASSWORD', strength.error.issues[0]?.message ?? 'Password too short.');
    const db = await getDb(env);
    // Guard against a race between two first visitors.
    const existing = await kvGet(db, PASSWORD_KEY);
    if (existing) throw new HttpError(409, 'ALREADY_CONFIGURED', 'An admin password already exists.');
    await kvSet(db, PASSWORD_KEY, await hashPassword(body.data.password));
    return json(await issueSession(env), { status: 201 });
  }

  if (path === '/login' && request.method === 'POST') {
    throttle(request);
    const state = await adminState(env);
    if (!state.adminAvailable)
      throw new HttpError(503, 'ADMIN_UNAVAILABLE', 'Admin login is not available on this deployment.');
    if (state.setupRequired) throw new HttpError(409, 'SETUP_REQUIRED', 'Create the admin password first.');
    const body = CredentialsSchema.safeParse(await readJsonBody(request, 4096));
    if (!body.success || !(await checkPassword(env, body.data.password))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Wrong password.');
    }
    return json(await issueSession(env));
  }

  if (path === '/logout' && request.method === 'POST') {
    // Sessions are stateless; the client discards the token.
    return new Response(null, { status: 204 });
  }

  await requireAdmin(request, env);

  if (path === '/settings' && request.method === 'GET') {
    const settings = await loadSettings(env);
    const defaults = envDefaults(env);
    return json({
      settings: redactSettings(settings),
      env: {
        adminPasswordFromEnv: Boolean(env.ADMIN_PASSWORD),
        apiTokenFromEnv: Boolean(env.API_TOKEN),
        corsFromEnv: defaults.api.corsAllowedOrigins,
        storage: hasStorage(env),
      },
    });
  }

  if (path === '/settings' && request.method === 'PUT') {
    if (!hasStorage(env)) throw new HttpError(503, 'STORAGE_UNAVAILABLE', 'Settings need a D1 database.');
    const body = SaveSettingsSchema.safeParse(await readJsonBody(request, 64 * 1024));
    if (!body.success) throw new HttpError(400, 'VALIDATION', 'Invalid request.');
    const current = await loadSettings(env);
    const incoming =
      body.data.settings && typeof body.data.settings === 'object'
        ? (body.data.settings as Record<string, unknown>)
        : {};
    // Empty secret fields mean "keep the current secret" unless explicitly cleared.
    const merged = deepMerge(current, incoming) as unknown as AppSettings;
    const incomingApi = (incoming.api ?? {}) as { token?: string };
    const incomingSink = (incoming.dynamic as { sink?: { token?: string } } | undefined)?.sink ?? {};
    merged.api.token = body.data.clearApiToken ? '' : incomingApi.token || current.api.token;
    merged.dynamic.sink.token = body.data.clearSinkToken
      ? ''
      : incomingSink.token || current.dynamic.sink.token;
    delete (merged as unknown as Record<string, unknown>).secrets;
    const parsed = AppSettingsSchema.safeParse(merged);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'VALIDATION',
        'Some settings are invalid.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    await saveSettings(env, parsed.data);
    return json({ settings: redactSettings(parsed.data) });
  }

  if (path === '/settings/test-sink' && request.method === 'POST') {
    const body = TestSinkSchema.safeParse(await readJsonBody(request, 4096));
    if (!body.success) throw new HttpError(400, 'VALIDATION', 'Invalid request.');
    const current = await loadSettings(env);
    const token = body.data.token || current.dynamic.sink.token;
    if (!token) throw new HttpError(400, 'VALIDATION', 'Enter the Sink site token first.');
    const result = await testSinkConnection(body.data.baseUrl, token);
    return json(result, { status: result.ok ? 200 : 502 });
  }

  if (path === '/password' && request.method === 'POST') {
    if (env.ADMIN_PASSWORD)
      throw new HttpError(
        409,
        'PASSWORD_FROM_ENV',
        'The password is set through the ADMIN_PASSWORD variable; change it there.',
      );
    const body = ChangePasswordSchema.safeParse(await readJsonBody(request, 4096));
    if (!body.success)
      throw new HttpError(400, 'WEAK_PASSWORD', body.error.issues[0]?.message ?? 'Invalid request.');
    if (!(await checkPassword(env, body.data.currentPassword)))
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'The current password is wrong.');
    const db = await getDb(env);
    await kvSet(db, PASSWORD_KEY, await hashPassword(body.data.newPassword));
    return new Response(null, { status: 204 });
  }

  throw new HttpError(404, 'NOT_FOUND', 'Unknown admin endpoint.');
}
