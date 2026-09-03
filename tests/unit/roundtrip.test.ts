import { describe, expect, it } from 'vitest';

import { buildPayload } from '@shared/content/builders';
import { CONTENT_REGISTRY, exampleContent } from '@shared/content/registry';
import { CONTENT_TYPES } from '@shared/content/schemas';
import { prepare } from '@shared/pipeline';
import { encodeQr, ERROR_CORRECTION_LEVELS } from '@shared/qr/encode';
import { renderSvg } from '@shared/render/svg';
import { base64Encode } from '@shared/security/data-url';
import { BUILT_IN_PRESETS } from '@shared/style/presets';
import { DEFAULT_STYLE, resolveStyle } from '@shared/style/schema';

import { decodeSvg, rasterize } from '../helpers/decode';

const TEST_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#2563EB"/><circle cx="50" cy="50" r="25" fill="#fff"/></svg>`;
const TEST_LOGO_DATA_URL = `data:image/svg+xml;base64,${base64Encode(new TextEncoder().encode(TEST_LOGO_SVG))}`;

async function roundTrip(
  payload: string,
  styleOverride: unknown = {},
  ec: 'L' | 'M' | 'Q' | 'H' = 'M',
  width = 600,
) {
  const encoded = encodeQr(payload, { errorCorrection: ec, boostErrorCorrection: false });
  const style = resolveStyle(styleOverride);
  const render = renderSvg({ matrix: encoded.matrix, marginModules: 4, style, size: width });
  const decoded = await decodeSvg(render.svg, width);
  return { decoded, encoded, render };
}

describe('round trip: encode → render → independent decode', () => {
  it('decodes plain ASCII with default style', async () => {
    const { decoded } = await roundTrip('https://example.com/edgeqr');
    expect(decoded).toBe('https://example.com/edgeqr');
  });

  it.each(ERROR_CORRECTION_LEVELS)('decodes at error correction level %s', async (level) => {
    const payload = `Level ${level} – EdgeQR Studio round trip 0123456789`;
    const { decoded, encoded } = await roundTrip(payload, {}, level);
    expect(encoded.errorCorrection).toBe(level);
    expect(decoded).toBe(payload);
  });

  it('preserves Unicode and emoji through UTF-8 byte mode', async () => {
    const payload = 'Grüße aus Zürich – こんにちは – 🚀✨';
    const { decoded } = await roundTrip(payload, {}, 'M');
    expect(decoded).toBe(payload);
  });

  it('decodes numeric and alphanumeric mode payloads', async () => {
    expect((await roundTrip('01234567890123456789')).decoded).toBe('01234567890123456789');
    expect((await roundTrip('HELLO WORLD $%*+-./:')).decoded).toBe('HELLO WORLD $%*+-./:');
  });

  it.each(BUILT_IN_PRESETS.map((p) => [p.name, p] as const))(
    'decodes with preset "%s"',
    async (_name, preset) => {
      const payload = 'https://edgeqr.example/presets';
      const { decoded } = await roundTrip(payload, preset.style, 'Q');
      expect(decoded).toBe(payload);
    },
  );

  it('decodes every module shape and finder combination', async () => {
    const shapes = [
      'square',
      'rounded',
      'dots',
      'extra-rounded',
      'diamond',
      'classy',
      'classy-rounded',
      'custom',
    ] as const;
    const frames = ['square', 'rounded', 'extra-rounded', 'circle', 'dots'] as const;
    const centers = ['square', 'rounded', 'circle', 'diamond'] as const;
    for (const [i, shape] of shapes.entries()) {
      const frame = frames[i % frames.length];
      const center = centers[i % centers.length];
      const { decoded } = await roundTrip(
        `shape:${shape}`,
        {
          moduleShape: shape,
          finderFrameShape: frame,
          finderCenterShape: center,
          customModule: { cornerRadius: 0.4, connected: true },
        },
        'Q',
      );
      expect(decoded, `${shape}/${frame}/${center}`).toBe(`shape:${shape}`);
    }
  });

  it('decodes with a safe-size logo at level H', async () => {
    const payload = 'https://example.com/with-logo';
    const { decoded, render } = await roundTrip(
      payload,
      {
        ...DEFAULT_STYLE,
        logo: { ...DEFAULT_STYLE.logo, enabled: true, dataUrl: TEST_LOGO_DATA_URL, scale: 0.22 },
      },
      'H',
    );
    expect(render.logoRect).not.toBeNull();
    expect(render.logoCoverage).toBeLessThan(0.3);
    expect(decoded).toBe(payload);
  });

  it('decodes gradients, borders, frames and captions together', async () => {
    const payload = 'WIFI:T:WPA;S:Cafe;P:latte;;';
    const { decoded } = await roundTrip(
      payload,
      {
        moduleShape: 'extra-rounded',
        gradient: {
          enabled: true,
          type: 'linear',
          angle: 30,
          stops: [
            { offset: 0, color: '#1E3A8A' },
            { offset: 1, color: '#065F46' },
          ],
          target: 'all',
        },
        layout: {
          padding: 20,
          cornerRadius: 30,
          border: { enabled: true, width: 12, color: '#111827', radius: 30 },
          frame: { enabled: true, color: '#DBEAFE', radius: 40, thickness: 50 },
          caption: {
            enabled: true,
            text: 'Scan me',
            fontSize: 64,
            fontWeight: 700,
            align: 'center',
            letterSpacing: 1,
            color: '#111827',
            position: 'bottom',
            gap: 24,
          },
        },
      },
      'M',
      700,
    );
    expect(decoded).toBe(payload);
  });

  it('decodes a transparent background when placed on white', async () => {
    const payload = 'transparent-test';
    const { decoded } = await roundTrip(payload, { transparentBackground: true }, 'M');
    expect(decoded).toBe(payload);
  });

  it('decodes forced version and manual mask', async () => {
    const encoded = encodeQr('mask test', {
      errorCorrection: 'L',
      version: 5,
      mask: 3,
      boostErrorCorrection: false,
    });
    expect(encoded.version).toBe(5);
    expect(encoded.mask).toBe(3);
    const render = renderSvg({ matrix: encoded.matrix, marginModules: 4, style: DEFAULT_STYLE, size: 500 });
    expect(await decodeSvg(render.svg, 500)).toBe('mask test');
  });

  it('is deterministic for identical input', () => {
    const a = renderSvg({
      matrix: encodeQr('same', {}).matrix,
      marginModules: 4,
      style: DEFAULT_STYLE,
      size: 300,
    });
    const b = renderSvg({
      matrix: encodeQr('same', {}).matrix,
      marginModules: 4,
      style: DEFAULT_STYLE,
      size: 300,
    });
    expect(a.svg).toBe(b.svg);
  });
});

describe('round trip: every content type example', () => {
  it.each(CONTENT_TYPES)('encodes and decodes the %s example', async (type) => {
    const content = exampleContent(type);
    const built = buildPayload(content);
    expect(built.ok, JSON.stringify(built)).toBe(true);
    if (!built.ok) return;
    const result = prepare({ content, qr: { errorCorrection: 'M' }, output: { format: 'svg', size: 700 } });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const decoded = await decodeSvg(result.render.svg, 700);
    expect(decoded).toBe(built.payload);
    expect(CONTENT_REGISTRY[type].label.length).toBeGreaterThan(0);
  });
});

describe('rasterized output', () => {
  it('produces a PNG with the requested width', async () => {
    const result = prepare({
      content: { type: 'text', value: { text: 'png' } },
      output: { format: 'png', size: 256 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raster = await rasterize(result.render.svg, 256);
    expect(raster.width).toBe(256);
    expect(raster.png.subarray(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });
});
