/**
 * Minimal client for a self-hosted Sink instance (https://github.com/miantiao-me/sink).
 * Authentication uses Sink's NUXT_SITE_TOKEN as a bearer token.
 */
import { HttpError } from './http';

export interface SinkLink {
  id?: string;
  slug: string;
  url: string;
  comment?: string;
  expiration?: number | null;
  createdAt?: number;
  updatedAt?: number;
  tags?: string[];
}

interface SinkListResponse {
  links?: SinkLink[];
  cursor?: string;
  list_complete?: boolean;
}

export class SinkClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new HttpError(502, 'SINK_UNREACHABLE', 'The Sink instance could not be reached.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(
        502,
        'SINK_UNAUTHORIZED',
        'Sink rejected the site token. Check the token in Admin → Settings.',
      );
    }
    if (response.status === 423) {
      throw new HttpError(
        502,
        'SINK_NOT_READY',
        'Sink reports its storage is not ready. Open Sink\u2019s dashboard → Links once, then retry.',
      );
    }
    if (response.status === 404) throw new HttpError(404, 'NOT_FOUND', 'Link not found in Sink.');
    if (response.status === 409)
      throw new HttpError(409, 'CONFLICT', 'A link with this slug already exists in Sink.');
    if (!response.ok) {
      throw new HttpError(502, 'SINK_ERROR', `Sink responded with HTTP ${response.status}.`);
    }
    if (response.status === 204 || response.headers.get('Content-Length') === '0') return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new HttpError(502, 'SINK_ERROR', 'Sink returned an unexpected response.');
    }
  }

  async verify(): Promise<{ name?: string; authMethod?: string }> {
    return this.request('/api/verify');
  }

  async list(limit = 200): Promise<SinkLink[]> {
    const links: SinkLink[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const query = new URLSearchParams({
        limit: String(Math.min(limit, 1000)),
        sort: 'newest',
        status: 'all',
      });
      if (cursor) query.set('cursor', cursor);
      const body = await this.request<SinkListResponse>(`/api/link/list?${query.toString()}`);
      links.push(...(body.links ?? []));
      if (body.list_complete !== false || !body.cursor || links.length >= limit) break;
      cursor = body.cursor;
    }
    return links.slice(0, limit);
  }

  async get(slug: string): Promise<SinkLink> {
    return this.request(`/api/link/query?slug=${encodeURIComponent(slug)}`);
  }

  async create(input: {
    url: string;
    slug?: string;
    comment?: string;
    expiration?: number;
  }): Promise<{ link: SinkLink; shortLink: string }> {
    return this.request('/api/link/create', { method: 'POST', body: JSON.stringify(input) });
  }

  async edit(input: {
    slug: string;
    url: string;
    comment?: string;
    expiration?: number;
  }): Promise<{ link: SinkLink; shortLink: string }> {
    return this.request('/api/link/edit', { method: 'PUT', body: JSON.stringify(input) });
  }

  async delete(slug: string): Promise<void> {
    await this.request('/api/link/delete', { method: 'POST', body: JSON.stringify({ slug }) });
  }
}

export async function testSinkConnection(
  baseUrl: string,
  token: string,
): Promise<{ ok: boolean; message: string }> {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/i.test(normalized))
    return { ok: false, message: 'Enter the full URL of your Sink instance, e.g. https://s.example.com.' };
  try {
    const info = await new SinkClient(normalized, token).verify();
    return { ok: true, message: `Connected to ${info.name ?? 'Sink'} (${info.authMethod ?? 'token'} auth).` };
  } catch (error) {
    return { ok: false, message: error instanceof HttpError ? error.message : 'Connection failed.' };
  }
}
