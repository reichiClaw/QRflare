/**
 * Test helpers: rasterize SVG with resvg-wasm (Node) and decode with two
 * independent decoders that share no code with the encoder under test:
 *
 *  - zxing-wasm (ZXing-C++): the reference decoder used by most real scanners.
 *  - jsQR: a stricter pure-JS decoder, used as an additional check for the
 *    classic (square/rounded) styles.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { initWasm, Resvg } from '@resvg/resvg-wasm';
import jsQR from 'jsqr';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

const require = createRequire(import.meta.url);

let resvgReady: Promise<void> | null = null;
let zxingReady: Promise<unknown> | null = null;

export function ensureResvg(): Promise<void> {
  if (!resvgReady) {
    const wasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm');
    resvgReady = initWasm(readFileSync(wasmPath)).catch((error: unknown) => {
      // initWasm throws if called twice (e.g. across test files in the same worker).
      if (error instanceof Error && /already/i.test(error.message)) return;
      throw error;
    });
  }
  return resvgReady;
}

function ensureZxing(): Promise<unknown> {
  if (!zxingReady) {
    const wasmPath = require.resolve('zxing-wasm/reader/zxing_reader.wasm');
    const bytes = readFileSync(wasmPath);
    zxingReady = prepareZXingModule({
      overrides: { wasmBinary: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) },
      fireImmediately: true,
    });
  }
  return zxingReady;
}

export interface Raster {
  width: number;
  height: number;
  pixels: Uint8Array;
  png: Uint8Array;
}

export async function rasterize(svg: string, width = 512, background?: string): Promise<Raster> {
  await ensureResvg();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    ...(background ? { background } : {}),
    font: { loadSystemFonts: false },
  });
  const rendered = resvg.render();
  const raster = {
    width: rendered.width,
    height: rendered.height,
    pixels: new Uint8Array(rendered.pixels),
    png: rendered.asPng(),
  };
  rendered.free();
  resvg.free();
  return raster;
}

/** Flattens RGBA onto white so transparent designs can be decoded. */
function flattenOnWhite(pixels: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const a = (pixels[i + 3] ?? 255) / 255;
    out[i] = Math.round((pixels[i] ?? 0) * a + 255 * (1 - a));
    out[i + 1] = Math.round((pixels[i + 1] ?? 0) * a + 255 * (1 - a));
    out[i + 2] = Math.round((pixels[i + 2] ?? 0) * a + 255 * (1 - a));
    out[i + 3] = 255;
  }
  return out;
}

export function decodeWithJsQr(raster: { width: number; height: number; pixels: Uint8Array }): string | null {
  const data = flattenOnWhite(raster.pixels);
  const result = jsQR(data, raster.width, raster.height, { inversionAttempts: 'attemptBoth' });
  return result?.data ?? null;
}

export async function decodeWithZxing(raster: {
  width: number;
  height: number;
  pixels: Uint8Array;
}): Promise<string | null> {
  await ensureZxing();
  const data = flattenOnWhite(raster.pixels);
  const imageData = {
    data,
    width: raster.width,
    height: raster.height,
    colorSpace: 'srgb',
  } as unknown as ImageData;
  const results = await readBarcodes(imageData, {
    formats: ['QRCode'],
    tryHarder: true,
    tryInvert: true,
    tryRotate: false,
    maxNumberOfSymbols: 1,
    textMode: 'Plain',
    characterSet: 'UTF8',
  });
  const first = results[0];
  if (!first || !first.isValid) return null;
  return first.text;
}

/** Decodes with ZXing (the primary independent decoder). */
export async function decodeSvg(svg: string, width = 512): Promise<string | null> {
  const raster = await rasterize(svg, width);
  return decodeWithZxing(raster);
}

/** Decodes with jsQR (strict secondary decoder). */
export async function decodeSvgStrict(svg: string, width = 512): Promise<string | null> {
  const raster = await rasterize(svg, width);
  return decodeWithJsQr(raster);
}

/** Decodes raw RGBA pixels with ZXing (used for PNG/JPEG outputs). */
export async function decodePixels(raster: {
  width: number;
  height: number;
  pixels: Uint8Array;
}): Promise<string | null> {
  return decodeWithZxing(raster);
}
