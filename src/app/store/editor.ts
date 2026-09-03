/**
 * Editor state: content, QR options, style and output settings with undo/redo.
 * Only the design (qr/style/output) is persisted – never the content, which may
 * contain secrets such as Wi-Fi passwords or OTP seeds.
 */
import { create } from 'zustand';

import { defaultContent } from '@shared/content/registry';
import type { ContentInput, ContentType } from '@shared/content/schemas';
import { safeDefaultsPatch } from '@shared/quality/reliability';
import { applyPreset, type Preset } from '@shared/style/presets';
import {
  DEFAULT_OUTPUT,
  DEFAULT_STYLE,
  deepMerge,
  OutputSchema,
  QrOptionsSchema,
  StyleSchema,
  type Output,
  type Style,
} from '@shared/style/schema';
import type { QrOptions } from '@shared/qr/encode';

import { readJson, STORAGE_KEYS, writeJson } from '../lib/storage';

export interface EditorSnapshot {
  content: ContentInput;
  qr: QrOptions;
  style: Style;
  output: Output;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface EditorState extends EditorSnapshot {
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  /** True when the content differs from an empty editor. */
  dirty: boolean;
  lastCommitGroup: string | null;
  lastCommitAt: number;

  setContentType: (type: ContentType) => void;
  setContentValue: (value: ContentInput['value']) => void;
  setQr: (patch: Partial<QrOptions>) => void;
  setStyle: (patch: DeepPartial<Style>, group?: string) => void;
  replaceStyle: (style: Style, group?: string) => void;
  setOutput: (patch: Partial<Output>) => void;
  applyPreset: (preset: Preset) => void;
  applySafeDefaults: () => void;
  resetContent: () => void;
  resetStyle: () => void;
  resetAll: () => void;
  loadSnapshot: (snapshot: Partial<EditorSnapshot>) => void;
  undo: () => void;
  redo: () => void;
  markClean: () => void;
}

const DEFAULT_QR: QrOptions = QrOptionsSchema.parse({});
const HISTORY_LIMIT = 100;
const COALESCE_MS = 700;

interface PersistedDesign {
  qr?: unknown;
  style?: unknown;
  output?: unknown;
}

function loadDesign(): Pick<EditorSnapshot, 'qr' | 'style' | 'output'> {
  const saved = readJson<PersistedDesign>(STORAGE_KEYS.design, {});
  const qr = QrOptionsSchema.safeParse(saved.qr ?? {});
  const style = StyleSchema.safeParse(deepMerge(DEFAULT_STYLE, saved.style ?? {}));
  const output = OutputSchema.safeParse(saved.output ?? {});
  return {
    qr: qr.success ? qr.data : DEFAULT_QR,
    style: style.success ? style.data : DEFAULT_STYLE,
    output: output.success ? output.data : DEFAULT_OUTPUT,
  };
}

function snapshotOf(state: EditorSnapshot): EditorSnapshot {
  return {
    content: structuredClone(state.content),
    qr: { ...state.qr },
    style: structuredClone(state.style),
    output: { ...state.output },
  };
}

function isEmptyContent(content: ContentInput): boolean {
  const defaults = defaultContent(content.type);
  return JSON.stringify(defaults.value) === JSON.stringify(content.value);
}

export const useEditor = create<EditorState>()((set, get) => {
  const design = loadDesign();

  /** Pushes an undo entry, coalescing rapid edits of the same group (e.g. typing). */
  const commit = (group: string) => {
    const state = get();
    const now = Date.now();
    if (state.lastCommitGroup === group && now - state.lastCommitAt < COALESCE_MS) {
      set({ lastCommitAt: now });
      return;
    }
    const past = [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT);
    set({ past, future: [], lastCommitGroup: group, lastCommitAt: now });
  };

  return {
    content: defaultContent('url'),
    ...design,
    past: [],
    future: [],
    dirty: false,
    lastCommitGroup: null,
    lastCommitAt: 0,

    setContentType: (type) => {
      if (get().content.type === type) return;
      commit(`type:${type}`);
      set({ content: defaultContent(type), dirty: false });
    },
    setContentValue: (value) => {
      commit('content');
      const content = { type: get().content.type, value } as ContentInput;
      set({ content, dirty: !isEmptyContent(content) });
    },
    setQr: (patch) => {
      commit(`qr:${Object.keys(patch).join(',')}`);
      set({ qr: { ...get().qr, ...patch } });
    },
    setStyle: (patch, group = 'style') => {
      commit(group);
      const merged = deepMerge(get().style, patch);
      const parsed = StyleSchema.safeParse(merged);
      if (parsed.success) set({ style: parsed.data });
    },
    replaceStyle: (style, group = 'style') => {
      commit(group);
      set({ style });
    },
    setOutput: (patch) => {
      commit(`output:${Object.keys(patch).join(',')}`);
      set({ output: { ...get().output, ...patch } });
    },
    applyPreset: (preset) => {
      commit(`preset:${preset.id}`);
      set({ style: applyPreset(get().style, preset) });
    },
    applySafeDefaults: () => {
      commit('safe-defaults');
      const merged = deepMerge(get().style, safeDefaultsPatch());
      set({
        style: StyleSchema.parse(merged),
        qr: { ...get().qr, marginModules: Math.max(4, get().qr.marginModules) },
      });
    },
    resetContent: () => {
      commit('reset-content');
      set({ content: defaultContent(get().content.type), dirty: false });
    },
    resetStyle: () => {
      commit('reset-style');
      set({ style: DEFAULT_STYLE, qr: DEFAULT_QR, output: DEFAULT_OUTPUT });
    },
    resetAll: () => {
      commit('reset-all');
      set({
        content: defaultContent('url'),
        style: DEFAULT_STYLE,
        qr: DEFAULT_QR,
        output: DEFAULT_OUTPUT,
        dirty: false,
      });
    },
    loadSnapshot: (snapshot) => {
      commit('load');
      const state = get();
      const content = snapshot.content ?? state.content;
      set({
        content,
        qr: snapshot.qr ?? state.qr,
        style: snapshot.style ?? state.style,
        output: snapshot.output ?? state.output,
        dirty: !isEmptyContent(content),
      });
    },
    undo: () => {
      const state = get();
      const previous = state.past[state.past.length - 1];
      if (!previous) return;
      set({
        ...previous,
        past: state.past.slice(0, -1),
        future: [snapshotOf(state), ...state.future].slice(0, HISTORY_LIMIT),
        dirty: !isEmptyContent(previous.content),
        lastCommitGroup: null,
      });
    },
    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return;
      set({
        ...next,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        dirty: !isEmptyContent(next.content),
        lastCommitGroup: null,
      });
    },
    markClean: () => set({ dirty: false }),
  };
});

// Persist the design (never the content) with a small debounce.
let persistTimer: ReturnType<typeof setTimeout> | null = null;
useEditor.subscribe((state, previous) => {
  if (state.qr === previous.qr && state.style === previous.style && state.output === previous.output) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    writeJson(STORAGE_KEYS.design, { qr: state.qr, style: state.style, output: state.output });
  }, 400);
});

export function selectCanUndo(state: EditorState): boolean {
  return state.past.length > 0;
}

export function selectCanRedo(state: EditorState): boolean {
  return state.future.length > 0;
}
