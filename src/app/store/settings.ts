/** User preferences (theme, privacy toggles, batch limits). Persisted locally. */
import { create } from 'zustand';

import { readJson, STORAGE_KEYS, writeJson } from '../lib/storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Settings {
  theme: ThemeMode;
  /** Opt-in local generation history (may contain sensitive data). */
  historyEnabled: boolean;
  /** Maximum rows processed per batch. */
  batchLimit: number;
  /** Show the raw payload panel expanded by default. */
  showRawPayload: boolean;
}

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
}

const DEFAULTS: Settings = {
  theme: 'system',
  historyEnabled: false,
  batchLimit: 250,
  showRawPayload: false,
};

function load(): Settings {
  const saved = readJson<Partial<Settings>>(STORAGE_KEYS.settings, {});
  let theme: ThemeMode = DEFAULTS.theme;
  try {
    const t = localStorage.getItem(STORAGE_KEYS.theme);
    if (t === 'light' || t === 'dark' || t === 'system') theme = t;
  } catch {
    // ignore
  }
  return {
    theme,
    historyEnabled:
      typeof saved.historyEnabled === 'boolean' ? saved.historyEnabled : DEFAULTS.historyEnabled,
    batchLimit:
      typeof saved.batchLimit === 'number' && saved.batchLimit >= 1 && saved.batchLimit <= 2000
        ? Math.floor(saved.batchLimit)
        : DEFAULTS.batchLimit,
    showRawPayload:
      typeof saved.showRawPayload === 'boolean' ? saved.showRawPayload : DEFAULTS.showRawPayload,
  };
}

export const useSettings = create<SettingsState>()((set, get) => ({
  ...load(),
  update: (patch) => {
    set(patch);
    const { theme, historyEnabled, batchLimit, showRawPayload } = get();
    writeJson(STORAGE_KEYS.settings, { historyEnabled, batchLimit, showRawPayload });
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      // ignore
    }
  },
}));
