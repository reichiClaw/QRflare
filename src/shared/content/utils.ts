/**
 * Small, dependency-free helpers shared by the payload builders.
 */

export function trimAll(value: string | undefined | null): string {
  return (value ?? '').trim();
}

/** Keeps digits and a leading plus sign; strips spaces, dashes, dots and parentheses. */
export function normalizePhoneNumber(input: string): string {
  const trimmed = input.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^0-9]/g, '');
}

export const PHONE_REGEX = /^\+?[0-9]{3,15}$/;

export function isValidPhoneNumber(input: string): boolean {
  return PHONE_REGEX.test(normalizePhoneNumber(input));
}

/** RFC 5322-ish pragmatic email validation. */
export const EMAIL_REGEX = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

/** Splits a comma/semicolon separated list, trimming entries and dropping empties. */
export function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function hasUriScheme(value: string): boolean {
  return SCHEME_REGEX.test(value);
}

/**
 * Normalizes a website URL. Preserves custom schemes; optionally adds https://
 * when no scheme is present. Returns null when the value cannot be a URL.
 */
export function normalizeUrl(input: string, autoHttps = true): string | null {
  const value = input.trim();
  if (!value || /\s/.test(value)) return null;
  if (hasUriScheme(value)) {
    if (/^https?:/i.test(value)) {
      try {
        const url = new URL(value);
        if (!url.hostname) return null;
        return url.href;
      } catch {
        return null;
      }
    }
    // Custom scheme (e.g. myapp://open) – keep verbatim.
    return value;
  }
  if (!autoHttps) return null;
  try {
    const url = new URL(`https://${value}`);
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Percent-encodes for use inside URI query components (RFC 3986 unreserved kept). */
export function encodeQueryComponent(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Percent-encodes a URI path segment while keeping @ : and . readable (used by otpauth labels). */
export function encodePathSegment(value: string): string {
  return encodeQueryComponent(value).replace(/%40/g, '@').replace(/%3A/gi, ':');
}

export function buildQuery(params: Array<[string, string | undefined | null]>): string {
  const parts: string[] = [];
  for (const [key, value] of params) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeQueryComponent(key)}=${encodeQueryComponent(value)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Escapes text for vCard / iCalendar property values (RFC 6350 / RFC 5545). */
export function escapeVText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/** Escapes text for MeCard fields. */
export function escapeMeCard(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/** Escapes text for the WIFI: scheme. */
export function escapeWifi(value: string): string {
  const escaped = value.replace(/([\\;,":])/g, '\\$1');
  // ZXing treats purely hexadecimal values as hex-encoded unless quoted.
  return /^[0-9a-fA-F]+$/.test(value) ? `"${escaped}"` : escaped;
}

/** IBAN mod-97 validation (ISO 13616). */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const digits = code >= 65 ? String(code - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export const BIC_REGEX = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

export function isValidBase32(secret: string): boolean {
  const cleaned = secret.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');
  return cleaned.length >= 8 && /^[A-Z2-7]+$/.test(cleaned);
}

export function normalizeBase32(secret: string): string {
  return secret.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');
}

export const BITCOIN_ADDRESS_REGEX = /^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|tb1[ac-hj-np-z02-9]{11,87})$/;
export const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

/** Converts a decimal string (e.g. "1.5") to an integer string in base units (e.g. wei with 18 decimals). */
export function decimalToUnits(amount: string, decimals: number): string | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) return null;
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').slice(0, decimals).padEnd(decimals, '0');
  if ((match[2] ?? '').length > decimals) return null;
  const units = BigInt(whole + fraction);
  return units.toString();
}

/** Formats an ISO-like local date time (YYYY-MM-DDTHH:mm[:ss]) into iCalendar basic format. */
export function toICalDateTime(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s = '00'] = match;
  return `${y}${mo}${d}T${h}${mi}${s}`;
}

export function toICalDate(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(local.trim());
  if (!match) return null;
  return `${match[1]}${match[2]}${match[3]}`;
}

/**
 * Converts a wall-clock time in an IANA time zone to a UTC Date.
 * Uses Intl to resolve the zone offset; iterates once to handle DST edges.
 */
export function zonedTimeToUtc(local: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!match) return null;
  const [y, mo, d, h, mi, s] = [1, 2, 3, 4, 5, 6].map((i) => Number(match[i] ?? '0')) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return null;
  }
  const offsetAt = (utcMillis: number): number => {
    const parts = formatter.formatToParts(new Date(utcMillis));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
    const zoned = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return zoned - utcMillis;
  };
  let utc = asUtc - offsetAt(asUtc);
  utc = asUtc - offsetAt(utc);
  return new Date(utc);
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function toICalUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** Deterministic 32-bit FNV-1a hash rendered as hex – used for stable UIDs. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
