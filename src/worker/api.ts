/**
 * /api/* handlers.
 */
import {
  MAX_PAYLOAD_CHARS,
  MAX_REQUEST_BODY_BYTES,
  requestJsonSchema,
  type HealthResponse,
  type ValidateResponse,
} from '@shared/api/schemas';
import { prepare, type Prepared } from '@shared/pipeline';
import { contentDisposition } from '@shared/security/filename';
import { resolveLinkBaseUrl, type AppSettings, type PublicFeatures } from '@shared/settings/schema';
import { MIME_TYPES } from '@shared/style/schema';

import { adminState } from './admin';
import type { Env } from './env';
import { HttpError, json, readJsonBody } from './http';
import { rasterizeSvg } from './raster';

export async function handleHealth(request: Request, env: Env, settings: AppSettings): Promise<Response> {
  const admin = await adminState(env);
  const features: PublicFeatures = {
    appName: settings.general.appName,
    storage: admin.storage,
    adminSetupRequired: admin.setupRequired,
    adminAvailable: admin.adminAvailable,
    apiTokenRequired: settings.api.requireToken && settings.api.token.length > 0,
    dynamicLinks: {
      provider: settings.dynamic.provider,
      publicAccess: settings.dynamic.publicAccess,
      linkBaseUrl:
        settings.dynamic.provider === 'off' ? '' : resolveLinkBaseUrl(settings, new URL(request.url).origin),
    },
  };
  const body: HealthResponse = {
    status: 'ok',
    name: settings.general.appName,
    version: __APP_VERSION__,
    commit: __APP_COMMIT__,
    buildTime: __APP_BUILD_TIME__,
    api: { version: 'v1', openapi: '/openapi.yaml' },
    features,
    limits: {
      maxRequestBodyBytes: MAX_REQUEST_BODY_BYTES,
      maxRasterSize: settings.api.maxRasterSize,
      maxPayloadChars: MAX_PAYLOAD_CHARS,
    },
  };
  return json(body);
}

export function handleSchema(): Response {
  return json({
    openapi: '/openapi.yaml',
    endpoints: {
      validate: { method: 'POST', path: '/api/v1/validate' },
      generate: { method: 'POST', path: '/api/v1/generate' },
    },
    requestSchema: requestJsonSchema(),
  });
}

async function prepareFromRequest(request: Request, settings: AppSettings): Promise<Prepared> {
  const body = await readJsonBody(request, MAX_REQUEST_BODY_BYTES);
  const result = prepare(body);
  if (!result.ok) {
    const status = result.code === 'CAPACITY' ? 422 : 400;
    throw new HttpError(status, result.code, result.message, result.issues);
  }
  const limit = settings.api.maxRasterSize;
  if (result.output.format !== 'svg' && result.output.size > limit) {
    throw new HttpError(
      400,
      'SIZE_TOO_LARGE',
      `This deployment renders raster images up to ${limit} px wide.`,
      [{ path: 'output.size', message: `Must be ≤ ${limit}.` }],
    );
  }
  return result;
}

export async function handleValidate(request: Request, settings: AppSettings): Promise<Response> {
  const prepared = await prepareFromRequest(request, settings);
  const body: ValidateResponse = {
    ok: true,
    payload: prepared.payload,
    qr: {
      version: prepared.encode.version,
      matrixSize: prepared.encode.matrix.size,
      errorCorrection: prepared.encode.errorCorrection,
      mask: prepared.encode.mask,
      byteLength: prepared.encode.byteLength,
      charLength: prepared.encode.charLength,
      capacityUsedPercent: prepared.encode.usagePercent,
      remainingBytes: Math.max(0, Math.floor(prepared.encode.remainingBits / 8)),
      marginModules: prepared.qr.marginModules,
    },
    reliability: {
      status: prepared.reliability.status,
      score: prepared.reliability.score,
      warnings: [
        ...prepared.contentWarnings.map((message, i) => ({
          id: `content-${i}`,
          severity: 'info' as const,
          message,
        })),
        ...prepared.reliability.warnings.map((w) => ({
          id: w.id,
          severity: w.severity,
          message: w.message,
          ...(w.hint ? { hint: w.hint } : {}),
        })),
      ],
    },
    normalized: {
      content: prepared.content,
      qr: prepared.qr,
      style: stripLogoData(prepared.style),
      output: prepared.output,
    },
    image: {
      width: prepared.render.width,
      height: prepared.render.height,
      mimeType: MIME_TYPES[prepared.output.format],
      filename: prepared.filename,
    },
  };
  return json(body);
}

function stripLogoData(style: Prepared['style']): Prepared['style'] {
  if (!style.logo.dataUrl) return style;
  // Echoing a megabyte of base64 back is wasteful; signal presence instead.
  return { ...style, logo: { ...style.logo, dataUrl: undefined } };
}

export async function handleGenerate(request: Request, settings: AppSettings): Promise<Response> {
  const prepared = await prepareFromRequest(request, settings);
  const url = new URL(request.url);
  const inline = url.searchParams.get('disposition') === 'inline';
  const headers: Record<string, string> = {
    'Content-Disposition': contentDisposition(prepared.filename, inline),
    'X-QR-Version': String(prepared.encode.version),
    'X-QR-Error-Correction': prepared.encode.errorCorrection,
    'X-QR-Reliability': prepared.reliability.status,
  };

  if (prepared.output.format === 'svg') {
    return new Response(prepared.render.svg, {
      status: 200,
      headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' },
    });
  }

  const raster = await rasterizeSvg(prepared.render.svg, {
    format: prepared.output.format,
    width: prepared.output.size,
    jpegQuality: prepared.output.jpegQuality,
    jpegBackground: prepared.output.jpegBackground,
  });
  const body = new Uint8Array(raster.bytes.byteLength);
  body.set(raster.bytes);
  return new Response(body, {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': raster.mimeType,
      'Content-Length': String(raster.bytes.byteLength),
      'X-Image-Width': String(raster.width),
      'X-Image-Height': String(raster.height),
    },
  });
}
