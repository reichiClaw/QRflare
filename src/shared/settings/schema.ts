/**
 * Server-side application settings, editable in the Admin area and stored in
 * D1. Environment variables provide defaults; anything saved in the Admin area
 * takes precedence.
 */
import { z } from 'zod';

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === '' || /^https?:\/\/[^\s/]+/i.test(v),
    'Enter a full URL starting with https:// (or leave empty).',
  )
  .transform((v) => v.replace(/\/+$/, ''));

export const DYNAMIC_PROVIDERS = ['off', 'builtin', 'sink'] as const;
export type DynamicProvider = (typeof DYNAMIC_PROVIDERS)[number];

export const AppSettingsSchema = z
  .object({
    general: z
      .object({
        appName: z.string().trim().min(1).max(60).default('FlareQR Studio'),
      })
      .default({ appName: 'FlareQR Studio' }),
    api: z
      .object({
        /** Require `Authorization: Bearer <token>` for /api/v1/* (bundled UI stays exempt). */
        requireToken: z.boolean().default(false),
        token: z.string().trim().max(200).default(''),
        corsAllowedOrigins: z
          .array(
            z
              .string()
              .trim()
              .regex(/^https?:\/\/[^\s/]+$/, 'Origins look like https://app.example.com (no path).'),
          )
          .max(50)
          .default([]),
        maxRasterSize: z.number().int().min(128).max(8192).default(4096),
      })
      .default({ requireToken: false, token: '', corsAllowedOrigins: [], maxRasterSize: 4096 }),
    dynamic: z
      .object({
        provider: z.enum(DYNAMIC_PROVIDERS).default('off'),
        /** Allow anyone (no admin login) to create and edit links. Default: admins only. */
        publicAccess: z.boolean().default(false),
        builtin: z
          .object({
            /** Custom domains routed to this Worker, e.g. https://qr.example.com. */
            domains: z.array(optionalUrl).max(20).default([]),
            /** Domain used in generated short links; must be one of `domains`. Empty = this deployment's origin. */
            publicBaseUrl: optionalUrl.default(''),
          })
          .default({ domains: [], publicBaseUrl: '' }),
        sink: z
          .object({
            /** Where the Sink instance is reachable, e.g. https://s.example.com. */
            baseUrl: optionalUrl.default(''),
            /** Sink's NUXT_SITE_TOKEN. */
            token: z.string().trim().max(200).default(''),
            /** Additional domains attached to the Sink instance, e.g. https://go.example.com. */
            domains: z.array(optionalUrl).max(20).default([]),
            /** Domain used in generated short links; must be the Sink URL or one of `domains`. Empty = Sink URL. */
            linkBaseUrl: optionalUrl.default(''),
          })
          .default({ baseUrl: '', token: '', domains: [], linkBaseUrl: '' }),
      })
      .default({
        provider: 'off',
        publicAccess: false,
        builtin: { domains: [], publicBaseUrl: '' },
        sink: { baseUrl: '', token: '', domains: [], linkBaseUrl: '' },
      }),
  })
  .superRefine((s, ctx) => {
    if (s.api.requireToken && s.api.token.length < 16) {
      ctx.addIssue({
        code: 'custom',
        path: ['api', 'token'],
        message: 'Use a token of at least 16 characters when requiring one.',
      });
    }
    if (s.dynamic.provider === 'sink') {
      if (!s.dynamic.sink.baseUrl)
        ctx.addIssue({
          code: 'custom',
          path: ['dynamic', 'sink', 'baseUrl'],
          message: 'Enter the URL of your Sink instance.',
        });
      if (s.dynamic.sink.token.length < 8)
        ctx.addIssue({
          code: 'custom',
          path: ['dynamic', 'sink', 'token'],
          message: 'Enter the Sink site token (NUXT_SITE_TOKEN, at least 8 characters).',
        });
    }
    const sinkChoices = [s.dynamic.sink.baseUrl, ...s.dynamic.sink.domains].filter(Boolean);
    if (s.dynamic.sink.linkBaseUrl && !sinkChoices.includes(s.dynamic.sink.linkBaseUrl)) {
      ctx.addIssue({
        code: 'custom',
        path: ['dynamic', 'sink', 'linkBaseUrl'],
        message: 'Pick the Sink URL or one of the Sink domains listed above.',
      });
    }
    if (
      s.dynamic.builtin.publicBaseUrl &&
      !s.dynamic.builtin.domains.includes(s.dynamic.builtin.publicBaseUrl)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['dynamic', 'builtin', 'publicBaseUrl'],
        message: 'Pick one of the domains listed above.',
      });
    }
  });

export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type AppSettingsInput = z.input<typeof AppSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = AppSettingsSchema.parse({});

/** Public, non-secret projection exposed on /api/health so the UI can adapt. */
export interface PublicFeatures {
  appName: string;
  /** Persistent storage (D1) is bound – required for admin settings and built-in links. */
  storage: boolean;
  /** No admin password exists yet; the first visitor of the Admin area sets one. */
  adminSetupRequired: boolean;
  /** Admin login is possible (storage or ADMIN_PASSWORD present). */
  adminAvailable: boolean;
  apiTokenRequired: boolean;
  dynamicLinks: {
    provider: DynamicProvider;
    publicAccess: boolean;
    /** Base URL used in generated short links (without trailing slash). */
    linkBaseUrl: string;
  };
}

/** Resolves the base URL that short links use for a given provider. */
export function resolveLinkBaseUrl(settings: AppSettings, requestOrigin: string): string {
  if (settings.dynamic.provider === 'sink') {
    return settings.dynamic.sink.linkBaseUrl || settings.dynamic.sink.baseUrl;
  }
  if (settings.dynamic.provider === 'builtin') {
    return settings.dynamic.builtin.publicBaseUrl || requestOrigin;
  }
  return requestOrigin;
}

/** Removes secrets before sending settings to the browser (they are shown as "set" instead). */
export function redactSettings(
  settings: AppSettings,
): AppSettings & { secrets: { apiToken: boolean; sinkToken: boolean } } {
  return {
    ...settings,
    api: { ...settings.api, token: '' },
    dynamic: { ...settings.dynamic, sink: { ...settings.dynamic.sink, token: '' } },
    secrets: { apiToken: settings.api.token.length > 0, sinkToken: settings.dynamic.sink.token.length > 0 },
  };
}
