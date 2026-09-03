/**
 * Worker-side rasterization.
 *
 * SVG → pixels is done by resvg (Rust, compiled to WebAssembly – no DOM, no
 * Canvas, no native binaries). PNG encoding is done by resvg as well; JPEG
 * encoding uses the shared pure-TypeScript baseline encoder. Inter (OFL) is
 * bundled as Data modules so captions render without system fonts.
 */
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';

import { encodeJpeg, flattenRgba } from '@shared/raster/jpeg-encoder';
import { parseHex } from '@shared/style/color';

import interBold from './fonts/inter-bold.ttf.bin';
import interMedium from './fonts/inter-medium.ttf.bin';
import interRegular from './fonts/inter-regular.ttf.bin';
import interSemiBold from './fonts/inter-semibold.ttf.bin';

let initialized: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initialized) {
    initialized = initWasm(resvgWasm).catch((error: unknown) => {
      if (error instanceof Error && /already/i.test(error.message)) return;
      initialized = null;
      throw error;
    });
  }
  return initialized;
}

const fontBuffers = [interRegular, interMedium, interSemiBold, interBold].map((buf) => new Uint8Array(buf));

export interface RasterOptions {
  format: 'png' | 'jpeg';
  width: number;
  jpegQuality: number;
  /** Hex colour used to flatten transparency for JPEG. */
  jpegBackground: string;
}

export interface RasterResult {
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: 'image/png' | 'image/jpeg';
}

export async function rasterizeSvg(svg: string, options: RasterOptions): Promise<RasterResult> {
  await ensureInitialized();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: options.width },
    font: {
      fontBuffers,
      defaultFontFamily: 'Inter',
      sansSerifFamily: 'Inter',
    },
    shapeRendering: 2,
    textRendering: 2,
    imageRendering: 0,
  });
  try {
    const image = resvg.render();
    try {
      if (options.format === 'png') {
        return { bytes: image.asPng(), width: image.width, height: image.height, mimeType: 'image/png' };
      }
      const bg = parseHex(options.jpegBackground) ?? { r: 255, g: 255, b: 255, a: 1 };
      const pixels = flattenRgba({ width: image.width, height: image.height, data: image.pixels }, bg);
      const bytes = encodeJpeg(pixels, options.jpegQuality);
      return { bytes, width: image.width, height: image.height, mimeType: 'image/jpeg' };
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}
