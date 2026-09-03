import { describe, expect, it } from 'vitest';

import { prepare } from '@shared/pipeline';
import {
  byteModeCapacity,
  encodeQr,
  estimateCapacity,
  QrEncodeError,
  utf8ByteLength,
} from '@shared/qr/encode';
import { contrastRatio, mixHex, normalizeHex, parseHex, readableTextColor, toHex } from '@shared/style/color';
import { base64Encode } from '@shared/security/data-url';

const warningsFor = (style: unknown, extra: Record<string, unknown> = {}) => {
  const result = prepare({
    content: { type: 'url', value: { url: 'https://example.com' } },
    style,
    ...extra,
  });
  if (!result.ok) throw new Error(result.message);
  return { ids: result.reliability.warnings.map((w) => w.id), report: result.reliability };
};

const LOGO = `data:image/svg+xml;base64,${base64Encode(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'))}`;

describe('QR encoding & capacity', () => {
  it('selects the smallest version and reports capacity', () => {
    const r = encodeQr('HELLO', { errorCorrection: 'L', boostErrorCorrection: false });
    expect(r.version).toBe(1);
    expect(r.matrix.size).toBe(21);
    expect(r.segments[0]?.mode).toBe('alphanumeric');
    expect(r.usagePercent).toBeGreaterThan(0);
    expect(r.remainingBits).toBe(r.capacityBits - r.dataBits);
  });
  it('boosts the error correction level when free', () => {
    const boosted = encodeQr('x', { errorCorrection: 'L', boostErrorCorrection: true });
    expect(boosted.errorCorrection).toBe('H');
    expect(boosted.requestedErrorCorrection).toBe('L');
    const fixed = encodeQr('x', { errorCorrection: 'L', boostErrorCorrection: false });
    expect(fixed.errorCorrection).toBe('L');
  });
  it('throws helpful capacity errors', () => {
    expect(() => encodeQr('x'.repeat(3000), { errorCorrection: 'L' })).toThrow(QrEncodeError);
    try {
      encodeQr('x'.repeat(200), { errorCorrection: 'H', version: 3 });
    } catch (error) {
      expect(error).toBeInstanceOf(QrEncodeError);
      expect((error as QrEncodeError).code).toBe('CAPACITY_EXCEEDED');
      expect((error as QrEncodeError).message).toMatch(/version 3/);
    }
    expect(() => encodeQr('')).toThrow(/empty/i);
    expect(() => encodeQr('x', { version: 41 })).toThrow(/1 to 40/);
    expect(() => encodeQr('x', { marginModules: 99 })).toThrow(/Quiet zone/);
  });
  it('knows the standard byte-mode capacities', () => {
    expect(byteModeCapacity(40, 'L')).toBe(2953);
    expect(byteModeCapacity(40, 'H')).toBe(1273);
    expect(byteModeCapacity(1, 'L')).toBe(17);
    expect(utf8ByteLength('é🚀')).toBe(6);
    expect(estimateCapacity('abc', 'M')).toEqual({ bytes: 3, max: 2331, remaining: 2328, fits: true });
  });
  it('honours a forced version', () => {
    const r = encodeQr('abc', { version: 10, errorCorrection: 'M' });
    expect(r.version).toBe(10);
    expect(r.matrix.size).toBe(57);
  });
});

describe('colours', () => {
  it('parses and normalizes hex and rgb()', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(toHex('rgb(255, 0, 128)')).toBe('#FF0080');
    expect(toHex('rgba(0 0 0 / 0.5)')).toBe('#00000080');
    expect(toHex('blue')).toBeNull();
    expect(parseHex('#zzz')).toBeNull();
  });
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
    expect(readableTextColor('#000000')).toBe('#FFFFFF');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});

describe('reliability warnings', () => {
  it('is excellent for the defaults', () => {
    const { ids, report } = warningsFor({});
    expect(ids).toEqual([]);
    expect(report.status).toBe('excellent');
    expect(report.facts.contrast).toBeGreaterThan(15);
  });
  it('flags low contrast and inverted colours', () => {
    expect(warningsFor({ foreground: '#BBBBBB' }).ids).toContain('contrast-critical');
    expect(warningsFor({ foreground: '#888888' }).ids).toContain('contrast-low');
    expect(warningsFor({ foreground: '#888888' }).report.status).toBe('good');
    const inverted = warningsFor({ foreground: '#FFFFFF', background: '#000000' });
    expect(inverted.ids).toContain('inverted');
  });
  it('flags transparent backgrounds, small quiet zones and small output', () => {
    expect(warningsFor({ transparentBackground: true }).ids).toContain('transparent');
    expect(warningsFor({}, { qr: { marginModules: 1 } }).ids).toContain('quiet-zone');
    expect(warningsFor({}, { qr: { marginModules: 0 } }).report.status).toBe('risky');
    const small = warningsFor(
      {},
      {
        qr: { errorCorrection: 'H' },
        content: { type: 'text', value: { text: 'x'.repeat(600) } },
        output: { format: 'png', size: 128 },
      },
    );
    expect(small.ids.some((id) => id.startsWith('size-'))).toBe(true);
  });
  it('flags logo size and low error correction with a logo', () => {
    const big = warningsFor(
      { logo: { enabled: true, dataUrl: LOGO, scale: 0.4, padding: 1 } },
      { qr: { errorCorrection: 'L', boostErrorCorrection: false } },
    );
    expect(big.ids).toContain('logo-too-large');
    expect(big.ids).toContain('logo-ec');
    expect(big.report.status).toBe('risky');
    const fine = warningsFor(
      { logo: { enabled: true, dataUrl: LOGO, scale: 0.15, padding: 0.5 } },
      { qr: { errorCorrection: 'H' } },
    );
    expect(fine.ids).not.toContain('logo-too-large');
    expect(fine.report.facts.logoCoveragePercent).toBeGreaterThan(0);
  });
  it('never lets the logo cover finder patterns', () => {
    const result = prepare({
      content: { type: 'text', value: { text: 'a' } },
      qr: { errorCorrection: 'H' },
      style: { logo: { enabled: true, dataUrl: LOGO, scale: 0.4, padding: 0 } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const n = result.encode.matrix.size;
    expect(result.render.logoClamped).toBe(true);
    // Logo box must stay inside the finder-free centre (finder + separator = 8 modules on each side).
    const box = Math.sqrt(result.render.logoCoverage) * n;
    expect((n - box) / 2).toBeGreaterThanOrEqual(8);
  });
  it('flags complex gradients, finder colour issues and module scale', () => {
    const gradient = warningsFor({
      gradient: {
        enabled: true,
        stops: [
          { offset: 0, color: '#000000' },
          { offset: 0.3, color: '#111111' },
          { offset: 0.6, color: '#222222' },
          { offset: 1, color: '#333333' },
        ],
      },
    });
    expect(gradient.ids).toContain('gradient-complex');
    expect(
      warningsFor({ finderColors: { enabled: true, frame: '#EEEEEE', center: '#000000' } }).ids,
    ).toContain('finder-contrast');
    expect(
      warningsFor({
        finderColors: { enabled: true, frame: '#FF8800', center: '#000000' },
        foreground: '#000000',
      }).ids,
    ).toContain('finder-differs');
    expect(warningsFor({ moduleScale: 0.7 }).ids).toContain('module-scale');
    expect(warningsFor({ moduleShape: 'diamond' }).ids).toContain('diamond');
  });
  it('flags payloads approaching the capacity limit', () => {
    const near = warningsFor(
      {},
      {
        qr: { errorCorrection: 'H', boostErrorCorrection: false },
        content: { type: 'text', value: { text: 'x'.repeat(1200) } },
      },
    );
    expect(near.ids.some((id) => id.startsWith('capacity'))).toBe(true);
    expect(near.ids).toContain('dense');
  });
  it('rejects invalid content instead of producing a code', () => {
    const result = prepare({ content: { type: 'url', value: { url: 'nope' } } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('VALIDATION');
    expect(result.issues[0]?.path).toBe('content.value.url');
  });
});
