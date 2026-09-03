/**
 * The single generation pipeline used by the editor, the batch generator, the
 * Worker API and the tests:
 *
 *   content ─▶ payload ─▶ QR matrix ─▶ SVG ─▶ reliability report
 *
 * Nothing in here touches the DOM, Canvas or Node APIs.
 */
import { GenerateRequestSchema, MAX_PAYLOAD_CHARS } from './api/schemas';
import { buildPayload, type PayloadIssue } from './content/builders';
import type { Content } from './content/schemas';
import { getContentMeta } from './content/registry';
import {
  encodeQr,
  QrEncodeError,
  utf8ByteLength,
  codePointLength,
  type EncodeResult,
  type QrOptions,
} from './qr/encode';
import { evaluateReliability, type ReliabilityReport } from './quality/reliability';
import { renderSvg, type RenderResult } from './render/svg';
import { DataUrlError, validateLogoDataUrl } from './security/data-url';
import { buildDownloadName } from './security/filename';
import {
  QrOptionsSchema,
  resolveStyle,
  OutputSchema,
  type Output,
  type Style,
  MIME_TYPES,
} from './style/schema';

export interface Prepared {
  ok: true;
  content: Content;
  payload: string;
  qr: QrOptions;
  style: Style;
  output: Output;
  encode: EncodeResult;
  render: RenderResult;
  reliability: ReliabilityReport;
  /** Builder-level advisories (e.g. photo omitted). */
  contentWarnings: string[];
  filename: string;
  mimeType: string;
}

export interface PreparationFailure {
  ok: false;
  code: 'VALIDATION' | 'PAYLOAD' | 'CAPACITY' | 'LOGO';
  message: string;
  issues: PayloadIssue[];
}

export type PrepareResult = Prepared | PreparationFailure;

function zodIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): PayloadIssue[] {
  return error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
}

/**
 * Validates a request, builds the payload, encodes the QR and renders SVG.
 * `sizeOverride` lets the UI render preview SVGs at a display size without
 * changing the export size stored in `output`.
 */
export function prepare(request: unknown, options: { sizeOverride?: number } = {}): PrepareResult {
  const parsed = GenerateRequestSchema.safeParse(request);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'The request is invalid.',
      issues: zodIssues(parsed.error),
    };
  }
  const req = parsed.data;

  const qr = QrOptionsSchema.parse(req.qr ?? {});
  let style: Style;
  try {
    style = resolveStyle(req.style ?? {});
  } catch (error) {
    const issues = error && typeof error === 'object' && 'issues' in error ? zodIssues(error as never) : [];
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'The style is invalid.',
      issues: issues.map((i) => ({ ...i, path: `style.${i.path}` })),
    };
  }
  const output = OutputSchema.parse(req.output ?? {});

  if (style.logo.dataUrl) {
    try {
      const validated = validateLogoDataUrl(style.logo.dataUrl);
      style = { ...style, logo: { ...style.logo, dataUrl: validated.dataUrl } };
    } catch (error) {
      return {
        ok: false,
        code: 'LOGO',
        message: error instanceof DataUrlError ? error.message : 'The logo could not be processed.',
        issues: [
          {
            path: 'style.logo.dataUrl',
            message: error instanceof DataUrlError ? error.message : 'Invalid logo.',
          },
        ],
      };
    }
  }

  const built = buildPayload(req.content, { maxBytes: capacityHint(qr) });
  if (!built.ok) {
    return {
      ok: false,
      code: 'PAYLOAD',
      message: 'The content is invalid.',
      issues: built.issues.map((i) => ({ ...i, path: `content.value${i.path ? `.${i.path}` : ''}` })),
    };
  }
  if (built.payload.length > MAX_PAYLOAD_CHARS) {
    return {
      ok: false,
      code: 'CAPACITY',
      message: `The payload exceeds ${MAX_PAYLOAD_CHARS} characters.`,
      issues: [{ path: 'content', message: `Payload too long (${built.payload.length} characters).` }],
    };
  }

  let encode: EncodeResult;
  try {
    encode = encodeQr(built.payload, qr);
  } catch (error) {
    if (error instanceof QrEncodeError) {
      return {
        ok: false,
        code: 'CAPACITY',
        message: error.message,
        issues: [{ path: 'content', message: error.message }],
      };
    }
    throw error;
  }

  const meta = getContentMeta(built.content.type);
  const render = renderSvg({
    matrix: encode.matrix,
    marginModules: qr.marginModules,
    style,
    size: options.sizeOverride ?? output.size,
    title: `QR code: ${meta.label}`,
  });

  const reliability = evaluateReliability({
    encode,
    style,
    outputSize: output.size,
    designWidth: render.design.width,
    marginModules: qr.marginModules,
    logoCoverage: render.logoCoverage,
    logoClamped: render.logoClamped,
    payloadBytes: encode.byteLength,
    payloadChars: encode.charLength,
    forcedVersion: qr.version !== 'auto',
  });

  return {
    ok: true,
    content: built.content,
    payload: built.payload,
    qr,
    style,
    output,
    encode,
    render,
    reliability,
    contentWarnings: built.warnings,
    filename: buildDownloadName(output.filename, output.format, `${built.content.type}-qr`),
    mimeType: MIME_TYPES[output.format],
  };
}

function capacityHint(qr: QrOptions): number {
  // Byte capacity for version 40 at the requested level (byte mode).
  switch (qr.errorCorrection) {
    case 'L':
      return 2953;
    case 'M':
      return 2331;
    case 'Q':
      return 1663;
    case 'H':
      return 1273;
  }
}

/** Convenience wrapper for callers that only need the payload text. */
export function payloadOf(content: unknown): { payload: string; issues: PayloadIssue[]; warnings: string[] } {
  const built = buildPayload(content);
  if (!built.ok) return { payload: '', issues: built.issues, warnings: [] };
  return { payload: built.payload, issues: [], warnings: built.warnings };
}

export { utf8ByteLength, codePointLength };
