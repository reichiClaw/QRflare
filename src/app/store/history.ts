/**
 * Opt-in local generation history. Disabled by default because entries contain
 * the full content (which may include passwords or payment details). Stored in
 * localStorage only; never synchronised.
 */
import { create } from 'zustand';

import type { ContentInput } from '@shared/content/schemas';
import type { QrOptions } from '@shared/qr/encode';
import type { Output, Style } from '@shared/style/schema';

import { readJson, removeKey, STORAGE_KEYS, writeJson } from '../lib/storage';

export interface HistoryEntry {
  id: string;
  createdAt: number;
  type: ContentInput['type'];
  /** Short, truncated preview of the payload for the list. */
  preview: string;
  content: ContentInput;
  qr: QrOptions;
  style: Style;
  output: Output;
}

interface HistoryState {
  entries: HistoryEntry[];
  add: (entry: Omit<HistoryEntry, 'id' | 'createdAt'>) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const LIMIT = 50;

export const useHistory = create<HistoryState>()((set, get) => ({
  entries: readJson<HistoryEntry[]>(STORAGE_KEYS.history, []).filter(
    (e) => e && typeof e === 'object' && 'content' in e,
  ),
  add: (entry) => {
    const last = get().entries[0];
    // Avoid duplicating the same generation twice in a row.
    if (
      last &&
      JSON.stringify(last.content) === JSON.stringify(entry.content) &&
      last.preview === entry.preview
    )
      return;
    const item: HistoryEntry = {
      ...entry,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };
    const entries = [item, ...get().entries].slice(0, LIMIT);
    writeJson(STORAGE_KEYS.history, entries);
    set({ entries });
  },
  remove: (id) => {
    const entries = get().entries.filter((e) => e.id !== id);
    writeJson(STORAGE_KEYS.history, entries);
    set({ entries });
  },
  clear: () => {
    removeKey(STORAGE_KEYS.history);
    set({ entries: [] });
  },
}));
