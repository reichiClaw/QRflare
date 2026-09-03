/**
 * Browser-side rasterization: SVG string → PNG/JPEG Blob using an off-screen
 * <canvas>. Everything stays on the device.
 */
import { parseHex } from '@shared/style/color';
import type { OutputFormat } from '@shared/style/schema';

export interface RasterizeOptions {
  format: Exclude<OutputFormat, 'svg'>;
  /** Target width in CSS pixels. */
  width: number;
  /** Target height in CSS pixels. */
  height: number;
  jpegQuality: number;
  jpegBackground: string;
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The SVG could not be rendered by the browser.'));
    };
    img.src = url;
  });
}

export async function rasterizeSvgInBrowser(svg: string, options: RasterizeOptions): Promise<Blob> {
  const img = await loadSvgImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = options.width;
  canvas.height = options.height;
  const ctx = canvas.getContext('2d', { alpha: options.format === 'png' });
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
  if (options.format === 'jpeg') {
    const bg = parseHex(options.jpegBackground) ?? { r: 255, g: 255, b: 255, a: 1 };
    ctx.fillStyle = `rgb(${bg.r} ${bg.g} ${bg.b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const mime = options.format === 'png' ? 'image/png' : 'image/jpeg';
  const quality =
    options.format === 'jpeg' ? Math.max(0.01, Math.min(1, options.jpegQuality / 100)) : undefined;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
  // Release the backing store promptly (large canvases hold tens of megabytes).
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('The browser could not encode the image.');
  if (blob.type !== mime)
    throw new Error(`The browser produced ${blob.type || 'an unknown type'} instead of ${mime}.`);
  return blob;
}

export function svgToBlob(svg: string): Blob {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read blob.'));
    reader.readAsDataURL(blob);
  });
}
