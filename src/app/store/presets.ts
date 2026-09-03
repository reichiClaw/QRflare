/** Custom style presets (local only, never uploaded). */
import { create } from 'zustand';

import {
  BUILT_IN_PRESETS,
  PresetFileSchema,
  PresetSchema,
  styleToPresetStyle,
  type Preset,
} from '@shared/style/presets';
import type { Style } from '@shared/style/schema';

import { readJson, STORAGE_KEYS, writeJson } from '../lib/storage';

interface PresetsState {
  custom: Preset[];
  save: (name: string, style: Style) => Preset;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  importFromJson: (text: string) => { imported: number; error?: string };
  exportToJson: () => string;
  restoreDefaults: () => void;
}

function load(): Preset[] {
  const raw = readJson<unknown>(STORAGE_KEYS.presets, []);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = PresetSchema.safeParse(item);
    return parsed.success ? [{ ...parsed.data, builtIn: false }] : [];
  });
}

function persist(custom: Preset[]) {
  writeJson(STORAGE_KEYS.presets, custom);
}

function newId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePresets = create<PresetsState>()((set, get) => ({
  custom: load(),
  save: (name, style) => {
    const preset: Preset = {
      id: newId(),
      name: name.trim().slice(0, 60) || 'My preset',
      description: '',
      builtIn: false,
      style: styleToPresetStyle(style),
    };
    const custom = [...get().custom, preset];
    persist(custom);
    set({ custom });
    return preset;
  },
  rename: (id, name) => {
    const custom = get().custom.map((p) =>
      p.id === id ? { ...p, name: name.trim().slice(0, 60) || p.name } : p,
    );
    persist(custom);
    set({ custom });
  },
  remove: (id) => {
    const custom = get().custom.filter((p) => p.id !== id);
    persist(custom);
    set({ custom });
  },
  importFromJson: (text) => {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { imported: 0, error: 'The file is not valid JSON.' };
    }
    const file = PresetFileSchema.safeParse(data);
    if (!file.success) return { imported: 0, error: 'The file is not an EdgeQR preset export.' };
    const existingIds = new Set(get().custom.map((p) => p.id));
    const incoming = file.data.presets.map((p) => ({
      ...p,
      builtIn: false,
      id: existingIds.has(p.id) || BUILT_IN_PRESETS.some((b) => b.id === p.id) ? newId() : p.id,
    }));
    const custom = [...get().custom, ...incoming];
    persist(custom);
    set({ custom });
    return { imported: incoming.length };
  },
  exportToJson: () =>
    JSON.stringify(
      { app: 'edgeqr-studio', version: 1, presets: get().custom.map((p) => ({ ...p, builtIn: false })) },
      null,
      2,
    ),
  restoreDefaults: () => {
    persist([]);
    set({ custom: [] });
  },
}));

export function allPresets(custom: Preset[]): Preset[] {
  return [...BUILT_IN_PRESETS, ...custom];
}
