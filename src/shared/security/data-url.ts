/**
 * Safe handling of image data URLs: strict syntax, base64 validation, MIME
 * allowlist, size limits and file-signature (magic byte) checks.
 */
import { MAX_SVG_LOGO_BYTES, sanitizeSvg } from './svg-sanitizer';

export const ALLOWED_LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export type LogoMimeType = (typeof ALLOWED_LOGO_MIME_TYPES)[number];

export const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB decoded

const DATA_URL_REGEX = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})$/;

export interface ParsedDataUrl {
  mimeType: LogoMimeType;
  bytes: Uint8Array;
}

export class DataUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataUrlError';
  }
}

export function base64Decode(base64: string): Uint8Array {
  if (base64.length % 4 !== 0) throw new DataUrlError('Malformed base64 data (length).');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new DataUrlError('Malformed base64 data (alphabet).');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function parseImageDataUrl(dataUrl: string, maxBytes = MAX_LOGO_BYTES): ParsedDataUrl {
  if (dataUrl.length > Math.ceil(maxBytes * 1.37) + 64) throw new DataUrlError('Logo image is too large.');
  const match = DATA_URL_REGEX.exec(dataUrl);
  if (!match) throw new DataUrlError('Logo must be a base64 data URL of type PNG, JPEG, WebP or SVG.');
  const mimeType = match[1] as LogoMimeType;
  const bytes = base64Decode(match[2] ?? '');
  if (bytes.length === 0) throw new DataUrlError('Logo image is empty.');
  if (bytes.length > maxBytes)
    throw new DataUrlError(`Logo image must be smaller than ${Math.round(maxBytes / 1024)} KB.`);
  return { mimeType, bytes };
}

/** Detects the real image type from the first bytes. Returns null when unknown. */
export function sniffImageType(bytes: Uint8Array): LogoMimeType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp';
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, Math.min(bytes.length, 512)));
  if (
    /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(
      head.replace(/^\uFEFF/, ''),
    )
  ) {
    return 'image/svg+xml';
  }
  return null;
}

export interface ValidatedLogo {
  /** Data URL safe to embed (SVG content is sanitized). */
  dataUrl: string;
  mimeType: LogoMimeType;
  byteLength: number;
  /** Constructs removed from an SVG logo. */
  removed: string[];
}

/**
 * Validates a logo data URL end-to-end: syntax, decoded size, declared vs.
 * sniffed type, and SVG sanitization. Throws DataUrlError on any problem.
 */
export function validateLogoDataUrl(dataUrl: string): ValidatedLogo {
  const { mimeType, bytes } = parseImageDataUrl(dataUrl);
  const sniffed = sniffImageType(bytes);
  if (!sniffed) throw new DataUrlError('The logo file is not a recognised PNG, JPEG, WebP or SVG image.');
  if (sniffed !== mimeType)
    throw new DataUrlError(`The logo claims to be ${mimeType} but contains ${sniffed} data.`);
  if (mimeType === 'image/svg+xml') {
    if (bytes.length > MAX_SVG_LOGO_BYTES) throw new DataUrlError('SVG logos must be smaller than 512 KB.');
    const text = new TextDecoder().decode(bytes);
    const result = sanitizeSvg(text);
    if (!result.ok) throw new DataUrlError(result.reason);
    const encoded = base64Encode(new TextEncoder().encode(result.svg));
    return {
      dataUrl: `data:image/svg+xml;base64,${encoded}`,
      mimeType,
      byteLength: result.svg.length,
      removed: result.removed,
    };
  }
  return { dataUrl, mimeType, byteLength: bytes.length, removed: [] };
}
