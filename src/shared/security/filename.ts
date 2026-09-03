/**
 * Filename helpers. Output is always safe for Content-Disposition headers and
 * for every mainstream file system.
 */
import { FILE_EXTENSIONS, type OutputFormat } from '../style/schema';

const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeFilename(input: string | undefined | null, fallback = 'qr-code'): string {
  let name = (input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^A-Za-z0-9._ -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[-.]*\.[-.]*/g, '.') // collapse runs containing dots (prevents "..")
    .replace(/-{2,}/g, '-')
    .replace(/^[-. ]+|[-. ]+$/g, '')
    .slice(0, 80);
  if (!name || RESERVED_WINDOWS.test(name)) name = fallback;
  return name;
}

/** Strips a known image extension so callers can append the real one. */
export function stripImageExtension(name: string): string {
  return name.replace(/\.(svg|png|jpe?g|webp|gif)$/i, '');
}

export function buildDownloadName(
  base: string | undefined,
  format: OutputFormat,
  fallback = 'qr-code',
): string {
  const clean = sanitizeFilename(stripImageExtension(base ?? ''), fallback);
  return `${clean}.${FILE_EXTENSIONS[format]}`;
}

/** Content-Disposition value with an ASCII fallback and RFC 5987 encoded name. */
export function contentDisposition(filename: string, inline = false): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Makes names unique within a batch by appending -2, -3, … */
export function uniqueFilenames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    const key = name.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) return name;
    let candidate = `${base}-${count + 1}${ext}`;
    while (seen.has(candidate.toLowerCase())) {
      const next = (seen.get(candidate.toLowerCase()) ?? 1) + 1;
      seen.set(candidate.toLowerCase(), next);
      candidate = `${base}-${next}${ext}`;
    }
    seen.set(candidate.toLowerCase(), 1);
    return candidate;
  });
}
