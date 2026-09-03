/**
 * Zod schemas for every supported QR content type.
 *
 * The same schemas validate the editor forms in the browser and the JSON body
 * of the HTTP API, so a value that passes here can always be turned into a
 * payload by ../content/builders.ts.
 */
import { z } from 'zod';

import {
  BIC_REGEX,
  BITCOIN_ADDRESS_REGEX,
  ETH_ADDRESS_REGEX,
  hasUriScheme,
  isValidBase32,
  isValidEmail,
  isValidIban,
  isValidPhoneNumber,
  isValidTimeZone,
  normalizeUrl,
  splitList,
} from './utils';

const optStr = (max = 2000) => z.string().max(max).default('');

const phoneField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(32)
    .refine(isValidPhoneNumber, `${label} must contain 3-15 digits and may start with "+".`);

const emailListField = (label: string) =>
  optStr(500).refine(
    (v) => splitList(v).every(isValidEmail),
    `${label} must contain valid email addresses separated by commas.`,
  );

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'Use the format YYYY-MM-DDTHH:mm.');
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use the format YYYY-MM-DD.');

const dataUrlImage = z
  .string()
  .max(1_500_000)
  .regex(
    /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/,
    'Must be a base64 image data URL.',
  );

/* ---------- 1. Plain text ---------- */
export const TextValueSchema = z
  .object({
    text: z.string().min(1, 'Enter some text.').max(4000),
  })
  .strict();

/* ---------- 2. Website URL ---------- */
export const UrlValueSchema = z
  .object({
    url: z.string().trim().min(1, 'Enter a URL.').max(2500),
    autoHttps: z.boolean().default(true),
  })
  .strict()
  .refine((v) => normalizeUrl(v.url, v.autoHttps) !== null, {
    message: 'Enter a valid URL such as https://example.com.',
    path: ['url'],
  });

/* ---------- 3. Email ---------- */
export const EmailValueSchema = z
  .object({
    to: z
      .string()
      .trim()
      .min(1, 'Recipient is required.')
      .max(500)
      .refine(
        (v) => splitList(v).length > 0 && splitList(v).every(isValidEmail),
        'Enter valid recipient email addresses.',
      ),
    cc: emailListField('CC'),
    bcc: emailListField('BCC'),
    subject: optStr(500),
    body: optStr(3000),
  })
  .strict();

/* ---------- 4. Telephone ---------- */
export const PhoneValueSchema = z
  .object({
    number: phoneField('Phone number'),
  })
  .strict();

/* ---------- 5. SMS ---------- */
export const SmsValueSchema = z
  .object({
    number: phoneField('Recipient number'),
    message: optStr(1000),
  })
  .strict();

/* ---------- 6. WhatsApp ---------- */
export const WhatsAppValueSchema = z
  .object({
    number: phoneField('WhatsApp number'),
    message: optStr(1000),
  })
  .strict();

/* ---------- 7. Wi-Fi ---------- */
export const WifiEncryptionSchema = z.enum(['WPA', 'WEP', 'nopass']);
export const WifiValueSchema = z
  .object({
    ssid: z.string().min(1, 'Network name (SSID) is required.').max(32, 'SSIDs are at most 32 characters.'),
    password: optStr(63),
    encryption: WifiEncryptionSchema.default('WPA'),
    hidden: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.encryption !== 'nopass' && v.password.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'A password is required for protected networks.',
      });
    }
    if (v.encryption === 'WPA' && v.password.length > 0 && v.password.length < 8) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'WPA passwords need at least 8 characters.',
      });
    }
  });

/* ---------- 8. vCard ---------- */
export const VCardPhoneTypeSchema = z.enum(['CELL', 'WORK', 'HOME', 'FAX', 'OTHER']);
export const VCardEmailTypeSchema = z.enum(['WORK', 'HOME', 'OTHER']);
export const VCardValueSchema = z
  .object({
    version: z.enum(['3.0', '4.0']).default('3.0'),
    firstName: optStr(100),
    lastName: optStr(100),
    displayName: optStr(200),
    organization: optStr(200),
    title: optStr(200),
    phones: z
      .array(
        z.object({
          type: VCardPhoneTypeSchema.default('CELL'),
          number: z.string().trim().max(32),
        }),
      )
      .max(6)
      .default([]),
    emails: z
      .array(
        z.object({
          type: VCardEmailTypeSchema.default('WORK'),
          address: z.string().trim().max(200),
        }),
      )
      .max(6)
      .default([]),
    website: optStr(500),
    street: optStr(200),
    city: optStr(100),
    postalCode: optStr(20),
    region: optStr(100),
    country: optStr(100),
    birthday: optStr(10),
    notes: optStr(1000),
    photo: dataUrlImage.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.firstName && !v.lastName && !v.displayName && !v.organization) {
      ctx.addIssue({
        code: 'custom',
        path: ['firstName'],
        message: 'Enter at least a name or an organization.',
      });
    }
    v.phones.forEach((p, i) => {
      if (p.number && !isValidPhoneNumber(p.number)) {
        ctx.addIssue({ code: 'custom', path: ['phones', i, 'number'], message: 'Invalid phone number.' });
      }
    });
    v.emails.forEach((e, i) => {
      if (e.address && !isValidEmail(e.address)) {
        ctx.addIssue({ code: 'custom', path: ['emails', i, 'address'], message: 'Invalid email address.' });
      }
    });
    if (v.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(v.birthday)) {
      ctx.addIssue({ code: 'custom', path: ['birthday'], message: 'Use the format YYYY-MM-DD.' });
    }
    if (v.website && normalizeUrl(v.website) === null) {
      ctx.addIssue({ code: 'custom', path: ['website'], message: 'Invalid website URL.' });
    }
  });

/* ---------- 9. MeCard ---------- */
export const MeCardValueSchema = z
  .object({
    lastName: optStr(100),
    firstName: optStr(100),
    phone: optStr(32),
    email: optStr(200),
    address: optStr(300),
    website: optStr(500),
    note: optStr(500),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.firstName && !v.lastName) {
      ctx.addIssue({ code: 'custom', path: ['lastName'], message: 'Enter a name.' });
    }
    if (v.phone && !isValidPhoneNumber(v.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Invalid phone number.' });
    }
    if (v.email && !isValidEmail(v.email)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Invalid email address.' });
    }
    if (v.website && normalizeUrl(v.website) === null) {
      ctx.addIssue({ code: 'custom', path: ['website'], message: 'Invalid website URL.' });
    }
  });

/* ---------- 10. Calendar event ---------- */
export const EventValueSchema = z
  .object({
    title: z.string().trim().min(1, 'Event title is required.').max(300),
    start: z.string().min(1, 'Start is required.'),
    end: optStr(30),
    allDay: z.boolean().default(false),
    timeZone: optStr(64).refine(isValidTimeZone, 'Unknown IANA time zone.'),
    location: optStr(500),
    description: optStr(2000),
    url: optStr(1000),
  })
  .strict()
  .superRefine((v, ctx) => {
    const dateSchema = v.allDay ? localDate : localDateTime;
    if (!dateSchema.safeParse(v.start).success) {
      ctx.addIssue({
        code: 'custom',
        path: ['start'],
        message: v.allDay ? 'Use the format YYYY-MM-DD.' : 'Use the format YYYY-MM-DDTHH:mm.',
      });
    }
    if (v.end && !dateSchema.safeParse(v.end).success) {
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: v.allDay ? 'Use the format YYYY-MM-DD.' : 'Use the format YYYY-MM-DDTHH:mm.',
      });
    }
    if (v.end && v.start && v.end < v.start) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'End must be after start.' });
    }
    if (v.url && normalizeUrl(v.url) === null) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'Invalid URL.' });
    }
  });

/* ---------- 11. Geographic location ---------- */
export const GeoValueSchema = z
  .object({
    latitude: z.coerce
      .number()
      .min(-90, 'Latitude is between -90 and 90.')
      .max(90, 'Latitude is between -90 and 90.'),
    longitude: z.coerce
      .number()
      .min(-180, 'Longitude is between -180 and 180.')
      .max(180, 'Longitude is between -180 and 180.'),
    label: optStr(200),
  })
  .strict();

/* ---------- 12. SEPA / EPC payment ---------- */
export const EpcValueSchema = z
  .object({
    name: z.string().trim().min(1, 'Recipient name is required.').max(70, 'At most 70 characters.'),
    iban: z
      .string()
      .trim()
      .min(1, 'IBAN is required.')
      .refine(isValidIban, 'Invalid IBAN (checksum failed).'),
    bic: optStr(11).refine((v) => !v || BIC_REGEX.test(v.replace(/\s+/g, '').toUpperCase()), 'Invalid BIC.'),
    amount: optStr(20).refine(
      (v) => !v || (/^\d{1,9}(\.\d{1,2})?$/.test(v) && Number(v) >= 0.01 && Number(v) <= 999999999.99),
      'Amount must be between 0.01 and 999999999.99 with at most two decimals.',
    ),
    currency: z.literal('EUR').default('EUR'),
    purpose: optStr(4).refine(
      (v) => !v || /^[A-Za-z0-9]{4}$/.test(v),
      'Purpose code is a 4-letter SEPA code (e.g. GDDS).',
    ),
    reference: optStr(35),
    remittance: optStr(140),
    information: optStr(70),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.reference && v.remittance) {
      ctx.addIssue({
        code: 'custom',
        path: ['reference'],
        message: 'Use either a structured reference or an unstructured remittance text, not both.',
      });
    }
  });

/* ---------- 13. Bitcoin ---------- */
export const BitcoinValueSchema = z
  .object({
    address: z
      .string()
      .trim()
      .min(1, 'Address is required.')
      .refine((v) => BITCOIN_ADDRESS_REGEX.test(v), 'Invalid Bitcoin address.'),
    amount: optStr(30).refine(
      (v) => !v || /^\d+(\.\d{1,8})?$/.test(v),
      'Amount in BTC with up to 8 decimals.',
    ),
    label: optStr(200),
    message: optStr(500),
  })
  .strict();

/* ---------- 14. Ethereum ---------- */
export const EthereumValueSchema = z
  .object({
    address: z
      .string()
      .trim()
      .min(1, 'Address is required.')
      .refine((v) => ETH_ADDRESS_REGEX.test(v), 'Invalid Ethereum address.'),
    chainId: optStr(12).refine((v) => !v || /^\d+$/.test(v), 'Chain ID must be a positive integer.'),
    amount: optStr(40).refine(
      (v) => !v || /^\d+(\.\d{1,18})?$/.test(v),
      'Amount in ETH with up to 18 decimals.',
    ),
    token: z
      .object({
        contract: z
          .string()
          .trim()
          .refine((v) => ETH_ADDRESS_REGEX.test(v), 'Invalid token contract address.'),
        amount: z
          .string()
          .trim()
          .regex(/^\d+(\.\d+)?$/, 'Token amount must be a decimal number.'),
        decimals: z.coerce.number().int().min(0).max(36).default(18),
      })
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.token && v.amount) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'A token transfer cannot also send ETH.' });
    }
  });

/* ---------- 15. OTP Auth ---------- */
export const OtpAuthValueSchema = z
  .object({
    type: z.enum(['totp', 'hotp']).default('totp'),
    account: z.string().trim().min(1, 'Account name is required.').max(200),
    issuer: optStr(200),
    secret: z
      .string()
      .trim()
      .min(1, 'Secret is required.')
      .max(512)
      .refine(isValidBase32, 'Secret must be base32 (A-Z, 2-7), at least 8 characters.'),
    algorithm: z.enum(['SHA1', 'SHA256', 'SHA512']).default('SHA1'),
    digits: z.coerce
      .number()
      .int()
      .refine((v) => v === 6 || v === 7 || v === 8, 'Digits must be 6, 7 or 8.')
      .default(6),
    period: z.coerce.number().int().min(5).max(300).default(30),
    counter: z.coerce.number().int().min(0).default(0),
  })
  .strict();

/* ---------- 16. Social profiles ---------- */
export const SocialNetworkSchema = z.enum([
  'linkedin',
  'instagram',
  'facebook',
  'x',
  'youtube',
  'tiktok',
  'telegram',
  'signal',
  'github',
  'custom',
]);
export const SocialValueSchema = z
  .object({
    network: SocialNetworkSchema.default('instagram'),
    handle: z.string().trim().min(1, 'Enter a username, phone number or profile URL.').max(500),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.network === 'custom' && normalizeUrl(v.handle) === null) {
      ctx.addIssue({ code: 'custom', path: ['handle'], message: 'Enter a valid profile URL.' });
    }
    if (
      v.network === 'signal' &&
      !hasUriScheme(v.handle) &&
      !isValidPhoneNumber(v.handle) &&
      !v.handle.includes('signal.me')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['handle'],
        message: 'Signal links use a phone number or a signal.me URL.',
      });
    }
  });

/* ---------- 17. App link ---------- */
export const AppLinkKindSchema = z.enum(['appstore', 'playstore', 'deeplink', 'universal']);
export const AppLinkValueSchema = z
  .object({
    kind: AppLinkKindSchema.default('appstore'),
    value: z.string().trim().min(1, 'Enter a store URL, package name or link.').max(2000),
  })
  .strict()
  .superRefine((v, ctx) => {
    switch (v.kind) {
      case 'appstore':
        if (!/^https:\/\/(apps|itunes)\.apple\.com\//i.test(v.value)) {
          ctx.addIssue({
            code: 'custom',
            path: ['value'],
            message: 'Use an https://apps.apple.com/... URL.',
          });
        }
        break;
      case 'playstore':
        if (
          !/^https:\/\/play\.google\.com\//i.test(v.value) &&
          !/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(v.value)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['value'],
            message:
              'Use a https://play.google.com/store/apps/details?id=... URL or a package name like com.example.app.',
          });
        }
        break;
      case 'deeplink':
        if (!hasUriScheme(v.value) || /\s/.test(v.value)) {
          ctx.addIssue({
            code: 'custom',
            path: ['value'],
            message: 'Deep links need a scheme, e.g. myapp://open/item/42.',
          });
        }
        break;
      case 'universal':
        if (!/^https:\/\//i.test(v.value) || normalizeUrl(v.value) === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['value'],
            message: 'Universal links must be https:// URLs.',
          });
        }
        break;
    }
  });

/* ---------- 18. Custom URI ---------- */
export const CustomUriValueSchema = z
  .object({
    mode: z.enum(['builder', 'raw']).default('builder'),
    scheme: optStr(64),
    authority: optStr(500),
    path: optStr(1000),
    query: z
      .array(z.object({ key: z.string().max(200), value: z.string().max(1000) }))
      .max(50)
      .default([]),
    raw: optStr(3000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === 'raw') {
      if (!v.raw.trim() || !hasUriScheme(v.raw.trim()) || /\s/.test(v.raw.trim())) {
        ctx.addIssue({
          code: 'custom',
          path: ['raw'],
          message: 'Enter a complete URI with a scheme and no spaces.',
        });
      }
    } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(v.scheme)) {
      ctx.addIssue({
        code: 'custom',
        path: ['scheme'],
        message: 'Scheme must start with a letter (e.g. myapp).',
      });
    }
  });

/* ---------- 19. JSON ---------- */
export const JsonValueSchema = z
  .object({
    json: z
      .string()
      .min(1, 'Enter a JSON document.')
      .max(4000)
      .refine((v) => {
        try {
          JSON.parse(v);
          return true;
        } catch {
          return false;
        }
      }, 'Invalid JSON.'),
    minify: z.boolean().default(true),
  })
  .strict();

/* ---------- 20. Raw payload ---------- */
export const RawValueSchema = z
  .object({
    payload: z.string().min(1, 'Enter the payload to encode.').max(4000),
  })
  .strict();

/* ---------- Discriminated union ---------- */
export const ContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), value: TextValueSchema }).strict(),
  z.object({ type: z.literal('url'), value: UrlValueSchema }).strict(),
  z.object({ type: z.literal('email'), value: EmailValueSchema }).strict(),
  z.object({ type: z.literal('phone'), value: PhoneValueSchema }).strict(),
  z.object({ type: z.literal('sms'), value: SmsValueSchema }).strict(),
  z.object({ type: z.literal('whatsapp'), value: WhatsAppValueSchema }).strict(),
  z.object({ type: z.literal('wifi'), value: WifiValueSchema }).strict(),
  z.object({ type: z.literal('vcard'), value: VCardValueSchema }).strict(),
  z.object({ type: z.literal('mecard'), value: MeCardValueSchema }).strict(),
  z.object({ type: z.literal('event'), value: EventValueSchema }).strict(),
  z.object({ type: z.literal('geo'), value: GeoValueSchema }).strict(),
  z.object({ type: z.literal('epc'), value: EpcValueSchema }).strict(),
  z.object({ type: z.literal('bitcoin'), value: BitcoinValueSchema }).strict(),
  z.object({ type: z.literal('ethereum'), value: EthereumValueSchema }).strict(),
  z.object({ type: z.literal('otpauth'), value: OtpAuthValueSchema }).strict(),
  z.object({ type: z.literal('social'), value: SocialValueSchema }).strict(),
  z.object({ type: z.literal('applink'), value: AppLinkValueSchema }).strict(),
  z.object({ type: z.literal('customuri'), value: CustomUriValueSchema }).strict(),
  z.object({ type: z.literal('json'), value: JsonValueSchema }).strict(),
  z.object({ type: z.literal('raw'), value: RawValueSchema }).strict(),
]);

export type Content = z.infer<typeof ContentSchema>;
export type ContentInput = z.input<typeof ContentSchema>;
export type ContentType = Content['type'];
export type ContentValue<T extends ContentType> = Extract<Content, { type: T }>['value'];
export type ContentValueInput<T extends ContentType> = Extract<ContentInput, { type: T }>['value'];

export const CONTENT_TYPES = [
  'text',
  'url',
  'email',
  'phone',
  'sms',
  'whatsapp',
  'wifi',
  'vcard',
  'mecard',
  'event',
  'geo',
  'epc',
  'bitcoin',
  'ethereum',
  'otpauth',
  'social',
  'applink',
  'customuri',
  'json',
  'raw',
] as const satisfies readonly ContentType[];

/** Content types whose payload is sensitive and must never be logged or persisted implicitly. */
export const SENSITIVE_CONTENT_TYPES: ReadonlySet<ContentType> = new Set<ContentType>([
  'otpauth',
  'wifi',
  'vcard',
  'mecard',
  'epc',
  'bitcoin',
  'ethereum',
  'email',
  'phone',
  'sms',
  'whatsapp',
]);
