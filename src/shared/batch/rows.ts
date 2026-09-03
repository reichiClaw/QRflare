/**
 * Maps CSV rows to generate requests. Shared between the browser batch runner
 * and documentation/tests.
 *
 * Reserved columns: name, type, format, size, preset, errorCorrection, data.
 * Every other column is written into the content value of the row's type.
 */
import type { GenerateRequestInput } from '../api/schemas';
import { defaultContent, getContentMeta } from '../content/registry';
import { CONTENT_TYPES, ContentSchema, type ContentInput, type ContentType } from '../content/schemas';
import type { Preset } from '../style/presets';
import { OUTPUT_FORMATS, type OutputFormat } from '../style/schema';

export const RESERVED_COLUMNS = [
  'name',
  'type',
  'format',
  'size',
  'preset',
  'errorCorrection',
  'data',
] as const;

/** Column that the generic `data` column maps to, per content type. */
export const PRIMARY_FIELD: Record<ContentType, string> = {
  text: 'text',
  url: 'url',
  email: 'to',
  phone: 'number',
  sms: 'number',
  whatsapp: 'number',
  wifi: 'ssid',
  vcard: 'displayName',
  mecard: 'lastName',
  event: 'title',
  geo: 'label',
  epc: 'iban',
  bitcoin: 'address',
  ethereum: 'address',
  otpauth: 'secret',
  social: 'handle',
  applink: 'value',
  customuri: 'raw',
  json: 'json',
  raw: 'payload',
};

export interface BatchDefaults {
  type: ContentType;
  format: OutputFormat;
  size: number;
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
}

export interface BatchRowResult {
  index: number;
  name: string;
  request: GenerateRequestInput | null;
  issues: string[];
  /** Preset resolved for the row (null when default style should be used). */
  preset: Preset | null;
}

function coerce(template: unknown, raw: string): unknown {
  if (typeof template === 'boolean') return /^(true|1|yes|y)$/i.test(raw.trim());
  if (typeof template === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (Array.isArray(template) || (template && typeof template === 'object')) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function splitMulti(raw: string): string[] {
  return raw
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Builds the content value for a row, applying type-specific conveniences. */
export function rowToContent(
  type: ContentType,
  row: Record<string, string>,
): { content: ContentInput; issues: string[] } {
  const issues: string[] = [];
  const base = defaultContent(type);
  const value = base.value as Record<string, unknown>;
  const primary = PRIMARY_FIELD[type];

  if (row.data && !row[primary]) row[primary] = row.data;

  for (const [column, raw] of Object.entries(row)) {
    if ((RESERVED_COLUMNS as readonly string[]).includes(column)) continue;
    if (raw === undefined || raw === '') continue;
    const key = column.trim();
    if (!key) continue;

    // vCard conveniences: phone / email single columns and multi-value lists.
    if (type === 'vcard' && (key === 'phone' || key === 'phones')) {
      value.phones = splitMulti(raw).map((number) => ({ type: 'CELL', number }));
      continue;
    }
    if (type === 'vcard' && (key === 'email' || key === 'emails')) {
      value.emails = splitMulti(raw).map((address) => ({ type: 'WORK', address }));
      continue;
    }
    if (type === 'customuri' && key === 'raw') {
      value.mode = 'raw';
      value.raw = raw;
      continue;
    }
    if (type === 'customuri' && key === 'query') {
      try {
        const parsed: unknown = JSON.parse(raw);
        value.query = Array.isArray(parsed)
          ? parsed
          : Object.entries(parsed as Record<string, string>).map(([k, v]) => ({ key: k, value: String(v) }));
      } catch {
        value.query = raw
          .split('&')
          .filter(Boolean)
          .map((pair) => {
            const [k = '', v = ''] = pair.split('=');
            return { key: decodeURIComponent(k), value: decodeURIComponent(v) };
          });
      }
      continue;
    }
    if (!(key in value)) {
      issues.push(`Unknown column "${key}" for type ${type}.`);
      continue;
    }
    value[key] = coerce(value[key], raw);
  }

  return { content: { type, value } as ContentInput, issues };
}

export function mapRow(
  row: Record<string, string>,
  index: number,
  defaults: BatchDefaults,
  presets: Preset[],
): BatchRowResult {
  const issues: string[] = [];
  const typeRaw = (row.type ?? '').trim().toLowerCase();
  const type: ContentType = typeRaw ? (typeRaw as ContentType) : defaults.type;
  if (!(CONTENT_TYPES as readonly string[]).includes(type)) {
    return {
      index,
      name: row.name ?? `row-${index + 1}`,
      request: null,
      issues: [`Unknown content type "${typeRaw}".`],
      preset: null,
    };
  }

  const formatRaw = (row.format ?? '').trim().toLowerCase().replace('jpg', 'jpeg');
  const format: OutputFormat = formatRaw ? (formatRaw as OutputFormat) : defaults.format;
  if (!(OUTPUT_FORMATS as readonly string[]).includes(format))
    issues.push(`Unknown output format "${formatRaw}".`);

  const sizeRaw = (row.size ?? '').trim();
  const size = sizeRaw ? Number(sizeRaw) : defaults.size;
  if (!Number.isInteger(size) || size < 128 || size > 4096)
    issues.push(`Size must be an integer between 128 and 4096 (got "${sizeRaw}").`);

  let preset: Preset | null = null;
  const presetRaw = (row.preset ?? '').trim();
  if (presetRaw) {
    preset =
      presets.find((p) => p.id === presetRaw || p.name.toLowerCase() === presetRaw.toLowerCase()) ?? null;
    if (!preset) issues.push(`Unknown preset "${presetRaw}".`);
  }

  const ecRaw = (row.errorCorrection ?? '').trim().toUpperCase();
  const errorCorrection = ecRaw ? (ecRaw as 'L' | 'M' | 'Q' | 'H') : defaults.errorCorrection;
  if (ecRaw && !['L', 'M', 'Q', 'H'].includes(ecRaw))
    issues.push(`Error correction must be L, M, Q or H (got "${ecRaw}").`);

  const { content, issues: contentIssues } = rowToContent(type, { ...row });
  issues.push(...contentIssues);
  const validation = ContentSchema.safeParse(content);
  if (!validation.success) {
    for (const issue of validation.error.issues) {
      const path = issue.path
        .filter((p) => p !== 'value')
        .map(String)
        .join('.');
      issues.push(`${path || getContentMeta(type).label}: ${issue.message}`);
    }
  }

  const name = (row.name ?? '').trim() || `${type}-${index + 1}`;
  if (issues.length > 0) return { index, name, request: null, issues, preset };

  return {
    index,
    name,
    preset,
    issues: [],
    request: {
      content,
      qr: errorCorrection ? { errorCorrection } : undefined,
      style: preset ? preset.style : undefined,
      output: { format, size, filename: name },
    },
  };
}

/** Example CSV that documents every reserved column and a few content types. */
export function exampleCsv(): string {
  const lines = [
    'name,type,format,size,preset,data,ssid,password,encryption,firstName,lastName,phone,email,organization',
    'website,url,png,1024,Electric blue & teal,https://example.com,,,,,,,,',
    'plain-text,text,svg,512,,Hello from the batch generator,,,,,,,,',
    'guest-wifi,wifi,png,1024,Classic black & white,,Cafe Guest,latte;art,WPA,,,,,',
    'ada,vcard,jpeg,1024,Rounded blue,,,,,Ada,Lovelace,+44 20 7946 0958,ada@example.com,Analytical Engines Ltd',
    'call-us,phone,png,512,,+1 415 555 0132,,,,,,,,',
  ];
  return lines.join('\r\n') + '\r\n';
}
