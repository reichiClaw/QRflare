/**
 * Worker environment bindings.
 *
 * Only `ASSETS` and `DB` come from wrangler.jsonc; `DB` is auto-provisioned on
 * deploy (no id is hard-coded). Everything else is optional and can instead be
 * configured in the Admin area of the app.
 */
export interface Env {
  /** Static assets binding (configured in wrangler.jsonc). */
  ASSETS: Fetcher;
  /** D1 database for settings and built-in dynamic links (auto-provisioned). */
  DB?: D1Database;
  /** Optional admin password. If unset, the first visitor of the Admin area chooses one. */
  ADMIN_PASSWORD?: string;
  /** Defaults that the Admin area can override. */
  APP_NAME?: string;
  CORS_ALLOWED_ORIGINS?: string;
  API_TOKEN?: string;
  MAX_RASTER_SIZE?: string;
}

declare global {
  const __APP_VERSION__: string;
  const __APP_COMMIT__: string;
  const __APP_BUILD_TIME__: string;
}
