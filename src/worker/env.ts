/**
 * Worker environment bindings. Everything is optional so a clean deployment
 * works without configuring anything.
 */
export interface Env {
  /** Static assets binding (configured in wrangler.jsonc). */
  ASSETS: Fetcher;
  APP_NAME?: string;
  /** Comma-separated list of origins allowed to call the API cross-origin. */
  CORS_ALLOWED_ORIGINS?: string;
  /** Optional bearer token protecting /api/v1/* for non-browser clients (secret). */
  API_TOKEN?: string;
  /** Maximum raster edge length in pixels (default 4096). */
  MAX_RASTER_SIZE?: string;
  /** "true" enables the optional dynamic QR module (requires DYNAMIC_DB). */
  DYNAMIC_QR_ENABLED?: string;
  /** Admin token for the dynamic QR module (secret). */
  DYNAMIC_ADMIN_TOKEN?: string;
  /** D1 database for the dynamic QR module. */
  DYNAMIC_DB?: D1Database;
}

declare global {
  const __APP_VERSION__: string;
  const __APP_COMMIT__: string;
  const __APP_BUILD_TIME__: string;
}

export function parseAllowedOrigins(env: Env): string[] {
  return (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function maxRasterSize(env: Env): number {
  const parsed = Number.parseInt(env.MAX_RASTER_SIZE ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 128) return 4096;
  return Math.min(parsed, 8192);
}

export function dynamicQrEnabled(env: Env): boolean {
  return env.DYNAMIC_QR_ENABLED === 'true' && env.DYNAMIC_DB !== undefined;
}
