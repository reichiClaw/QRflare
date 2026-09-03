/**
 * EdgeQR Studio – Cloudflare Worker entry point.
 *
 * Static assets are served by Cloudflare's asset pipeline (with SPA fallback);
 * this Worker only runs for /api/* and /r/* thanks to `run_worker_first`.
 * Every other request is forwarded to the ASSETS binding as a safety net.
 */
import { handleGenerate, handleHealth, handleSchema, handleValidate } from './api';
import { handleDynamicApi, handleRedirect } from './dynamic';
import type { Env } from './env';
import { applyHeaders, bearerToken, corsContext, errorResponse, HttpError, preflight, safeEqual } from './http';

function requireApiToken(request: Request, env: Env): void {
  if (!env.API_TOKEN) return;
  // The bundled frontend is exempt: browsers mark its requests as same-origin.
  const site = request.headers.get('Sec-Fetch-Site');
  const origin = request.headers.get('Origin');
  const self = new URL(request.url).origin;
  if (site === 'same-origin' && (origin === null || origin === self)) return;
  const token = bearerToken(request);
  if (!token || !safeEqual(token, env.API_TOKEN)) {
    throw new HttpError(401, 'UNAUTHORIZED', 'This API requires a bearer token.');
  }
}

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/api/health' || path === '/api/v1/health') {
    if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
    return handleHealth(env);
  }

  if (path.startsWith('/api/v1/dynamic')) {
    return handleDynamicApi(request, env, path.slice('/api/v1/dynamic'.length));
  }

  if (path.startsWith('/api/v1/')) {
    requireApiToken(request, env);
    switch (path) {
      case '/api/v1/schema':
        if (request.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
        return handleSchema();
      case '/api/v1/validate':
        if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
        return handleValidate(request, env);
      case '/api/v1/generate':
        if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
        return handleGenerate(request, env);
      default:
        throw new HttpError(404, 'NOT_FOUND', 'Unknown API endpoint.');
    }
  }

  if (path.startsWith('/api')) throw new HttpError(404, 'NOT_FOUND', 'Unknown API endpoint.');

  if (path.startsWith('/r/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
    return handleRedirect(request, env, path.slice(3));
  }

  // Not an API route – hand over to static assets (SPA fallback configured in wrangler.jsonc).
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith('/api');
    const started = Date.now();
    const cors = corsContext(request, env);

    if (isApi && request.method === 'OPTIONS') return preflight(cors);

    let response: Response;
    try {
      response = await route(request, env, url);
    } catch (error) {
      response = errorResponse(error);
    }

    if (isApi || url.pathname.startsWith('/r/')) {
      response = applyHeaders(response, cors);
      // Structured access log without payloads, tokens or bodies.
      console.log(
        JSON.stringify({
          method: request.method,
          path: url.pathname,
          status: response.status,
          ms: Date.now() - started,
        }),
      );
    }
    return response;
  },
} satisfies ExportedHandler<Env>;
