/**
 * Colour helpers (hex parsing, conversions, WCAG contrast).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0-1 */
  a: number;
}

export const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_REGEX.test(value);
}

export function parseHex(value: string): Rgb | null {
  if (!HEX_COLOR_REGEX.test(value)) return null;
  let hex = value.slice(1);
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

/** Normalizes any supported hex form to #RRGGBB (alpha is dropped unless < 1). */
export function normalizeHex(value: string): string {
  const rgb = parseHex(value);
  if (!rgb) return '#000000';
  return rgbToHex(rgb);
}

export function rgbToHex({ r, g, b, a }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const base = `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
  return a < 1 ? `${base}${h(a * 255).toUpperCase()}` : base;
}

export function parseRgbString(value: string): Rgb | null {
  const match = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([01]?\.?\d*)\s*)?\)$/i.exec(
    value.trim(),
  );
  if (!match) return null;
  const [, r, g, b, a] = match;
  const rgb = { r: Number(r), g: Number(g), b: Number(b), a: a === undefined || a === '' ? 1 : Number(a) };
  if ([rgb.r, rgb.g, rgb.b].some((c) => c > 255) || rgb.a > 1) return null;
  return rgb;
}

/** Accepts hex or rgb()/rgba() strings and returns a normalized hex. */
export function toHex(value: string): string | null {
  const trimmed = value.trim();
  const hex = parseHex(trimmed);
  if (hex) return rgbToHex(hex);
  const rgb = parseRgbString(trimmed);
  if (rgb) return rgbToHex(rgb);
  return null;
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (1-21). */
export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

export function isLight(color: string): boolean {
  const rgb = parseHex(color);
  return rgb ? relativeLuminance(rgb) > 0.5 : false;
}

/** Linear interpolation between two hex colours (t in 0-1). */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a) ?? { r: 0, g: 0, b: 0, a: 1 };
  const cb = parseHex(b) ?? { r: 0, g: 0, b: 0, a: 1 };
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
    a: 1,
  });
}

/** Returns black or white depending on which contrasts better with `background`. */
export function readableTextColor(background: string): string {
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#FFFFFF') ? '#000000' : '#FFFFFF';
}
