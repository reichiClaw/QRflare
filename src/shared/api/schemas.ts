/**
 * HTTP API request/response schemas (also used to produce JSON Schema for
 * GET /api/v1/schema).
 */
import { z } from 'zod';

import { ContentSchema } from '../content/schemas';
import { OutputSchema, QrOptionsSchema, StyleSchema } from '../style/schema';

/** Maximum accepted JSON body size in bytes (covers a 1 MB base64 logo). */
export const MAX_REQUEST_BODY_BYTES = 1_600_000;
/** Maximum payload length in characters accepted by the API. */
export const MAX_PAYLOAD_CHARS = 4000;

export const GenerateRequestSchema = z
  .object({
    content: ContentSchema,
    qr: QrOptionsSchema.optional(),
    /** Partial style; merged over the defaults and validated with StyleSchema. */
    style: z.record(z.string(), z.unknown()).optional(),
    output: OutputSchema.optional(),
  })
  .strict();

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type GenerateRequestInput = z.input<typeof GenerateRequestSchema>;

export const ValidateRequestSchema = GenerateRequestSchema;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ApiWarningSchema = z.object({
  id: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string(),
  hint: z.string().optional(),
});

export const ValidateResponseSchema = z.object({
  ok: z.literal(true),
  payload: z.string(),
  qr: z.object({
    version: z.number(),
    matrixSize: z.number(),
    errorCorrection: z.enum(['L', 'M', 'Q', 'H']),
    mask: z.number(),
    byteLength: z.number(),
    charLength: z.number(),
    capacityUsedPercent: z.number(),
    remainingBytes: z.number(),
    marginModules: z.number(),
  }),
  reliability: z.object({
    status: z.enum(['excellent', 'good', 'risky', 'invalid']),
    score: z.number(),
    warnings: z.array(ApiWarningSchema),
  }),
  normalized: z.object({
    content: ContentSchema,
    qr: QrOptionsSchema,
    style: StyleSchema,
    output: OutputSchema,
  }),
  image: z.object({
    width: z.number(),
    height: z.number(),
    mimeType: z.string(),
    filename: z.string(),
  }),
});
export type ValidateResponse = z.infer<typeof ValidateResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  name: z.string(),
  version: z.string(),
  commit: z.string(),
  buildTime: z.string(),
  api: z.object({ version: z.literal('v1'), openapi: z.string() }),
  features: z.object({
    appName: z.string(),
    storage: z.boolean(),
    adminSetupRequired: z.boolean(),
    adminAvailable: z.boolean(),
    apiTokenRequired: z.boolean(),
    dynamicLinks: z.object({
      provider: z.enum(['off', 'builtin', 'sink']),
      publicAccess: z.boolean(),
      linkBaseUrl: z.string(),
    }),
  }),
  limits: z.object({
    maxRequestBodyBytes: z.number(),
    maxRasterSize: z.number(),
    maxPayloadChars: z.number(),
  }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export function requestJsonSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'FlareQR Studio generate request',
    description: 'Body of POST /api/v1/generate and POST /api/v1/validate.',
    type: 'object',
    additionalProperties: false,
    required: ['content'],
    properties: {
      content: z.toJSONSchema(ContentSchema, { io: 'input' }),
      qr: z.toJSONSchema(QrOptionsSchema, { io: 'input' }),
      style: z.toJSONSchema(StyleSchema, { io: 'input' }),
      output: z.toJSONSchema(OutputSchema, { io: 'input' }),
    },
  };
}
