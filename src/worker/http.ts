/**
 * HTTP helpers: consistent JSON errors, security headers, CORS and body limits.
 * No helper in this file ever reads or logs request bodies.
 */
import type { PayloadIssue } from '@shared/content/builders';

import { parseAllowedOrigins, type Env } from './env';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: PayloadIssue[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Headers applied to every response produced by the Worker itself. */
export const BASE_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // API responses are data, never documents: forbid everything and sandbox.
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox",
  'Cache-Control': 'no-store',
};

export interface CorsContext {
  origin: string | null;
  allowed: boolean;
  sameOrigin: boolean;
}

export function corsContext(request: Request, env: Env): CorsContext {
  const origin = request.headers.get('Origin');
  if (!origin) return { origin: null, allowed: false, sameOrigin: true };
  const selfOrigin = new URL(request.url).origin;
  if (origin === selfOrigin) return { origin, allowed: true, sameOrigin: true };
  const allowed = parseAllowedOrigins(env).includes(origin);
  return { origin, allowed, sameOrigin: false };
}

export function applyHeaders(response: Response, cors: CorsContext, extra?: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(BASE_SECURITY_HEADERS)) headers.set(k, v);
  if (extra) for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  if (cors.origin && cors.allowed && !cors.sameOrigin) {
    headers.set('Access-Control-Allow-Origin', cors.origin);
    headers.set('Access-Control-Expose-Headers', 'Content-Disposition, X-QR-Version, X-QR-Error-Correction');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    headers.append('Vary', 'Origin');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function preflight(cors: CorsContext): Response {
  if (!cors.origin || !cors.allowed) {
    return applyHeaders(new Response(null, { status: 403 }), cors);
  }
  return applyHeaders(new Response(null, { status: 204 }), cors, {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  });
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json(
      { error: { code: error.code, message: error.message, ...(error.issues ? { issues: error.issues } : {}) } },
      { status: error.status },
    );
  }
  // Unknown failure: never echo internals to the client.
  console.error('Unhandled error', error instanceof Error ? `${error.name}: ${error.message}` : 'unknown');
  return json({ error: { code: 'INTERNAL', message: 'Internal error.' } }, { status: 500 });
}

/**
 * Reads a JSON body with a hard size limit. Rejects early via Content-Length
 * and also while streaming, so oversized bodies are never fully buffered.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!/^application\/json\b/i.test(contentType)) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send a JSON body with Content-Type: application/json.');
  }
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > maxBytes) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `Request body must be smaller than ${maxBytes} bytes.`);
  }
  if (!request.body) throw new HttpError(400, 'EMPTY_BODY', 'Request body is empty.');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `Request body must be smaller than ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (received === 0) throw new HttpError(400, 'EMPTY_BODY', 'Request body is empty.');
  try {
    return JSON.parse(new TextDecoder().decode(merged)) as unknown;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}
