/**
 * Web Worker for batch generation: validates, encodes and renders SVG for many
 * rows off the main thread. Rasterization still happens on the main thread
 * (canvas), but the CPU-heavy encoding/rendering runs here.
 */
import type { GenerateRequestInput } from '@shared/api/schemas';
import { prepare } from '@shared/pipeline';

export interface BatchWorkerRequest {
  id: number;
  items: Array<{ index: number; request: GenerateRequestInput }>;
}

export interface BatchWorkerItemResult {
  index: number;
  ok: boolean;
  svg?: string;
  width?: number;
  height?: number;
  filename?: string;
  version?: number;
  errorCorrection?: string;
  byteLength?: number;
  reliability?: string;
  error?: string;
}

export interface BatchWorkerResponse {
  id: number;
  results: BatchWorkerItemResult[];
}

self.onmessage = (event: MessageEvent<BatchWorkerRequest>) => {
  const { id, items } = event.data;
  const results: BatchWorkerItemResult[] = items.map(({ index, request }) => {
    try {
      const result = prepare(request);
      if (!result.ok) {
        return {
          index,
          ok: false,
          error: `${result.message} ${result.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`.trim(),
        };
      }
      return {
        index,
        ok: true,
        svg: result.render.svg,
        width: result.render.width,
        height: result.render.height,
        filename: result.filename,
        version: result.encode.version,
        errorCorrection: result.encode.errorCorrection,
        byteLength: result.encode.byteLength,
        reliability: result.reliability.status,
      };
    } catch (error) {
      return { index, ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  const response: BatchWorkerResponse = { id, results };
  self.postMessage(response);
};
