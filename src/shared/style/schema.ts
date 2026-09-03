/**
 * Styling, QR and output option schemas shared by the editor and the HTTP API.
 *
 * Layout dimensions use "design units": the QR symbol including its quiet zone
 * always spans 1000 x 1000 units, so a border width of 20 is 2 % of the QR
 * width regardless of the export resolution.
 */
import { z } from 'zod';

import { ERROR_CORRECTION_LEVELS, MAX_MARGIN_MODULES } from '../qr/encode';
import { HEX_COLOR_REGEX, normalizeHex } from './color';

export const HexColorSchema = z
  .string()
  .regex(HEX_COLOR_REGEX, 'Use a hex colour such as #1D4ED8.')
  .transform((v) => normalizeHex(v));

export const MODULE_SHAPES = [
  'square',
  'rounded',
  'dots',
  'extra-rounded',
  'diamond',
  'classy',
  'classy-rounded',
  'custom',
] as const;
export const FINDER_FRAME_SHAPES = ['square', 'rounded', 'extra-rounded', 'circle', 'dots'] as const;
export const FINDER_CENTER_SHAPES = ['square', 'rounded', 'circle', 'diamond'] as const;

export const ModuleShapeSchema = z.enum(MODULE_SHAPES);
export const FinderFrameShapeSchema = z.enum(FINDER_FRAME_SHAPES);
export const FinderCenterShapeSchema = z.enum(FINDER_CENTER_SHAPES);

export type ModuleShape = z.infer<typeof ModuleShapeSchema>;
export type FinderFrameShape = z.infer<typeof FinderFrameShapeSchema>;
export type FinderCenterShape = z.infer<typeof FinderCenterShapeSchema>;

export const GradientStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color: HexColorSchema,
});

export const GradientSchema = z.object({
  enabled: z.boolean().default(false),
  type: z.enum(['linear', 'radial']).default('linear'),
  /** Degrees, 0 = left→right, 90 = top→bottom. */
  angle: z.number().min(0).max(360).default(45),
  stops: z
    .array(GradientStopSchema)
    .min(2, 'A gradient needs at least two colour stops.')
    .max(6)
    .default([
      { offset: 0, color: '#2563EB' },
      { offset: 1, color: '#14B8A6' },
    ]),
  /** Apply to data modules only or to finder patterns as well. */
  target: z.enum(['modules', 'all']).default('all'),
});

export const CustomModuleSchema = z.object({
  /** Corner radius as a fraction of the module size (0 = square, 0.5 = circle). */
  cornerRadius: z.number().min(0).max(0.5).default(0.2),
  /** Merge adjacent modules into connected blobs. */
  connected: z.boolean().default(false),
});

export const MIN_MODULE_SCALE = 0.7;

export const FinderColorsSchema = z.object({
  enabled: z.boolean().default(false),
  frame: HexColorSchema.default('#0F172A'),
  center: HexColorSchema.default('#0F172A'),
});

export const LogoSchema = z.object({
  enabled: z.boolean().default(false),
  /** base64 data URL; PNG, JPEG, WebP or sanitized SVG. */
  dataUrl: z
    .string()
    .max(1_400_000, 'Logo must be smaller than 1 MB.')
    .regex(
      /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/,
      'Logo must be a base64 image data URL.',
    )
    .optional(),
  /** Logo width as a fraction of the QR matrix width (quiet zone excluded). */
  scale: z.number().min(0.05).max(0.4).default(0.2),
  /** Padding around the logo in modules. */
  padding: z.number().min(0).max(4).default(0.5),
  /** Corner radius of the logo clip as a fraction of the logo size. */
  cornerRadius: z.number().min(0).max(0.5).default(0.1),
  backplate: z
    .object({
      enabled: z.boolean().default(true),
      color: HexColorSchema.default('#FFFFFF'),
      cornerRadius: z.number().min(0).max(0.5).default(0.15),
    })
    .default({ enabled: true, color: '#FFFFFF', cornerRadius: 0.15 }),
  /** Remove modules underneath the logo area (recommended with error correction H). */
  clearModules: z.boolean().default(true),
});

export const CaptionSchema = z.object({
  enabled: z.boolean().default(false),
  text: z.string().max(80).default('Scan me'),
  /** Design units. */
  fontSize: z.number().min(20).max(200).default(64),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).default(600),
  align: z.enum(['left', 'center', 'right']).default('center'),
  /** Design units. */
  letterSpacing: z.number().min(-5).max(30).default(0),
  color: HexColorSchema.default('#0F172A'),
  position: z.enum(['top', 'bottom']).default('bottom'),
  /** Gap between the QR and the caption in design units. */
  gap: z.number().min(0).max(150).default(24),
});

export const BorderSchema = z.object({
  enabled: z.boolean().default(false),
  /** Stroke width in design units. */
  width: z.number().min(1).max(80).default(16),
  color: HexColorSchema.default('#0F172A'),
  /** Corner radius in design units. */
  radius: z.number().min(0).max(300).default(48),
});

export const FrameSchema = z.object({
  enabled: z.boolean().default(false),
  color: HexColorSchema.default('#2563EB'),
  /** Corner radius in design units. */
  radius: z.number().min(0).max(300).default(64),
  /** Thickness of the frame band around the QR in design units. */
  thickness: z.number().min(10).max(200).default(60),
});

export const LayoutSchema = z.object({
  /** Safe padding around the complete design in design units. */
  padding: z.number().min(0).max(300).default(0),
  /** Corner radius of the background rectangle in design units. */
  cornerRadius: z.number().min(0).max(300).default(0),
  border: BorderSchema.default(BorderSchema.parse({})),
  frame: FrameSchema.default(FrameSchema.parse({})),
  caption: CaptionSchema.default(CaptionSchema.parse({})),
});

export const StyleSchema = z.object({
  moduleShape: ModuleShapeSchema.default('square'),
  /** Size of each drawn module relative to its cell (1 = modules touch). */
  moduleScale: z.number().min(MIN_MODULE_SCALE).max(1).default(1),
  customModule: CustomModuleSchema.default(CustomModuleSchema.parse({})),
  finderFrameShape: FinderFrameShapeSchema.default('square'),
  finderCenterShape: FinderCenterShapeSchema.default('square'),
  foreground: HexColorSchema.default('#0F172A'),
  background: HexColorSchema.default('#FFFFFF'),
  transparentBackground: z.boolean().default(false),
  finderColors: FinderColorsSchema.default(FinderColorsSchema.parse({})),
  gradient: GradientSchema.default(GradientSchema.parse({})),
  logo: LogoSchema.default(LogoSchema.parse({})),
  layout: LayoutSchema.default(LayoutSchema.parse({})),
});

export type Style = z.infer<typeof StyleSchema>;
export type StyleInput = z.input<typeof StyleSchema>;
export type Gradient = z.infer<typeof GradientSchema>;
export type Logo = z.infer<typeof LogoSchema>;
export type Caption = z.infer<typeof CaptionSchema>;
export type Layout = z.infer<typeof LayoutSchema>;

export const QrOptionsSchema = z.object({
  errorCorrection: z.enum(ERROR_CORRECTION_LEVELS).default('M'),
  version: z.union([z.literal('auto'), z.number().int().min(1).max(40)]).default('auto'),
  mask: z.union([z.literal('auto'), z.literal([0, 1, 2, 3, 4, 5, 6, 7])]).default('auto'),
  boostErrorCorrection: z.boolean().default(true),
  marginModules: z.number().int().min(0).max(MAX_MARGIN_MODULES).default(4),
});
export type QrOptionsInput = z.input<typeof QrOptionsSchema>;

export const OUTPUT_FORMATS = ['svg', 'png', 'jpeg'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export const MIN_OUTPUT_SIZE = 128;
export const MAX_OUTPUT_SIZE = 4096;
export const OUTPUT_SIZE_PRESETS = [256, 512, 1024, 2048, 4096] as const;

export const OutputSchema = z.object({
  format: z.enum(OUTPUT_FORMATS).default('png'),
  /** Width of the exported image in pixels (height follows the design aspect ratio). */
  size: z.number().int().min(MIN_OUTPUT_SIZE).max(MAX_OUTPUT_SIZE).default(1024),
  jpegQuality: z.number().int().min(1).max(100).default(90),
  /** JPEG has no alpha channel: transparent designs are flattened onto this colour. */
  jpegBackground: HexColorSchema.default('#FFFFFF'),
  filename: z.string().max(120).optional(),
});
export type Output = z.infer<typeof OutputSchema>;
export type OutputInput = z.input<typeof OutputSchema>;

export const DEFAULT_STYLE: Style = StyleSchema.parse({});
export const DEFAULT_OUTPUT: Output = OutputSchema.parse({});

export const MIME_TYPES: Record<OutputFormat, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpeg: 'image/jpeg',
};

export const FILE_EXTENSIONS: Record<OutputFormat, string> = {
  svg: 'svg',
  png: 'png',
  jpeg: 'jpg',
};

/** Deep-merges a partial style onto defaults and validates the result. */
export function resolveStyle(partial: unknown): Style {
  return StyleSchema.parse(deepMerge(DEFAULT_STYLE, partial));
}

export function deepMerge(base: Record<string, unknown>, patch: unknown): Record<string, unknown> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return structuredClone(base);
  const out: Record<string, unknown> = structuredClone(base);
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const existing = out[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      out[key] = deepMerge(existing as Record<string, unknown>, value);
    } else if (value !== undefined) {
      out[key] = structuredClone(value);
    }
  }
  return out;
}
