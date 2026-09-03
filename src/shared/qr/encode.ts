/**
 * QR encoding layer.
 *
 * Wraps the vendored Nayuki encoder and exposes a small, stable API that
 * produces an immutable module matrix. Rendering/styling never happens here –
 * see ../render for the SVG renderer.
 */
import { Ecc, QrCode, QrSegment } from './qrcodegen';

export const ERROR_CORRECTION_LEVELS = ['L', 'M', 'Q', 'H'] as const;
export type ErrorCorrectionLevel = (typeof ERROR_CORRECTION_LEVELS)[number];

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;
export const DEFAULT_MARGIN_MODULES = 4;
export const MAX_MARGIN_MODULES = 20;

/** Absolute maximum payload length in UTF-8 bytes (version 40, level L, byte mode). */
export const MAX_PAYLOAD_BYTES = 2953;

export interface QrOptions {
  errorCorrection: ErrorCorrectionLevel;
  /** 'auto' picks the smallest version that fits; a number forces that exact version. */
  version: 'auto' | number;
  /** 'auto' evaluates all eight masks and picks the lowest penalty score. */
  mask: 'auto' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Raise the error-correction level when it fits in the same version for free. */
  boostErrorCorrection: boolean;
  /** Quiet zone width in modules (spec minimum is 4). */
  marginModules: number;
}

export const DEFAULT_QR_OPTIONS: QrOptions = {
  errorCorrection: 'M',
  version: 'auto',
  mask: 'auto',
  boostErrorCorrection: true,
  marginModules: DEFAULT_MARGIN_MODULES,
};

export type SegmentMode = 'numeric' | 'alphanumeric' | 'byte' | 'kanji' | 'eci';

export interface SegmentInfo {
  mode: SegmentMode;
  numChars: number;
  bits: number;
}

/**
 * Immutable QR symbol. `modules` is row-major, `1` = dark, `0` = light and does
 * not include the quiet zone. Finder patterns can be located from `size`.
 */
export interface QrMatrix {
  readonly size: number;
  readonly modules: Uint8Array;
  readonly version: number;
  readonly errorCorrection: ErrorCorrectionLevel;
  readonly mask: number;
}

export interface EncodeResult {
  matrix: QrMatrix;
  version: number;
  /** Requested level (before boosting). */
  requestedErrorCorrection: ErrorCorrectionLevel;
  /** Level actually used (may be higher when boosting is enabled). */
  errorCorrection: ErrorCorrectionLevel;
  mask: number;
  /** Payload length in UTF-8 bytes. */
  byteLength: number;
  /** Number of Unicode code points in the payload. */
  charLength: number;
  /** Bits consumed by the segments (excluding padding and ECC). */
  dataBits: number;
  /** Data capacity in bits at the chosen version and level. */
  capacityBits: number;
  /** Unused bits before padding. */
  remainingBits: number;
  /** Percentage of the capacity used at this version and level (0-100). */
  usagePercent: number;
  /** Capacity (in bytes, byte mode) of version 40 at the *requested* level. */
  maxBytesAtLevel: number;
  segments: SegmentInfo[];
  /** Quiet zone requested by the caller (not part of `matrix`). */
  marginModules: number;
}

export class QrEncodeError extends Error {
  readonly code: 'CAPACITY_EXCEEDED' | 'EMPTY_PAYLOAD' | 'INVALID_OPTIONS';
  readonly details: Record<string, number | string> | undefined;
  constructor(code: QrEncodeError['code'], message: string, details?: Record<string, number | string>) {
    super(message);
    this.name = 'QrEncodeError';
    this.code = code;
    this.details = details;
  }
}

const ECC_BY_LEVEL: Record<ErrorCorrectionLevel, Ecc> = {
  L: Ecc.LOW,
  M: Ecc.MEDIUM,
  Q: Ecc.QUARTILE,
  H: Ecc.HIGH,
};

const LEVEL_BY_ORDINAL: ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'];

const textEncoder = new TextEncoder();

export function utf8ByteLength(text: string): number {
  return textEncoder.encode(text).length;
}

export function codePointLength(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

function modeName(seg: QrSegment): SegmentMode {
  const bits = seg.mode.modeBits;
  switch (bits) {
    case 0x1:
      return 'numeric';
    case 0x2:
      return 'alphanumeric';
    case 0x4:
      return 'byte';
    case 0x8:
      return 'kanji';
    default:
      return 'eci';
  }
}

/** Data capacity in bits for a given version/level. */
export function capacityBits(version: number, level: ErrorCorrectionLevel): number {
  return QrCode.getNumDataCodewords(version, ECC_BY_LEVEL[level]) * 8;
}

/**
 * Maximum number of bytes that fit in byte mode for a version/level, including
 * the 4-bit mode indicator and the character-count field.
 */
export function byteModeCapacity(version: number, level: ErrorCorrectionLevel): number {
  const charCountBits = version <= 9 ? 8 : 16;
  return Math.floor((capacityBits(version, level) - 4 - charCountBits) / 8);
}

export function normalizeQrOptions(partial?: Partial<QrOptions>): QrOptions {
  const opts: QrOptions = { ...DEFAULT_QR_OPTIONS, ...partial };
  if (!ERROR_CORRECTION_LEVELS.includes(opts.errorCorrection)) {
    throw new QrEncodeError(
      'INVALID_OPTIONS',
      `Unknown error correction level "${String(opts.errorCorrection)}".`,
    );
  }
  if (opts.version !== 'auto') {
    if (!Number.isInteger(opts.version) || opts.version < MIN_VERSION || opts.version > MAX_VERSION) {
      throw new QrEncodeError('INVALID_OPTIONS', `QR version must be "auto" or an integer from 1 to 40.`);
    }
  }
  if (opts.mask !== 'auto' && (!Number.isInteger(opts.mask) || opts.mask < 0 || opts.mask > 7)) {
    throw new QrEncodeError('INVALID_OPTIONS', `Mask must be "auto" or an integer from 0 to 7.`);
  }
  if (
    !Number.isInteger(opts.marginModules) ||
    opts.marginModules < 0 ||
    opts.marginModules > MAX_MARGIN_MODULES
  ) {
    throw new QrEncodeError(
      'INVALID_OPTIONS',
      `Quiet zone must be an integer from 0 to ${MAX_MARGIN_MODULES} modules.`,
    );
  }
  return opts;
}

/**
 * Encodes `payload` into a QR matrix. Text is segmented automatically
 * (numeric / alphanumeric / byte with UTF-8). Throws QrEncodeError when the
 * payload cannot fit into the requested version range.
 */
export function encodeQr(payload: string, options?: Partial<QrOptions>): EncodeResult {
  const opts = normalizeQrOptions(options);
  if (payload.length === 0) {
    throw new QrEncodeError(
      'EMPTY_PAYLOAD',
      'The payload is empty. Enter some content to generate a QR code.',
    );
  }

  const byteLength = utf8ByteLength(payload);
  const maxBytesAtLevel = byteModeCapacity(MAX_VERSION, opts.errorCorrection);
  const segments = QrSegment.makeSegments(payload);
  const minVersion = opts.version === 'auto' ? MIN_VERSION : opts.version;
  const maxVersion = opts.version === 'auto' ? MAX_VERSION : opts.version;
  const mask = opts.mask === 'auto' ? -1 : opts.mask;

  let qr: QrCode;
  try {
    qr = QrCode.encodeSegments(
      segments,
      ECC_BY_LEVEL[opts.errorCorrection],
      minVersion,
      maxVersion,
      mask,
      opts.boostErrorCorrection,
    );
  } catch (error) {
    if (error instanceof RangeError && /too long/i.test(error.message)) {
      const detail =
        opts.version === 'auto'
          ? `The content is ${byteLength} bytes but level ${opts.errorCorrection} holds at most ${maxBytesAtLevel} bytes. Shorten the content or lower the error correction level.`
          : `The content does not fit in QR version ${opts.version} at level ${opts.errorCorrection} (${byteModeCapacity(opts.version, opts.errorCorrection)} bytes max). Choose a larger version or "auto".`;
      throw new QrEncodeError('CAPACITY_EXCEEDED', detail, {
        byteLength,
        maxBytes:
          opts.version === 'auto' ? maxBytesAtLevel : byteModeCapacity(opts.version, opts.errorCorrection),
        level: opts.errorCorrection,
      });
    }
    throw error;
  }

  const size = qr.size;
  const modules = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.getModule(x, y)) modules[y * size + x] = 1;
    }
  }

  const level = LEVEL_BY_ORDINAL[qr.errorCorrectionLevel.ordinal] ?? opts.errorCorrection;
  const dataBits = QrSegment.getTotalBits(segments, qr.version);
  const capBits = capacityBits(qr.version, level);

  return {
    matrix: { size, modules, version: qr.version, errorCorrection: level, mask: qr.mask },
    version: qr.version,
    requestedErrorCorrection: opts.errorCorrection,
    errorCorrection: level,
    mask: qr.mask,
    byteLength,
    charLength: codePointLength(payload),
    dataBits,
    capacityBits: capBits,
    remainingBits: capBits - dataBits,
    usagePercent: Math.round((dataBits / capBits) * 1000) / 10,
    maxBytesAtLevel,
    segments: segments.map((seg) => ({
      mode: modeName(seg),
      numChars: seg.numChars,
      bits: seg.getData().length,
    })),
    marginModules: opts.marginModules,
  };
}

/** Returns true if (x, y) belongs to one of the three finder patterns (7x7 each). */
export function isFinderModule(size: number, x: number, y: number): boolean {
  if (x < 7 && y < 7) return true;
  if (x >= size - 7 && y < 7) return true;
  if (x < 7 && y >= size - 7) return true;
  return false;
}

/** Top-left corner of each finder pattern in module coordinates. */
export function finderOrigins(size: number): Array<{ x: number; y: number }> {
  return [
    { x: 0, y: 0 },
    { x: size - 7, y: 0 },
    { x: 0, y: size - 7 },
  ];
}

export function isDark(matrix: QrMatrix, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= matrix.size || y >= matrix.size) return false;
  return matrix.modules[y * matrix.size + x] === 1;
}

/** Simple capacity estimate that does not require a full encode. */
export function estimateCapacity(payload: string, level: ErrorCorrectionLevel) {
  const bytes = utf8ByteLength(payload);
  const max = byteModeCapacity(MAX_VERSION, level);
  return { bytes, max, remaining: max - bytes, fits: bytes <= max };
}
