/**
 * Built-in style presets. Each preset is a partial style merged over the
 * defaults, so presets stay small and forward compatible.
 */
import { z } from 'zod';

import { resolveStyle, StyleSchema, type Style } from './schema';

export const PresetSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  description: z.string().max(200).default(''),
  builtIn: z.boolean().default(false),
  style: StyleSchema.partial().passthrough(),
});
export type Preset = z.infer<typeof PresetSchema>;

export const PresetFileSchema = z.object({
  app: z.literal('flareqr-studio').optional(),
  version: z.literal(1),
  presets: z.array(PresetSchema).max(200),
});
export type PresetFile = z.infer<typeof PresetFileSchema>;

const preset = (p: Omit<Preset, 'builtIn' | 'description'> & { description?: string }): Preset => ({
  builtIn: true,
  description: p.description ?? '',
  ...p,
});

export const BUILT_IN_PRESETS: Preset[] = [
  preset({
    id: 'classic',
    name: 'Classic black & white',
    description: 'Maximum compatibility: square modules, pure black on white.',
    style: {
      moduleShape: 'square',
      finderFrameShape: 'square',
      finderCenterShape: 'square',
      foreground: '#000000',
      background: '#FFFFFF',
      transparentBackground: false,
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
      finderColors: { enabled: false, frame: '#000000', center: '#000000' },
    },
  }),
  preset({
    id: 'rounded-blue',
    name: 'Rounded blue',
    description: 'Soft rounded modules in a deep blue.',
    style: {
      moduleShape: 'rounded',
      finderFrameShape: 'rounded',
      finderCenterShape: 'rounded',
      foreground: '#1D4ED8',
      background: '#FFFFFF',
      gradient: {
        enabled: false,
        type: 'linear',
        angle: 45,
        stops: [
          { offset: 0, color: '#1D4ED8' },
          { offset: 1, color: '#1D4ED8' },
        ],
        target: 'all',
      },
      finderColors: { enabled: false, frame: '#1D4ED8', center: '#1D4ED8' },
    },
  }),
  preset({
    id: 'electric',
    name: 'Electric blue & teal',
    description: 'The FlareQR signature gradient.',
    style: {
      moduleShape: 'extra-rounded',
      finderFrameShape: 'extra-rounded',
      finderCenterShape: 'rounded',
      foreground: '#1E3A8A',
      background: '#FFFFFF',
      gradient: {
        enabled: true,
        type: 'linear',
        angle: 45,
        stops: [
          { offset: 0, color: '#2563EB' },
          { offset: 1, color: '#0D9488' },
        ],
        target: 'all',
      },
      finderColors: { enabled: false, frame: '#1E3A8A', center: '#1E3A8A' },
    },
  }),
  preset({
    id: 'dark-neon',
    name: 'Dark neon',
    description: 'Light modules on a dark background – add light for reliable scans.',
    style: {
      moduleShape: 'dots',
      finderFrameShape: 'circle',
      finderCenterShape: 'circle',
      foreground: '#22D3EE',
      background: '#0B1220',
      gradient: {
        enabled: true,
        type: 'radial',
        angle: 0,
        stops: [
          { offset: 0, color: '#A5F3FC' },
          { offset: 1, color: '#22D3EE' },
        ],
        target: 'all',
      },
      finderColors: { enabled: true, frame: '#F472B6', center: '#F9A8D4' },
    },
  }),
  preset({
    id: 'minimal-mono',
    name: 'Minimal monochrome',
    description: 'Charcoal on off-white with classy modules.',
    style: {
      moduleShape: 'classy-rounded',
      finderFrameShape: 'rounded',
      finderCenterShape: 'rounded',
      foreground: '#1F2937',
      background: '#F9FAFB',
      gradient: {
        enabled: false,
        type: 'linear',
        angle: 45,
        stops: [
          { offset: 0, color: '#1F2937' },
          { offset: 1, color: '#1F2937' },
        ],
        target: 'all',
      },
      finderColors: { enabled: false, frame: '#1F2937', center: '#1F2937' },
    },
  }),
  preset({
    id: 'high-contrast',
    name: 'High contrast',
    description: 'Thick border and pure black for difficult lighting.',
    style: {
      moduleShape: 'square',
      finderFrameShape: 'square',
      finderCenterShape: 'square',
      foreground: '#000000',
      background: '#FFFFFF',
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
      finderColors: { enabled: false, frame: '#000000', center: '#000000' },
      layout: {
        padding: 24,
        cornerRadius: 0,
        border: { enabled: true, width: 24, color: '#000000', radius: 0 },
        frame: { enabled: false, color: '#000000', radius: 0, thickness: 60 },
        caption: {
          enabled: false,
          text: 'Scan me',
          fontSize: 64,
          fontWeight: 700,
          align: 'center',
          letterSpacing: 0,
          color: '#000000',
          position: 'bottom',
          gap: 24,
        },
      },
    },
  }),
  preset({
    id: 'dots',
    name: 'Dots',
    description: 'Circular modules with circular finder patterns.',
    style: {
      moduleShape: 'dots',
      finderFrameShape: 'circle',
      finderCenterShape: 'circle',
      foreground: '#111827',
      background: '#FFFFFF',
      gradient: {
        enabled: false,
        type: 'linear',
        angle: 45,
        stops: [
          { offset: 0, color: '#111827' },
          { offset: 1, color: '#111827' },
        ],
        target: 'all',
      },
      finderColors: { enabled: false, frame: '#111827', center: '#111827' },
    },
  }),
  preset({
    id: 'logo-friendly',
    name: 'Logo friendly',
    description: 'Rounded modules and a white backplate that leaves room for a centred logo.',
    style: {
      moduleShape: 'rounded',
      finderFrameShape: 'extra-rounded',
      finderCenterShape: 'rounded',
      foreground: '#0F172A',
      background: '#FFFFFF',
      gradient: {
        enabled: false,
        type: 'linear',
        angle: 45,
        stops: [
          { offset: 0, color: '#0F172A' },
          { offset: 1, color: '#0F172A' },
        ],
        target: 'all',
      },
      finderColors: { enabled: false, frame: '#0F172A', center: '#0F172A' },
      logo: {
        enabled: true,
        scale: 0.22,
        padding: 0.75,
        cornerRadius: 0.15,
        backplate: { enabled: true, color: '#FFFFFF', cornerRadius: 0.2 },
        clearModules: true,
      },
    },
  }),
  preset({
    id: 'print',
    name: 'Print friendly',
    description: 'Square modules, generous quiet zone spacing and a “Scan me” caption.',
    style: {
      moduleShape: 'square',
      finderFrameShape: 'square',
      finderCenterShape: 'square',
      foreground: '#000000',
      background: '#FFFFFF',
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
      finderColors: { enabled: false, frame: '#000000', center: '#000000' },
      layout: {
        padding: 32,
        cornerRadius: 24,
        border: { enabled: true, width: 8, color: '#000000', radius: 24 },
        frame: { enabled: false, color: '#000000', radius: 24, thickness: 60 },
        caption: {
          enabled: true,
          text: 'Scan me',
          fontSize: 72,
          fontWeight: 700,
          align: 'center',
          letterSpacing: 2,
          color: '#000000',
          position: 'bottom',
          gap: 24,
        },
      },
    },
  }),
];

export function getBuiltInPreset(id: string): Preset | undefined {
  return BUILT_IN_PRESETS.find((p) => p.id === id);
}

/** Applies a preset over an existing style. Logo image data is preserved when the preset does not define one. */
export function applyPreset(current: Style, preset: Preset): Style {
  const next = resolveStyle(preset.style);
  if (!preset.style.logo && current.logo.dataUrl) {
    next.logo = { ...next.logo, dataUrl: current.logo.dataUrl, enabled: current.logo.enabled };
  } else if (preset.style.logo && current.logo.dataUrl) {
    next.logo = { ...next.logo, dataUrl: current.logo.dataUrl };
  }
  return next;
}

/** Strips embedded logo images so presets stay small when exported. */
export function styleToPresetStyle(style: Style): Preset['style'] {
  const copy = structuredClone(style) as Style & { logo: Partial<Style['logo']> };
  delete copy.logo.dataUrl;
  return copy;
}
