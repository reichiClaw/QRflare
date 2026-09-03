/**
 * Payload builders: turn validated content values into the exact string that
 * gets encoded into the QR symbol.
 *
 * Every builder is pure and deterministic. Field escaping follows the relevant
 * specification (RFC 6350 vCard, RFC 5545 iCalendar, EPC069-12, BIP-21,
 * EIP-681, Key Uri Format for otpauth, the WIFI: scheme used by ZXing/iOS/Android).
 */
import { MAX_PAYLOAD_BYTES, utf8ByteLength } from '../qr/encode';
import { ContentSchema, type Content, type ContentType, type ContentValue } from './schemas';
import {
  buildQuery,
  decimalToUnits,
  encodePathSegment,
  encodeQueryComponent,
  escapeMeCard,
  escapeVText,
  escapeWifi,
  fnv1a,
  normalizeBase32,
  normalizeIban,
  normalizePhoneNumber,
  normalizeUrl,
  splitList,
  toICalDate,
  toICalDateTime,
  toICalUtc,
  zonedTimeToUtc,
} from './utils';

export interface PayloadIssue {
  path: string;
  message: string;
}

export type PayloadResult =
  { ok: true; payload: string; warnings: string[]; content: Content } | { ok: false; issues: PayloadIssue[] };

export interface BuildContext {
  /** Optional capacity hint (bytes) used to decide whether optional heavy fields such as vCard photos fit. */
  maxBytes?: number;
}

type Builder<T extends ContentType> = (
  value: ContentValue<T>,
  ctx: BuildContext,
) => { payload: string; warnings?: string[] };

const CRLF = '\r\n';

function joinLines(lines: Array<string | null | undefined | false>, separator = CRLF): string {
  return lines.filter((l): l is string => typeof l === 'string' && l.length > 0).join(separator);
}

/* ---------- Builders ---------- */

const buildText: Builder<'text'> = (v) => ({ payload: v.text });

const buildUrl: Builder<'url'> = (v) => {
  const normalized = normalizeUrl(v.url, v.autoHttps);
  if (normalized === null) throw new Error('Invalid URL');
  const warnings: string[] = [];
  if (/^http:/i.test(normalized))
    warnings.push('The URL uses plain http://. Prefer https:// when available.');
  return { payload: normalized, warnings };
};

const buildEmail: Builder<'email'> = (v) => {
  const to = splitList(v.to).map(encodeMailAddress).join(',');
  const query = buildQuery([
    ['cc', splitList(v.cc).join(',')],
    ['bcc', splitList(v.bcc).join(',')],
    ['subject', v.subject],
    ['body', v.body],
  ]);
  return { payload: `mailto:${to}${query}` };
};

function encodeMailAddress(address: string): string {
  // Keep @ readable; percent-encode characters that are not allowed in a mailto path.
  return address.replace(/[^A-Za-z0-9._%+@!$&'*=^`{|}~-]/g, (c) => encodeQueryComponent(c));
}

const buildPhone: Builder<'phone'> = (v) => ({ payload: `tel:${normalizePhoneNumber(v.number)}` });

const buildSms: Builder<'sms'> = (v) => {
  const number = normalizePhoneNumber(v.number);
  const body = v.message ? `?body=${encodeQueryComponent(v.message)}` : '';
  return { payload: `sms:${number}${body}` };
};

const buildWhatsApp: Builder<'whatsapp'> = (v) => {
  const digits = normalizePhoneNumber(v.number).replace(/^\+/, '');
  const text = v.message ? `?text=${encodeQueryComponent(v.message)}` : '';
  return { payload: `https://wa.me/${digits}${text}` };
};

const buildWifi: Builder<'wifi'> = (v) => {
  const parts = [`T:${v.encryption}`, `S:${escapeWifi(v.ssid)}`];
  if (v.encryption !== 'nopass' && v.password) parts.push(`P:${escapeWifi(v.password)}`);
  if (v.hidden) parts.push('H:true');
  const warnings: string[] = [];
  if (v.encryption === 'WEP') warnings.push('WEP is insecure and no longer supported by many devices.');
  return { payload: `WIFI:${parts.join(';')};;`, warnings };
};

const buildVCard: Builder<'vcard'> = (v, ctx) => {
  const is4 = v.version === '4.0';
  const displayName = v.displayName || [v.firstName, v.lastName].filter(Boolean).join(' ') || v.organization;
  const lines: Array<string | false> = ['BEGIN:VCARD', `VERSION:${v.version}`];
  lines.push(`N:${escapeVText(v.lastName)};${escapeVText(v.firstName)};;;`);
  lines.push(`FN:${escapeVText(displayName)}`);
  if (v.organization) lines.push(`ORG:${escapeVText(v.organization)}`);
  if (v.title) lines.push(`TITLE:${escapeVText(v.title)}`);
  for (const phone of v.phones) {
    if (!phone.number) continue;
    const number = normalizePhoneNumber(phone.number);
    const type = phone.type === 'OTHER' ? '' : phone.type.toLowerCase();
    lines.push(
      is4
        ? `TEL${type ? `;TYPE=${type}` : ''};VALUE=uri:tel:${number}`
        : `TEL${type ? `;TYPE=${type.toUpperCase()}` : ''}:${number}`,
    );
  }
  for (const email of v.emails) {
    if (!email.address) continue;
    const type = email.type === 'OTHER' ? '' : email.type;
    lines.push(
      `EMAIL${type ? `;TYPE=${is4 ? type.toLowerCase() : type}` : ''}:${escapeVText(email.address)}`,
    );
  }
  if (v.website) lines.push(`URL:${escapeVText(normalizeUrl(v.website) ?? v.website)}`);
  if (v.street || v.city || v.postalCode || v.region || v.country) {
    lines.push(
      `ADR${is4 ? '' : ';TYPE=WORK'}:;;${escapeVText(v.street)};${escapeVText(v.city)};${escapeVText(v.region)};${escapeVText(v.postalCode)};${escapeVText(v.country)}`,
    );
  }
  if (v.birthday) lines.push(`BDAY:${is4 ? v.birthday.replace(/-/g, '') : v.birthday}`);
  if (v.notes) lines.push(`NOTE:${escapeVText(v.notes)}`);
  lines.push('END:VCARD');

  const warnings: string[] = [];
  const withoutPhoto = joinLines(lines);
  if (v.photo) {
    const match = /^data:image\/(png|jpeg|webp|svg\+xml);base64,(.+)$/.exec(v.photo);
    if (match) {
      const mime = match[1] ?? 'png';
      const b64 = match[2] ?? '';
      const photoLine = is4
        ? `PHOTO:data:image/${mime};base64,${b64}`
        : `PHOTO;ENCODING=b;TYPE=${mime.toUpperCase().replace('+XML', '')}:${b64}`;
      const withPhoto = joinLines([...lines.slice(0, -1), photoLine, 'END:VCARD']);
      const limit = ctx.maxBytes ?? MAX_PAYLOAD_BYTES;
      if (utf8ByteLength(withPhoto) <= limit) {
        return { payload: withPhoto, warnings };
      }
      warnings.push('The contact photo was omitted because it would exceed the QR code capacity.');
    }
  }
  return { payload: withoutPhoto, warnings };
};

const buildMeCard: Builder<'mecard'> = (v) => {
  const fields: string[] = [];
  const name = [v.lastName, v.firstName].filter(Boolean).map(escapeMeCard).join(',');
  fields.push(`N:${name}`);
  if (v.phone) fields.push(`TEL:${normalizePhoneNumber(v.phone)}`);
  if (v.email) fields.push(`EMAIL:${escapeMeCard(v.email)}`);
  if (v.address) fields.push(`ADR:${escapeMeCard(v.address)}`);
  if (v.website) fields.push(`URL:${escapeMeCard(normalizeUrl(v.website) ?? v.website)}`);
  if (v.note) fields.push(`NOTE:${escapeMeCard(v.note)}`);
  return { payload: `MECARD:${fields.join(';')};;` };
};

const buildEvent: Builder<'event'> = (v) => {
  const warnings: string[] = [];
  let dtStart: string;
  let dtEnd: string | null = null;
  let dtStamp: string;

  if (v.allDay) {
    const start = toICalDate(v.start);
    if (!start) throw new Error('Invalid start date');
    dtStart = `DTSTART;VALUE=DATE:${start}`;
    dtStamp = `${start}T000000Z`;
    const endSource = v.end || v.start;
    const endDate = toICalDate(endSource);
    if (endDate) {
      // DTEND is exclusive for all-day events, so add one day.
      const [y, m, d] = [
        Number(endDate.slice(0, 4)),
        Number(endDate.slice(4, 6)),
        Number(endDate.slice(6, 8)),
      ];
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      dtEnd = `DTEND;VALUE=DATE:${toICalUtc(next).slice(0, 8)}`;
    }
  } else if (v.timeZone) {
    const startUtc = zonedTimeToUtc(v.start, v.timeZone);
    if (!startUtc) throw new Error('Invalid start');
    dtStart = `DTSTART:${toICalUtc(startUtc)}`;
    dtStamp = toICalUtc(startUtc);
    if (v.end) {
      const endUtc = zonedTimeToUtc(v.end, v.timeZone);
      if (endUtc) dtEnd = `DTEND:${toICalUtc(endUtc)}`;
    }
  } else {
    const start = toICalDateTime(v.start);
    if (!start) throw new Error('Invalid start');
    dtStart = `DTSTART:${start}`;
    dtStamp = `${start}Z`;
    if (v.end) {
      const end = toICalDateTime(v.end);
      if (end) dtEnd = `DTEND:${end}`;
    }
    warnings.push('No time zone selected: the event uses floating local time on the scanning device.');
  }

  const uid = `${fnv1a(`${v.title}|${v.start}|${v.end}|${v.location}`)}@edgeqr`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EdgeQR Studio//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escapeVText(v.title)}`,
    v.location && `LOCATION:${escapeVText(v.location)}`,
    v.description && `DESCRIPTION:${escapeVText(v.description)}`,
    v.url && `URL:${escapeVText(normalizeUrl(v.url) ?? v.url)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return { payload: joinLines(lines), warnings };
};

const buildGeo: Builder<'geo'> = (v) => {
  const lat = formatCoordinate(v.latitude);
  const lng = formatCoordinate(v.longitude);
  const label = v.label.trim();
  const query = label ? `?q=${lat},${lng}(${encodeQueryComponent(label)})` : '';
  return { payload: `geo:${lat},${lng}${query}` };
};

function formatCoordinate(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

const buildEpc: Builder<'epc'> = (v) => {
  const amount = v.amount ? `EUR${Number(v.amount).toFixed(2)}` : '';
  const lines = [
    'BCD',
    '002',
    '1', // UTF-8
    'SCT',
    v.bic.replace(/\s+/g, '').toUpperCase(),
    v.name,
    normalizeIban(v.iban),
    amount,
    v.purpose.toUpperCase(),
    v.reference,
    v.remittance,
    v.information,
  ];
  // Trailing empty elements may be omitted, but elements in between must be kept.
  while (lines.length > 7 && lines[lines.length - 1] === '') lines.pop();
  const payload = lines.join('\n');
  const warnings: string[] = [];
  if (utf8ByteLength(payload) > 331)
    warnings.push('EPC payloads must stay below 331 bytes; shorten the text fields.');
  return { payload, warnings };
};

const buildBitcoin: Builder<'bitcoin'> = (v) => {
  const query = buildQuery([
    ['amount', v.amount ? String(Number(v.amount)) : ''],
    ['label', v.label],
    ['message', v.message],
  ]);
  return { payload: `bitcoin:${v.address}${query}` };
};

const buildEthereum: Builder<'ethereum'> = (v) => {
  const chain = v.chainId ? `@${v.chainId}` : '';
  if (v.token) {
    const units = decimalToUnits(v.token.amount, v.token.decimals);
    if (units === null) throw new Error('Invalid token amount');
    return {
      payload: `ethereum:${v.token.contract}${chain}/transfer?address=${v.address}&uint256=${units}`,
    };
  }
  const value = v.amount ? decimalToUnits(v.amount, 18) : null;
  const query = value && value !== '0' ? `?value=${value}` : '';
  return { payload: `ethereum:${v.address}${chain}${query}` };
};

const buildOtpAuth: Builder<'otpauth'> = (v) => {
  const issuer = v.issuer.trim();
  const label = issuer
    ? `${encodePathSegment(issuer)}:${encodePathSegment(v.account)}`
    : encodePathSegment(v.account);
  const params: Array<[string, string | undefined]> = [
    ['secret', normalizeBase32(v.secret)],
    ['issuer', issuer || undefined],
    ['algorithm', v.algorithm],
    ['digits', String(v.digits)],
  ];
  if (v.type === 'totp') params.push(['period', String(v.period)]);
  else params.push(['counter', String(v.counter)]);
  const warnings: string[] = [];
  if (v.algorithm !== 'SHA1') warnings.push('Some authenticator apps only support SHA1.');
  if (v.digits !== 6) warnings.push('Some authenticator apps only support 6 digits.');
  return { payload: `otpauth://${v.type}/${label}${buildQuery(params)}`, warnings };
};

const SOCIAL_BASE: Record<Exclude<ContentValue<'social'>['network'], 'custom' | 'signal'>, string> = {
  linkedin: 'https://www.linkedin.com/in/',
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
  x: 'https://x.com/',
  youtube: 'https://www.youtube.com/@',
  tiktok: 'https://www.tiktok.com/@',
  telegram: 'https://t.me/',
  github: 'https://github.com/',
};

const buildSocial: Builder<'social'> = (v) => {
  const handle = v.handle.trim();
  if (v.network === 'custom') {
    const url = normalizeUrl(handle);
    if (!url) throw new Error('Invalid URL');
    return { payload: url };
  }
  if (v.network === 'signal') {
    if (/^https?:\/\//i.test(handle)) return { payload: handle };
    if (/^sgnl:/i.test(handle)) return { payload: handle };
    const number = normalizePhoneNumber(handle);
    return { payload: `https://signal.me/#p/${number.startsWith('+') ? number : `+${number}`}` };
  }
  if (/^https?:\/\//i.test(handle)) {
    const url = normalizeUrl(handle);
    if (!url) throw new Error('Invalid URL');
    return { payload: url };
  }
  const cleaned = handle.replace(/^@/, '').replace(/^\/+/, '');
  return { payload: `${SOCIAL_BASE[v.network]}${encodeURI(cleaned)}` };
};

const buildAppLink: Builder<'applink'> = (v) => {
  const value = v.value.trim();
  if (v.kind === 'playstore' && !/^https:/i.test(value)) {
    return { payload: `https://play.google.com/store/apps/details?id=${encodeQueryComponent(value)}` };
  }
  if (v.kind === 'deeplink') return { payload: value };
  const url = normalizeUrl(value);
  if (!url) throw new Error('Invalid URL');
  return { payload: url };
};

const buildCustomUri: Builder<'customuri'> = (v) => {
  if (v.mode === 'raw') return { payload: v.raw.trim() };
  const authority = v.authority ? `//${v.authority}` : '';
  let path = v.path;
  if (authority && path && !path.startsWith('/')) path = `/${path}`;
  const encodedPath = path
    .split('/')
    .map((seg) => encodeQueryComponent(seg).replace(/%3A/gi, ':').replace(/%40/g, '@'))
    .join('/');
  const query = buildQuery(v.query.filter((q) => q.key).map((q) => [q.key, q.value]));
  return { payload: `${v.scheme}:${authority}${encodedPath}${query}` };
};

const buildJson: Builder<'json'> = (v) => {
  const parsed: unknown = JSON.parse(v.json);
  return { payload: v.minify ? JSON.stringify(parsed) : v.json };
};

const buildRaw: Builder<'raw'> = (v) => ({ payload: v.payload });

const BUILDERS: { [K in ContentType]: Builder<K> } = {
  text: buildText,
  url: buildUrl,
  email: buildEmail,
  phone: buildPhone,
  sms: buildSms,
  whatsapp: buildWhatsApp,
  wifi: buildWifi,
  vcard: buildVCard,
  mecard: buildMeCard,
  event: buildEvent,
  geo: buildGeo,
  epc: buildEpc,
  bitcoin: buildBitcoin,
  ethereum: buildEthereum,
  otpauth: buildOtpAuth,
  social: buildSocial,
  applink: buildAppLink,
  customuri: buildCustomUri,
  json: buildJson,
  raw: buildRaw,
};

/**
 * Validates `content` with the shared schema and builds the payload. Never
 * throws for user errors – validation problems are returned as issues.
 */
export function buildPayload(content: unknown, ctx: BuildContext = {}): PayloadResult {
  const parsed = ContentSchema.safeParse(content);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }
  const value = parsed.data;
  const builder = BUILDERS[value.type] as Builder<ContentType>;
  try {
    const built = builder(value.value, ctx);
    return { ok: true, payload: built.payload, warnings: built.warnings ?? [], content: value };
  } catch (error) {
    return {
      ok: false,
      issues: [
        { path: 'value', message: error instanceof Error ? error.message : 'Could not build the payload.' },
      ],
    };
  }
}
