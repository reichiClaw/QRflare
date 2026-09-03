/**
 * Export orchestration: re-runs the pipeline at the requested export size and
 * produces a Blob in the chosen format – entirely in the browser.
 */
import { prepare, type Prepared } from '@shared/pipeline';
import { isPng } from '@shared/raster/signatures';
import { FILE_EXTENSIONS, MIME_TYPES, type OutputFormat } from '@shared/style/schema';

import { blobToDataUrl, rasterizeSvgInBrowser, svgToBlob } from './raster';
import type { EditorSnapshot } from '../store/editor';

export interface ExportArtifact {
  blob: Blob;
  filename: string;
  mimeType: string;
  extension: string;
  prepared: Prepared;
}

export class ExportError extends Error {}

export async function exportArtifact(
  snapshot: EditorSnapshot,
  format: OutputFormat,
): Promise<ExportArtifact> {
  const result = prepare({
    content: snapshot.content,
    qr: snapshot.qr,
    style: snapshot.style,
    output: { ...snapshot.output, format },
  });
  if (!result.ok) {
    throw new ExportError(result.issues[0]?.message ?? result.message);
  }
  if (result.reliability.status === 'invalid')
    throw new ExportError('The QR code is invalid and cannot be exported.');

  let blob: Blob;
  if (format === 'svg') {
    blob = svgToBlob(result.render.svg);
  } else {
    blob = await rasterizeSvgInBrowser(result.render.svg, {
      format,
      width: result.render.width,
      height: result.render.height,
      jpegQuality: result.output.jpegQuality,
      jpegBackground: result.output.jpegBackground,
    });
    // Defence in depth: verify the browser really produced the format we asked for.
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const valid = format === 'png' ? isPng(head) : head[0] === 0xff && head[1] === 0xd8;
    if (!valid) throw new ExportError(`The browser did not produce a valid ${format.toUpperCase()} file.`);
  }
  return {
    blob,
    filename: result.filename,
    mimeType: MIME_TYPES[format],
    extension: FILE_EXTENSIONS[format],
    prepared: result,
  };
}

export async function exportDataUrl(snapshot: EditorSnapshot, format: OutputFormat): Promise<string> {
  const artifact = await exportArtifact(snapshot, format);
  return blobToDataUrl(artifact.blob);
}

/** Builds the equivalent HTTP API request body for the current design. */
export function apiRequestBody(snapshot: EditorSnapshot, format: OutputFormat): Record<string, unknown> {
  const style = structuredClone(snapshot.style) as Record<string, unknown> & { logo?: { dataUrl?: string } };
  if (style.logo?.dataUrl) {
    style.logo = { ...style.logo, dataUrl: 'data:image/png;base64,<your-logo-base64>' };
  }
  return {
    content: snapshot.content,
    qr: snapshot.qr,
    style,
    output: { ...snapshot.output, format },
  };
}

export function curlExample(body: Record<string, unknown>, origin: string, filename: string): string {
  const json = JSON.stringify(body).replace(/'/g, "'\\''");
  return `curl -X POST '${origin}/api/v1/generate' \\\n  -H 'Content-Type: application/json' \\\n  -d '${json}' \\\n  --output '${filename}'`;
}
