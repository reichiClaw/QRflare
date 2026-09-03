/**
 * Batch runner: encodes rows in a Web Worker, rasterizes on the main thread in
 * small chunks (so the UI stays responsive), and packs everything into a ZIP.
 */
import { zipSync, strToU8, type Zippable } from 'fflate';

import type { GenerateRequestInput } from '@shared/api/schemas';
import type { BatchRowResult } from '@shared/batch/rows';
import { prepare } from '@shared/pipeline';
import { buildDownloadName, uniqueFilenames } from '@shared/security/filename';
import { FILE_EXTENSIONS } from '@shared/style/schema';

import { rasterizeSvgInBrowser } from './raster';
import type { BatchWorkerItemResult, BatchWorkerRequest, BatchWorkerResponse } from '../workers/batch.worker';

export interface BatchOptions {
  includeManifest: boolean;
  /** Render PNG/JPEG through the deployment's HTTP API instead of the local canvas. */
  useApi: boolean;
  jpegQuality: number;
  jpegBackground: string;
  signal: AbortSignal;
  onProgress: (done: number, total: number, label: string) => void;
}

export interface BatchFailure {
  name: string;
  error: string;
}

export interface BatchResult {
  zip: Blob;
  generated: number;
  failures: BatchFailure[];
  cancelled: boolean;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createWorker(): Worker | null {
  try {
    return new Worker(new URL('../workers/batch.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

function encodeInWorker(
  worker: Worker,
  items: Array<{ index: number; request: GenerateRequestInput }>,
  id: number,
): Promise<BatchWorkerItemResult[]> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<BatchWorkerResponse>) => {
      if (event.data.id !== id) return;
      cleanup();
      resolve(event.data.results);
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || 'Batch worker failed'));
    };
    const cleanup = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    const message: BatchWorkerRequest = { id, items };
    worker.postMessage(message);
  });
}

function encodeOnMainThread(
  items: Array<{ index: number; request: GenerateRequestInput }>,
): BatchWorkerItemResult[] {
  return items.map(({ index, request }) => {
    const result = prepare(request);
    if (!result.ok) return { index, ok: false, error: result.message };
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
  });
}

async function rasterizeViaApi(request: GenerateRequestInput, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch('/api/v1/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `API error ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function runBatch(rows: BatchRowResult[], options: BatchOptions): Promise<BatchResult> {
  const valid = rows.filter(
    (r): r is BatchRowResult & { request: GenerateRequestInput } => r.request !== null,
  );
  const total = valid.length;
  const failures: BatchFailure[] = [];
  const files: Zippable = {};
  const manifestItems: Array<Record<string, unknown>> = [];
  let generated = 0;
  let cancelled = false;

  const worker = createWorker();
  const CHUNK = 20;
  const names = uniqueFilenames(
    valid.map((r) => buildDownloadName(r.name, r.request.output?.format ?? 'png', r.name)),
  );

  try {
    for (let start = 0; start < valid.length; start += CHUNK) {
      if (options.signal.aborted) {
        cancelled = true;
        break;
      }
      const chunk = valid
        .slice(start, start + CHUNK)
        .map((r, i) => ({ index: start + i, request: r.request }));
      options.onProgress(generated, total, `Encoding rows ${start + 1}–${Math.min(start + CHUNK, total)}`);
      const encoded = worker ? await encodeInWorker(worker, chunk, start) : encodeOnMainThread(chunk);

      for (const item of encoded) {
        if (options.signal.aborted) {
          cancelled = true;
          break;
        }
        const row = valid[item.index];
        const fileName = names[item.index] ?? `qr-${item.index + 1}.png`;
        if (!row) continue;
        options.onProgress(generated, total, `Rendering ${fileName}`);
        if (!item.ok || !item.svg) {
          failures.push({ name: row.name, error: item.error ?? 'Unknown error' });
          continue;
        }
        const format = row.request.output?.format ?? 'png';
        try {
          let bytes: Uint8Array;
          if (format === 'svg') {
            bytes = strToU8(item.svg);
          } else if (options.useApi) {
            bytes = await rasterizeViaApi(row.request, options.signal);
          } else {
            const blob = await rasterizeSvgInBrowser(item.svg, {
              format,
              width: item.width ?? 512,
              height: item.height ?? 512,
              jpegQuality: options.jpegQuality,
              jpegBackground: options.jpegBackground,
            });
            bytes = new Uint8Array(await blob.arrayBuffer());
          }
          files[fileName] = bytes;
          generated++;
          manifestItems.push({
            name: row.name,
            file: fileName,
            type: row.request.content.type,
            format,
            extension: FILE_EXTENSIONS[format],
            width: item.width,
            height: item.height,
            qrVersion: item.version,
            errorCorrection: item.errorCorrection,
            payloadBytes: item.byteLength,
            reliability: item.reliability,
          });
        } catch (error) {
          failures.push({ name: row.name, error: error instanceof Error ? error.message : 'Render failed' });
        }
        await yieldToMain();
      }
    }
  } finally {
    worker?.terminate();
  }

  if (options.includeManifest) {
    files['manifest.json'] = strToU8(
      JSON.stringify(
        {
          generator: 'EdgeQR Studio',
          generatedAt: new Date().toISOString(),
          count: manifestItems.length,
          failures,
          items: manifestItems,
        },
        null,
        2,
      ),
    );
  }

  options.onProgress(generated, total, 'Packing ZIP');
  await yieldToMain();
  // PNG/JPEG/SVG are already compact; store without compression to stay fast.
  const zipped = zipSync(files, { level: 0 });
  const zip = new Blob([zipped], { type: 'application/zip' });
  return { zip, generated, failures, cancelled };
}
