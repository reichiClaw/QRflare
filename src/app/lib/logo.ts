/**
 * Logo upload handling: type/size/signature validation, SVG sanitization and
 * (for raster images) down-scaling so the embedded data URL stays small.
 */
import {
  ALLOWED_LOGO_MIME_TYPES,
  base64Encode,
  MAX_LOGO_BYTES,
  sniffImageType,
  validateLogoDataUrl,
} from '@shared/security/data-url';

import { readFileAsBytes } from './download';

export interface PreparedLogo {
  dataUrl: string;
  mimeType: string;
  byteLength: number;
  removed: string[];
  downscaled: boolean;
}

const MAX_RASTER_EDGE = 512;

async function downscaleRaster(
  file: File,
  mime: 'image/png' | 'image/jpeg' | 'image/webp',
): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_RASTER_EDGE) return null;
    const scale = MAX_RASTER_EDGE / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // Keep alpha for PNG/WebP sources; JPEG stays JPEG.
    const outMime = mime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outMime, 0.92));
  } finally {
    bitmap.close();
  }
}

export async function prepareLogoFile(file: File): Promise<PreparedLogo> {
  if (file.size > MAX_LOGO_BYTES * 4) {
    throw new Error('The logo file is too large (max 4 MB before processing).');
  }
  let bytes = await readFileAsBytes(file);
  const sniffed = sniffImageType(bytes);
  if (!sniffed || !(ALLOWED_LOGO_MIME_TYPES as readonly string[]).includes(sniffed)) {
    throw new Error('Only PNG, JPEG, WebP and SVG logos are supported.');
  }
  let downscaled = false;
  let mime: string = sniffed;
  if (sniffed !== 'image/svg+xml') {
    const smaller = await downscaleRaster(file, sniffed);
    if (smaller) {
      bytes = new Uint8Array(await smaller.arrayBuffer());
      mime = smaller.type;
      downscaled = true;
    }
  }
  if (bytes.byteLength > MAX_LOGO_BYTES) {
    throw new Error('The logo must be smaller than 1 MB after processing. Try a smaller or simpler image.');
  }
  const dataUrl = `data:${mime};base64,${base64Encode(bytes)}`;
  const validated = validateLogoDataUrl(dataUrl);
  return { ...validated, downscaled };
}
