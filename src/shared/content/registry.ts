/**
 * Metadata for every content type: labels, grouping, default values and API
 * examples. UI forms and documentation are driven from this registry, so
 * adding a content type means adding a schema, a builder, a form and one entry
 * here (see docs/adding-a-content-type.md).
 */
import type { ContentInput, ContentType, ContentValueInput } from './schemas';

export type ContentGroup =
  'basic' | 'contact' | 'communication' | 'payments' | 'security' | 'apps' | 'developer';

export const CONTENT_GROUPS: Array<{ id: ContentGroup; label: string }> = [
  { id: 'basic', label: 'Basics' },
  { id: 'communication', label: 'Communication' },
  { id: 'contact', label: 'Contacts & events' },
  { id: 'payments', label: 'Payments' },
  { id: 'security', label: 'Security' },
  { id: 'apps', label: 'Apps & social' },
  { id: 'developer', label: 'Developer' },
];

export interface ContentTypeMeta<T extends ContentType = ContentType> {
  id: T;
  label: string;
  shortLabel: string;
  description: string;
  group: ContentGroup;
  /** Lucide icon name (resolved in the UI). */
  icon: string;
  defaultValue: ContentValueInput<T>;
  /** Realistic example used by the API docs and tests. */
  example: ContentValueInput<T>;
  /** True when the payload usually contains secrets or personal data. */
  sensitive: boolean;
}

function meta<T extends ContentType>(m: ContentTypeMeta<T>): ContentTypeMeta<T> {
  return m;
}

export const CONTENT_REGISTRY = {
  text: meta({
    id: 'text',
    label: 'Plain text',
    shortLabel: 'Text',
    description: 'Any text, including line breaks, Unicode and emoji.',
    group: 'basic',
    icon: 'Type',
    defaultValue: { text: '' },
    example: { text: 'Hello from EdgeQR Studio ✨' },
    sensitive: false,
  }),
  url: meta({
    id: 'url',
    label: 'Website URL',
    shortLabel: 'URL',
    description: 'Open a web page. https:// is added automatically.',
    group: 'basic',
    icon: 'Link',
    defaultValue: { url: '', autoHttps: true },
    example: { url: 'https://example.com', autoHttps: true },
    sensitive: false,
  }),
  email: meta({
    id: 'email',
    label: 'Email',
    shortLabel: 'Email',
    description: 'Pre-filled email with recipients, subject and body.',
    group: 'communication',
    icon: 'Mail',
    defaultValue: { to: '', cc: '', bcc: '', subject: '', body: '' },
    example: {
      to: 'hello@example.com',
      cc: '',
      bcc: '',
      subject: 'Hi there',
      body: 'Scanned from a QR code',
    },
    sensitive: true,
  }),
  phone: meta({
    id: 'phone',
    label: 'Telephone',
    shortLabel: 'Phone',
    description: 'Start a phone call.',
    group: 'communication',
    icon: 'Phone',
    defaultValue: { number: '' },
    example: { number: '+1 415 555 0132' },
    sensitive: true,
  }),
  sms: meta({
    id: 'sms',
    label: 'SMS',
    shortLabel: 'SMS',
    description: 'Compose a text message.',
    group: 'communication',
    icon: 'MessageSquare',
    defaultValue: { number: '', message: '' },
    example: { number: '+14155550132', message: 'Hello!' },
    sensitive: true,
  }),
  whatsapp: meta({
    id: 'whatsapp',
    label: 'WhatsApp',
    shortLabel: 'WhatsApp',
    description: 'Open a WhatsApp chat with an optional message.',
    group: 'communication',
    icon: 'MessageCircle',
    defaultValue: { number: '', message: '' },
    example: { number: '+14155550132', message: 'Hi from the QR code' },
    sensitive: true,
  }),
  wifi: meta({
    id: 'wifi',
    label: 'Wi-Fi',
    shortLabel: 'Wi-Fi',
    description: 'Join a wireless network without typing the password.',
    group: 'basic',
    icon: 'Wifi',
    defaultValue: { ssid: '', password: '', encryption: 'WPA', hidden: false },
    example: { ssid: 'Cafe Guest', password: 'latte;art', encryption: 'WPA', hidden: false },
    sensitive: true,
  }),
  vcard: meta({
    id: 'vcard',
    label: 'vCard contact',
    shortLabel: 'vCard',
    description: 'Full contact card (vCard 3.0 or 4.0).',
    group: 'contact',
    icon: 'Contact',
    defaultValue: {
      version: '3.0',
      firstName: '',
      lastName: '',
      displayName: '',
      organization: '',
      title: '',
      phones: [{ type: 'CELL', number: '' }],
      emails: [{ type: 'WORK', address: '' }],
      website: '',
      street: '',
      city: '',
      postalCode: '',
      region: '',
      country: '',
      birthday: '',
      notes: '',
    },
    example: {
      version: '3.0',
      firstName: 'Ada',
      lastName: 'Lovelace',
      displayName: '',
      organization: 'Analytical Engines Ltd',
      title: 'Mathematician',
      phones: [{ type: 'CELL', number: '+44 20 7946 0958' }],
      emails: [{ type: 'WORK', address: 'ada@example.com' }],
      website: 'https://example.com',
      street: '12 Byron Street',
      city: 'London',
      postalCode: 'W1J 5AA',
      region: '',
      country: 'United Kingdom',
      birthday: '1815-12-10',
      notes: 'First programmer',
    },
    sensitive: true,
  }),
  mecard: meta({
    id: 'mecard',
    label: 'MeCard contact',
    shortLabel: 'MeCard',
    description: 'Compact contact format popular in Japan and on Android.',
    group: 'contact',
    icon: 'IdCard',
    defaultValue: { lastName: '', firstName: '', phone: '', email: '', address: '', website: '', note: '' },
    example: {
      lastName: 'Lovelace',
      firstName: 'Ada',
      phone: '+442079460958',
      email: 'ada@example.com',
      address: '12 Byron Street, London',
      website: 'https://example.com',
      note: 'Mathematician',
    },
    sensitive: true,
  }),
  event: meta({
    id: 'event',
    label: 'Calendar event',
    shortLabel: 'Event',
    description: 'Add an event to the calendar (iCalendar).',
    group: 'contact',
    icon: 'CalendarDays',
    defaultValue: {
      title: '',
      start: '',
      end: '',
      allDay: false,
      timeZone: '',
      location: '',
      description: '',
      url: '',
    },
    example: {
      title: 'Product launch',
      start: '2026-10-01T10:00',
      end: '2026-10-01T11:30',
      allDay: false,
      timeZone: 'Europe/Berlin',
      location: 'Main hall',
      description: 'Doors open 30 minutes early.',
      url: 'https://example.com/launch',
    },
    sensitive: false,
  }),
  geo: meta({
    id: 'geo',
    label: 'Location',
    shortLabel: 'Location',
    description: 'Open a map at given coordinates.',
    group: 'basic',
    icon: 'MapPin',
    defaultValue: { latitude: 0, longitude: 0, label: '' },
    example: { latitude: 48.858844, longitude: 2.294351, label: 'Eiffel Tower' },
    sensitive: false,
  }),
  epc: meta({
    id: 'epc',
    label: 'SEPA / EPC payment',
    shortLabel: 'SEPA',
    description: 'European bank transfer QR (EPC069-12), readable by banking apps.',
    group: 'payments',
    icon: 'Landmark',
    defaultValue: {
      name: '',
      iban: '',
      bic: '',
      amount: '',
      currency: 'EUR',
      purpose: '',
      reference: '',
      remittance: '',
      information: '',
    },
    example: {
      name: 'Red Cross of Belgium',
      iban: 'BE72000000001616',
      bic: 'BPOTBEB1',
      amount: '12.50',
      currency: 'EUR',
      purpose: 'CHAR',
      reference: '',
      remittance: 'Urgency fund',
      information: '',
    },
    sensitive: true,
  }),
  bitcoin: meta({
    id: 'bitcoin',
    label: 'Bitcoin',
    shortLabel: 'Bitcoin',
    description: 'BIP-21 payment request.',
    group: 'payments',
    icon: 'Bitcoin',
    defaultValue: { address: '', amount: '', label: '', message: '' },
    example: {
      address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      amount: '0.001',
      label: 'Coffee',
      message: 'Thanks!',
    },
    sensitive: true,
  }),
  ethereum: meta({
    id: 'ethereum',
    label: 'Ethereum',
    shortLabel: 'Ethereum',
    description: 'EIP-681 payment request for ETH or ERC-20 tokens.',
    group: 'payments',
    icon: 'Hexagon',
    defaultValue: { address: '', chainId: '', amount: '' },
    example: { address: '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359', chainId: '1', amount: '0.5' },
    sensitive: true,
  }),
  otpauth: meta({
    id: 'otpauth',
    label: 'OTP Auth (2FA)',
    shortLabel: '2FA',
    description: 'Enrol an authenticator app (TOTP/HOTP). The secret stays on this device.',
    group: 'security',
    icon: 'KeyRound',
    defaultValue: {
      type: 'totp',
      account: '',
      issuer: '',
      secret: '',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      counter: 0,
    },
    example: {
      type: 'totp',
      account: 'alice@example.com',
      issuer: 'Example',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      counter: 0,
    },
    sensitive: true,
  }),
  social: meta({
    id: 'social',
    label: 'Social profile',
    shortLabel: 'Social',
    description: 'Link to a profile on LinkedIn, Instagram, X, GitHub and more.',
    group: 'apps',
    icon: 'AtSign',
    defaultValue: { network: 'instagram', handle: '' },
    example: { network: 'github', handle: 'octocat' },
    sensitive: false,
  }),
  applink: meta({
    id: 'applink',
    label: 'App link',
    shortLabel: 'App',
    description: 'App Store, Google Play, deep link or universal link.',
    group: 'apps',
    icon: 'Smartphone',
    defaultValue: { kind: 'appstore', value: '' },
    example: { kind: 'playstore', value: 'com.example.app' },
    sensitive: false,
  }),
  customuri: meta({
    id: 'customuri',
    label: 'Custom URI',
    shortLabel: 'URI',
    description: 'Compose any URI from scheme, path and query parameters.',
    group: 'developer',
    icon: 'Braces',
    defaultValue: { mode: 'builder', scheme: '', authority: '', path: '', query: [], raw: '' },
    example: {
      mode: 'builder',
      scheme: 'myapp',
      authority: 'open',
      path: '/item/42',
      query: [{ key: 'ref', value: 'poster' }],
      raw: '',
    },
    sensitive: false,
  }),
  json: meta({
    id: 'json',
    label: 'JSON',
    shortLabel: 'JSON',
    description: 'Embed a JSON document (validated, optionally minified).',
    group: 'developer',
    icon: 'FileJson',
    defaultValue: { json: '', minify: true },
    example: { json: '{"id": 42, "name": "Widget"}', minify: true },
    sensitive: false,
  }),
  raw: meta({
    id: 'raw',
    label: 'Raw payload',
    shortLabel: 'Raw',
    description: 'Expert mode: encode exactly the text you enter.',
    group: 'developer',
    icon: 'Terminal',
    defaultValue: { payload: '' },
    example: { payload: 'HELLO WORLD 123' },
    sensitive: false,
  }),
} as const satisfies { [K in ContentType]: ContentTypeMeta<K> };

export function getContentMeta<T extends ContentType>(type: T): ContentTypeMeta<T> {
  return CONTENT_REGISTRY[type] as unknown as ContentTypeMeta<T>;
}

export function defaultContent<T extends ContentType>(type: T): Extract<ContentInput, { type: T }> {
  return { type, value: structuredClone(getContentMeta(type).defaultValue) } as unknown as Extract<
    ContentInput,
    { type: T }
  >;
}

export function exampleContent<T extends ContentType>(type: T): Extract<ContentInput, { type: T }> {
  return { type, value: structuredClone(getContentMeta(type).example) } as unknown as Extract<
    ContentInput,
    { type: T }
  >;
}

export function contentTypesByGroup(): Array<{
  group: ContentGroup;
  label: string;
  types: ContentTypeMeta[];
}> {
  return CONTENT_GROUPS.map((g) => ({
    group: g.id,
    label: g.label,
    types: (Object.values(CONTENT_REGISTRY) as ContentTypeMeta[]).filter((m) => m.group === g.id),
  }));
}
