/** Safe JSON helpers over localStorage (quota errors and private mode are tolerated). */

export const STORAGE_KEYS = {
  theme: 'edgeqr:theme',
  settings: 'edgeqr:settings',
  presets: 'edgeqr:presets',
  design: 'edgeqr:design',
  history: 'edgeqr:history',
} as const;

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
