/**
 * Loads and saves application settings. Environment variables seed the
 * defaults; values saved through the Admin area (stored in D1) win.
 */
import {
  AppSettingsSchema,
  DEFAULT_SETTINGS,
  type AppSettings,
  type AppSettingsInput,
} from '@shared/settings/schema';
import { deepMerge } from '@shared/style/schema';

import { getDb, hasStorage, kvGet, kvSet } from './db';
import type { Env } from './env';

const SETTINGS_KEY = 'settings';
const CACHE_TTL_MS = 10_000;

interface CacheEntry {
  settings: AppSettings;
  loadedAt: number;
}

let cache = new WeakMap<D1Database, CacheEntry>();

/** Settings derived purely from environment variables (used with and without storage). */
export function envDefaults(env: Env): AppSettings {
  const cors = (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => /^https?:\/\/[^\s/]+$/.test(s));
  const maxRaster = Number.parseInt(env.MAX_RASTER_SIZE ?? '', 10);
  const input: AppSettingsInput = {
    general: { appName: env.APP_NAME?.trim() || DEFAULT_SETTINGS.general.appName },
    api: {
      requireToken: Boolean(env.API_TOKEN),
      token: env.API_TOKEN ?? '',
      corsAllowedOrigins: cors,
      maxRasterSize: Number.isFinite(maxRaster) && maxRaster >= 128 ? Math.min(maxRaster, 8192) : 4096,
    },
  };
  const parsed = AppSettingsSchema.safeParse(input);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function loadSettings(env: Env): Promise<AppSettings> {
  const base = envDefaults(env);
  if (!hasStorage(env)) return base;
  const cached = cache.get(env.DB);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.settings;
  try {
    const db = await getDb(env);
    const raw = await kvGet(db, SETTINGS_KEY);
    let settings = base;
    if (raw) {
      const merged = deepMerge(base, JSON.parse(raw));
      const parsed = AppSettingsSchema.safeParse(merged);
      if (parsed.success) settings = parsed.data;
    }
    cache.set(env.DB, { settings, loadedAt: Date.now() });
    return settings;
  } catch {
    // Storage hiccup: fall back to environment defaults rather than failing requests.
    return base;
  }
}

export async function saveSettings(env: Env, settings: AppSettings): Promise<void> {
  const db = await getDb(env);
  await kvSet(db, SETTINGS_KEY, JSON.stringify(settings));
  cache.set(db, { settings, loadedAt: Date.now() });
}

export function invalidateSettingsCache(env: Env): void {
  if (hasStorage(env)) cache.delete(env.DB);
}

/** Test hook: drop every cached settings entry. */
export function resetSettingsCache(): void {
  cache = new WeakMap();
}
