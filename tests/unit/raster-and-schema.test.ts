import { describe, expect, it } from 'vitest';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { GenerateRequestSchema, requestJsonSchema } from '@shared/api/schemas';
import { parseCsv, serializeCsv, tableToObjects } from '@shared/batch/csv';
import { exampleCsv, mapRow, rowToContent } from '@shared/batch/rows';
import { prepare } from '@shared/pipeline';
import { encodeJpeg, flattenRgba } from '@shared/raster/jpeg-encoder';
import { isJpeg, isPng, jpegDimensions, pngDimensions } from '@shared/raster/signatures';
import { applyPreset, BUILT_IN_PRESETS, PresetFileSchema, styleToPresetStyle } from '@shared/style/presets';
import {
  DEFAULT_STYLE,
  FILE_EXTENSIONS,
  MIME_TYPES,
  OutputSchema,
  resolveStyle,
  StyleSchema,
} from '@shared/style/schema';

import { rasterize } from '../helpers/decode';

const require = createRequire(import.meta.url);

describe('JPEG encoder (pure TypeScript)', () => {
  it('produces a valid baseline JPEG that decodes back to the QR payload', async () => {
    const result = prepare({
      content: { type: 'url', value: { url: 'https://example.com/jpeg' } },
      output: { format: 'jpeg', size: 320 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raster = await rasterize(result.render.svg, 320);
    const flat = flattenRgba(
      { width: raster.width, height: raster.height, data: raster.pixels },
      { r: 255, g: 255, b: 255 },
    );
    const jpeg = encodeJpeg(flat, 85);
    expect(isJpeg(jpeg)).toBe(true);
    expect(jpegDimensions(jpeg)).toEqual({ width: 320, height: 320 });
    expect(jpeg.byteLength).toBeGreaterThan(1000);

    const wasm = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'));
    await prepareZXingModule({
      overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) },
      fireImmediately: true,
    });
    const decoded = await readBarcodes(jpeg, { formats: ['QRCode'], tryHarder: true });
    expect(decoded[0]?.text).toBe('https://example.com/jpeg');
  });

  it('flattens transparency onto an opaque background', () => {
    const image = { width: 2, height: 1, data: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 128]) };
    flattenRgba(image, { r: 255, g: 255, b: 255 });
    expect(Array.from(image.data)).toEqual([255, 255, 255, 255, 127, 127, 127, 255]);
  });

  it('quality changes the file size and invalid inputs are rejected', () => {
    const data = new Uint8Array(64 * 64 * 4);
    for (let i = 0; i < data.length; i += 4) {
      const v = (i / 4) % 64 < 32 ? 0 : 255;
      data[i] = v;
      data[i + 1] = (i * 7) % 255;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    const low = encodeJpeg({ width: 64, height: 64, data }, 10);
    const high = encodeJpeg({ width: 64, height: 64, data }, 100);
    expect(high.byteLength).toBeGreaterThan(low.byteLength);
    expect(isJpeg(low) && isJpeg(high)).toBe(true);
    expect(() => encodeJpeg({ width: 0, height: 1, data: new Uint8Array(0) })).toThrow();
    expect(() => encodeJpeg({ width: 10, height: 10, data: new Uint8Array(4) })).toThrow();
  });
});

describe('file signatures and MIME types', () => {
  it('detects PNG headers and dimensions', async () => {
    const result = prepare({
      content: { type: 'text', value: { text: 'png' } },
      output: { format: 'png', size: 200 },
    });
    if (!result.ok) throw new Error('prepare failed');
    const raster = await rasterize(result.render.svg, 200);
    expect(isPng(raster.png)).toBe(true);
    expect(pngDimensions(raster.png)).toEqual({ width: 200, height: 200 });
    expect(isPng(new Uint8Array([1, 2, 3]))).toBe(false);
  });
  it('maps formats to the right MIME types and extensions', () => {
    expect(MIME_TYPES).toEqual({ svg: 'image/svg+xml', png: 'image/png', jpeg: 'image/jpeg' });
    expect(FILE_EXTENSIONS).toEqual({ svg: 'svg', png: 'png', jpeg: 'jpg' });
    const result = prepare({
      content: { type: 'text', value: { text: 'x' } },
      output: { format: 'jpeg', filename: 'photo.png' },
    });
    expect(result.ok && result.filename).toBe('photo.jpg');
    expect(result.ok && result.mimeType).toBe('image/jpeg');
  });
});

describe('API and style schemas', () => {
  it('accepts the documented example request', () => {
    const parsed = GenerateRequestSchema.safeParse({
      content: { type: 'url', value: { url: 'https://example.com' } },
      qr: { errorCorrection: 'H', version: 'auto', marginModules: 4 },
      style: {
        moduleShape: 'rounded',
        foreground: '#082F49',
        background: '#FFFFFF',
        gradient: {
          enabled: true,
          type: 'linear',
          angle: 45,
          stops: [
            { offset: 0, color: '#2563EB' },
            { offset: 1, color: '#14B8A6' },
          ],
        },
      },
      output: { format: 'png', size: 1024, jpegQuality: 90, filename: 'example-qr' },
    });
    expect(parsed.success).toBe(true);
  });
  it('rejects unknown keys, bad formats and out-of-range sizes', () => {
    expect(
      GenerateRequestSchema.safeParse({ content: { type: 'text', value: { text: 'a' } }, nope: 1 }).success,
    ).toBe(false);
    expect(OutputSchema.safeParse({ format: 'gif' }).success).toBe(false);
    expect(OutputSchema.safeParse({ size: 64 }).success).toBe(false);
    expect(OutputSchema.safeParse({ size: 4097 }).success).toBe(false);
    expect(OutputSchema.safeParse({ size: 512.5 }).success).toBe(false);
    expect(StyleSchema.safeParse({ foreground: 'red' }).success).toBe(false);
    expect(StyleSchema.safeParse({ moduleScale: 0.2 }).success).toBe(false);
    expect(StyleSchema.safeParse({ logo: { dataUrl: 'https://evil.example/x.png' } }).success).toBe(false);
  });
  it('normalizes colours and merges partial styles over defaults', () => {
    const style = resolveStyle({ foreground: '#abc', layout: { caption: { enabled: true } } });
    expect(style.foreground).toBe('#AABBCC');
    expect(style.layout.caption.text).toBe('Scan me');
    expect(style.layout.border).toEqual(DEFAULT_STYLE.layout.border);
  });
  it('produces a JSON schema for the docs endpoint', () => {
    const schema = requestJsonSchema() as {
      properties: Record<string, { oneOf?: unknown[]; type?: string }>;
    };
    expect(Object.keys(schema.properties)).toEqual(['content', 'qr', 'style', 'output']);
    expect(schema.properties.content?.oneOf?.length).toBe(20);
    expect(schema.properties.output?.type).toBe('object');
  });
  it('validates presets and round-trips preset files', () => {
    for (const preset of BUILT_IN_PRESETS) expect(() => resolveStyle(preset.style), preset.id).not.toThrow();
    const withLogo = {
      ...DEFAULT_STYLE,
      logo: { ...DEFAULT_STYLE.logo, enabled: true, dataUrl: 'data:image/png;base64,QUJD' },
    };
    const file = {
      app: 'flareqr-studio',
      version: 1,
      presets: [{ id: 'x', name: 'X', style: styleToPresetStyle(withLogo) }],
    };
    const parsed = PresetFileSchema.safeParse(file);
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(file)).not.toContain('QUJD');
    const applied = applyPreset(withLogo, BUILT_IN_PRESETS[0]!);
    expect(applied.logo.dataUrl).toBe('data:image/png;base64,QUJD');
    expect(applied.foreground).toBe('#000000');
  });
});

describe('CSV and batch rows', () => {
  it('parses quoted fields, embedded delimiters and newlines', () => {
    const table = parseCsv('name,text\r\n"a, b","line1\nline2"\r\nplain,"say ""hi"""\r\n');
    expect(table.headers).toEqual(['name', 'text']);
    expect(table.rows).toEqual([
      ['a, b', 'line1\nline2'],
      ['plain', 'say "hi"'],
    ]);
    expect(tableToObjects(table)[0]).toEqual({ name: 'a, b', text: 'line1\nline2' });
    expect(parseCsv('a;b\n1;2').rows).toEqual([['1', '2']]);
    expect(() => parseCsv('a,b\n"unterminated')).toThrow(/Unterminated/);
    expect(serializeCsv(['a', 'b'], [['x,y', 'q"r']])).toBe('a,b\r\n"x,y","q""r"\r\n');
  });
  it('maps the example CSV to valid requests', () => {
    const table = parseCsv(exampleCsv());
    const rows = tableToObjects(table).map((row, i) =>
      mapRow(row, i, { type: 'url', format: 'png', size: 512 }, BUILT_IN_PRESETS),
    );
    expect(
      rows.every((r) => r.request !== null),
      JSON.stringify(rows.map((r) => r.issues)),
    ).toBe(true);
    expect(rows[2]?.request?.content).toEqual({
      type: 'wifi',
      value: { ssid: 'Cafe Guest', password: 'latte;art', encryption: 'WPA', hidden: false },
    });
    expect(rows[3]?.request?.output?.format).toBe('jpeg');
    expect(rows[3]?.preset?.id).toBe('rounded-blue');
    expect((rows[3]?.request?.content.value as { phones: unknown[] }).phones).toEqual([
      { type: 'CELL', number: '+44 20 7946 0958' },
    ]);
    for (const row of rows) {
      const prepared = prepare(row.request!);
      expect(prepared.ok, row.name).toBe(true);
    }
  });
  it('reports row-level problems', () => {
    const bad = mapRow({ name: 'x', type: 'nope' }, 0, { type: 'url', format: 'png', size: 512 }, []);
    expect(bad.issues[0]).toMatch(/Unknown content type/);
    const missing = mapRow(
      { name: 'x', type: 'wifi', ssid: '' },
      1,
      { type: 'url', format: 'png', size: 512 },
      [],
    );
    expect(missing.request).toBeNull();
    expect(missing.issues.join(' ')).toMatch(/ssid/i);
    const preset = mapRow(
      { url: 'https://a.example', preset: 'Nope' },
      2,
      { type: 'url', format: 'png', size: 512 },
      [],
    );
    expect(preset.issues[0]).toMatch(/Unknown preset/);
    const size = mapRow(
      { url: 'https://a.example', size: '10' },
      3,
      { type: 'url', format: 'png', size: 512 },
      [],
    );
    expect(size.issues[0]).toMatch(/Size/);
    const unknownColumn = rowToContent('url', { url: 'https://a.example', foo: 'bar' });
    expect(unknownColumn.issues[0]).toMatch(/Unknown column "foo"/);
  });
  it('coerces booleans, numbers and JSON columns', () => {
    const { content } = rowToContent('wifi', { ssid: 'S', password: 'pw123456', hidden: 'yes' });
    expect((content.value as { hidden: boolean }).hidden).toBe(true);
    const geo = rowToContent('geo', { latitude: '1.5', longitude: '2' });
    expect((geo.content.value as { latitude: number }).latitude).toBe(1.5);
    const uri = rowToContent('customuri', { scheme: 'app', path: '/x', query: 'a=1&b=2' });
    expect((uri.content.value as { query: unknown[] }).query).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
  });
});
