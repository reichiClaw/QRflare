/**
 * Server-reported features (from /api/health) and the admin session.
 * The session token lives in sessionStorage so it disappears with the tab.
 */
import { create } from 'zustand';

import type { PublicFeatures } from '@shared/settings/schema';

const SESSION_KEY = 'flareqr:admin-session';

export const DEFAULT_FEATURES: PublicFeatures = {
  appName: 'FlareQR Studio',
  storage: false,
  adminSetupRequired: false,
  adminAvailable: false,
  apiTokenRequired: false,
  dynamicLinks: { provider: 'off', publicAccess: false, linkBaseUrl: '' },
};

interface ServerState {
  features: PublicFeatures;
  loaded: boolean;
  sessionToken: string | null;
  refresh: () => Promise<void>;
  setSession: (token: string | null) => void;
}

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export const useServer = create<ServerState>()((set) => ({
  features: DEFAULT_FEATURES,
  loaded: false,
  sessionToken: readSession(),
  refresh: async () => {
    try {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { features?: Partial<PublicFeatures> };
      set({
        features: {
          ...DEFAULT_FEATURES,
          ...body.features,
          dynamicLinks: { ...DEFAULT_FEATURES.dynamicLinks, ...body.features?.dynamicLinks },
        },
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
  setSession: (token) => {
    try {
      if (token) sessionStorage.setItem(SESSION_KEY, token);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // storage unavailable – keep it in memory only
    }
    set({ sessionToken: token });
  },
}));

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** JSON fetch helper that attaches the admin session and normalizes errors. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useServer.getState().sessionToken;
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string; issues?: Array<{ path: string; message: string }> };
  };
  if (!response.ok) {
    if (response.status === 401 && token && path.startsWith('/api/admin') && !path.endsWith('/login')) {
      useServer.getState().setSession(null);
    }
    throw new ApiRequestError(
      response.status,
      body.error?.code ?? 'ERROR',
      body.error?.message ?? `Request failed (${response.status})`,
      body.error?.issues ?? [],
    );
  }
  return body as T;
}
