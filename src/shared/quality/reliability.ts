/**
 * Scan-reliability evaluation. Produces human-readable warnings and an overall
 * status from the encoding result and the visual style.
 */
import type { EncodeResult, ErrorCorrectionLevel } from '../qr/encode';
import { QR_DESIGN_SIZE } from '../render/svg';
import { contrastRatio, mixHex, parseHex, relativeLuminance } from '../style/color';
import type { Style } from '../style/schema';

export type Severity = 'info' | 'warning' | 'critical';
export type ReliabilityStatus = 'excellent' | 'good' | 'risky' | 'invalid';

export interface ReliabilityWarning {
  id: string;
  severity: Severity;
  message: string;
  hint?: string;
}

export interface ReliabilityFacts {
  version: number | null;
  matrixSize: number | null;
  errorCorrection: ErrorCorrectionLevel | null;
  byteLength: number;
  charLength: number;
  capacityUsedPercent: number | null;
  remainingBytes: number | null;
  quietZone: number;
  /** Lowest contrast ratio between any module colour and the background. */
  contrast: number | null;
  logoCoveragePercent: number;
  modulePixels: number | null;
}

export interface ReliabilityReport {
  status: ReliabilityStatus;
  score: number;
  warnings: ReliabilityWarning[];
  facts: ReliabilityFacts;
}

export interface ReliabilityInput {
  encode: EncodeResult | null;
  encodeError?: string;
  style: Style;
  /** Export width in pixels. */
  outputSize: number;
  /** Design-unit width of the whole document (from the renderer). */
  designWidth: number;
  marginModules: number;
  logoCoverage: number;
  logoClamped: boolean;
  payloadBytes: number;
  payloadChars: number;
}

/** Fraction of codewords each level can recover. */
export const EC_RECOVERY: Record<ErrorCorrectionLevel, number> = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };

function moduleColors(style: Style): string[] {
  const colors = new Set<string>();
  if (style.gradient.enabled) {
    for (const stop of style.gradient.stops) colors.add(stop.color);
    // Also sample midpoints so two-stop gradients report their weakest area.
    const sorted = [...style.gradient.stops].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      if (a && b) colors.add(mixHex(a.color, b.color, 0.5));
    }
    if (style.gradient.target === 'modules') colors.add(style.foreground);
  } else {
    colors.add(style.foreground);
  }
  if (style.finderColors.enabled) {
    colors.add(style.finderColors.frame);
    colors.add(style.finderColors.center);
  }
  return [...colors];
}

export function evaluateReliability(input: ReliabilityInput): ReliabilityReport {
  const { style, encode } = input;
  const warnings: ReliabilityWarning[] = [];
  const add = (id: string, severity: Severity, message: string, hint?: string) =>
    warnings.push({ id, severity, message, hint });

  const background = style.transparentBackground ? null : style.background;
  const colors = moduleColors(style);
  let contrast: number | null = null;
  if (background) {
    contrast = Math.min(...colors.map((c) => contrastRatio(c, background)));
    if (contrast < 2.5) {
      add('contrast-critical', 'critical', `Contrast ratio is only ${contrast.toFixed(1)}:1.`, 'Use a much darker foreground on a light background.');
    } else if (contrast < 4) {
      add('contrast-low', 'warning', `Contrast ratio ${contrast.toFixed(1)}:1 is below the recommended 4:1.`, 'Darken the foreground or lighten the background.');
    }
    const bgLum = relativeLuminance(parseHex(background) ?? { r: 255, g: 255, b: 255, a: 1 });
    const fgLum = Math.max(...colors.map((c) => relativeLuminance(parseHex(c) ?? { r: 0, g: 0, b: 0, a: 1 })));
    if (fgLum > bgLum) {
      add('inverted', 'warning', 'Light modules on a dark background.', 'Some scanners only read dark-on-light codes. Consider swapping the colours.');
    }
  } else {
    add('transparent', 'warning', 'Transparent background: scannability depends on where the image is placed.', 'Place the code on a plain light surface, or disable transparency.');
  }

  if (style.gradient.enabled) {
    if (style.gradient.stops.length > 3) {
      add('gradient-complex', 'warning', 'Gradients with many colour stops lower contrast in places.', 'Keep gradients to two or three dark colours.');
    } else {
      add('gradient', 'info', 'Gradient enabled – every stop must remain dark against the background.');
    }
  }

  if (style.finderColors.enabled && background) {
    const finderContrast = Math.min(contrastRatio(style.finderColors.frame, background), contrastRatio(style.finderColors.center, background));
    if (finderContrast < 3) {
      add('finder-contrast', 'critical', 'Finder pattern colours are too light against the background.', 'Finder patterns must stay clearly darker than the background.');
    }
    const moduleColor = style.gradient.enabled ? (style.gradient.stops[0]?.color ?? style.foreground) : style.foreground;
    if (contrastRatio(style.finderColors.frame, moduleColor) > 3) {
      add('finder-differs', 'warning', 'Finder patterns differ strongly from the data modules.', 'Some decoders threshold on a single colour; keep finder colours similar in darkness.');
    }
  }

  if (style.moduleScale < 0.8) {
    add('module-scale', 'warning', `Modules are drawn at ${Math.round(style.moduleScale * 100)} % of their cell.`, 'Very small modules reduce the dark area a scanner can detect.');
  }
  if (style.moduleShape === 'diamond') {
    add('diamond', 'info', 'Diamond modules cover only half of each cell.', 'Keep the output large and the error correction high.');
  }
  if (style.moduleShape === 'dots' && style.moduleScale < 0.9) {
    add('dots-small', 'warning', 'Small dots are hard to read at print sizes.', 'Increase module scale or output size.');
  }

  const quiet = input.marginModules;
  if (quiet === 0) {
    add('quiet-zone-none', 'critical', 'No quiet zone.', 'Scanners need a blank margin of at least 4 modules.');
  } else if (quiet < 4) {
    add('quiet-zone', 'warning', `Quiet zone is ${quiet} module${quiet === 1 ? '' : 's'} (4 recommended).`);
  }

  let modulePixels: number | null = null;
  if (encode) {
    const totalModules = encode.matrix.size + 2 * quiet;
    const qrPixels = (input.outputSize * QR_DESIGN_SIZE) / input.designWidth;
    modulePixels = qrPixels / totalModules;
    if (modulePixels < 2) {
      add('size-critical', 'critical', `Each module is only ${modulePixels.toFixed(1)} px at this output size.`, 'Increase the export size or reduce the content.');
    } else if (modulePixels < 4) {
      add('size-small', 'warning', `Modules are ${modulePixels.toFixed(1)} px – small for reliable scanning.`, 'Export at a larger size (at least 4 px per module).');
    }
    if (qrPixels < input.outputSize * 0.6) {
      add('decor-heavy', 'info', 'Borders, frame and caption take more than 40 % of the image.', 'The QR itself is small; export at a larger size.');
    }

    const recovery = EC_RECOVERY[encode.errorCorrection];
    if (style.logo.enabled && style.logo.dataUrl) {
      const cover = input.logoCoverage;
      if (cover > recovery) {
        add('logo-too-large', 'critical', `The logo hides ${Math.round(cover * 100)} % of the modules, more than level ${encode.errorCorrection} can recover (${Math.round(recovery * 100)} %).`, 'Reduce the logo scale or raise error correction to H.');
      } else if (cover > recovery * 0.6) {
        add('logo-large', 'warning', `The logo hides ${Math.round(cover * 100)} % of the modules.`, 'Keep logos under ~60 % of the recoverable area.');
      }
      if (encode.errorCorrection !== 'H') {
        add('logo-ec', 'warning', `Error correction ${encode.errorCorrection} with a logo.`, 'Use level H whenever a logo covers modules.');
      }
      if (input.logoClamped) {
        add('logo-clamped', 'info', 'The logo was reduced so it does not cover the finder patterns.');
      }
      if (!style.logo.backplate.enabled && !style.logo.clearModules) {
        add('logo-overlay', 'warning', 'The logo is drawn over live modules without a backplate.', 'Enable the backplate or "clear modules" for a clean logo area.');
      }
    }

    if (encode.usagePercent > 95) {
      add('capacity-near', 'warning', `Payload uses ${encode.usagePercent} % of this version's capacity.`, 'Shorten the content or lower the error correction if you plan to add more.');
    } else if (encode.byteLength > encode.maxBytesAtLevel * 0.9) {
      add('capacity-limit', 'warning', 'The payload is close to the maximum QR capacity.', 'Consider a URL that redirects to the full content.');
    }
    if (encode.version > 25) {
      add('dense', 'info', `Version ${encode.version} is very dense (${encode.matrix.size}×${encode.matrix.size}).`, 'Print at a large size and use a shorter payload if possible.');
    }
  }

  if (style.layout.caption.enabled && style.layout.caption.fontSize > 150) {
    add('caption-large', 'info', 'A very large caption shrinks the QR area within the image.');
  }
  if (style.layout.border.enabled && style.layout.border.width > 60) {
    add('border-thick', 'info', 'A very thick border shrinks the QR area within the image.');
  }

  let score = 100;
  for (const w of warnings) {
    score -= w.severity === 'critical' ? 40 : w.severity === 'warning' ? 12 : 3;
  }
  score = Math.max(0, Math.min(100, score));

  let status: ReliabilityStatus;
  if (!encode) status = 'invalid';
  else if (warnings.some((w) => w.severity === 'critical')) status = 'risky';
  else if (score >= 90) status = 'excellent';
  else if (score >= 70) status = 'good';
  else status = 'risky';

  if (!encode && input.encodeError) {
    warnings.unshift({ id: 'encode-error', severity: 'critical', message: input.encodeError });
  }

  return {
    status,
    score,
    warnings,
    facts: {
      version: encode?.version ?? null,
      matrixSize: encode?.matrix.size ?? null,
      errorCorrection: encode?.errorCorrection ?? null,
      byteLength: input.payloadBytes,
      charLength: input.payloadChars,
      capacityUsedPercent: encode?.usagePercent ?? null,
      remainingBytes: encode ? Math.max(0, Math.floor(encode.remainingBits / 8)) : null,
      quietZone: quiet,
      contrast,
      logoCoveragePercent: Math.round(input.logoCoverage * 1000) / 10,
      modulePixels,
    },
  };
}

/** A high-contrast configuration that scans reliably everywhere. */
export function safeDefaultsPatch(): Partial<Style> {
  return {
    moduleShape: 'square',
    moduleScale: 1,
    finderFrameShape: 'square',
    finderCenterShape: 'square',
    foreground: '#000000',
    background: '#FFFFFF',
    transparentBackground: false,
    finderColors: { enabled: false, frame: '#000000', center: '#000000' },
    gradient: {
      enabled: false,
      type: 'linear',
      angle: 45,
      stops: [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#000000' },
      ],
      target: 'all',
    },
  };
}
