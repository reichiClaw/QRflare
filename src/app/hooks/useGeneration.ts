/**
 * Debounced live generation. Runs the shared pipeline against the editor state
 * and exposes the current preparation result plus a preview object URL.
 */
import { useEffect, useMemo, useState } from 'react';

import { prepare, type PrepareResult } from '@shared/pipeline';

import { useEditor } from '../store/editor';

const PREVIEW_SIZE = 640;
const DEBOUNCE_MS = 120;

export interface GenerationState {
  result: PrepareResult | null;
  /** Object URL of the preview SVG (revoked automatically). */
  previewUrl: string | null;
  /** True while a debounced regeneration is pending. */
  pending: boolean;
}

interface Computed {
  /** The input object identity the result was computed for. */
  input: unknown;
  result: PrepareResult;
  svg: string | null;
}

export function useGeneration(): GenerationState {
  const content = useEditor((s) => s.content);
  const qr = useEditor((s) => s.qr);
  const style = useEditor((s) => s.style);
  const output = useEditor((s) => s.output);

  const input = useMemo(() => ({ content, qr, style, output }), [content, qr, style, output]);
  const [computed, setComputed] = useState<Computed | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const result = prepare(input, { sizeOverride: PREVIEW_SIZE });
      setComputed({ input, result, svg: result.ok ? result.render.svg : null });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const svg = computed?.svg ?? null;
  const previewUrl = useMemo(() => {
    if (!svg) return null;
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  }, [svg]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Pending is derived: the last computation does not match the current input yet.
  const pending = computed?.input !== input;

  return { result: computed?.result ?? null, previewUrl, pending };
}
