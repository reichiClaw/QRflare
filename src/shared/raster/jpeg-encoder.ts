/**
 * Baseline JPEG encoder (ITU T.81, sequential DCT, Huffman, 4:4:4).
 *
 * A dependency-free TypeScript implementation that runs unchanged in browsers,
 * Node and Cloudflare Workers. Chroma is not subsampled so module edges stay
 * crisp. Input is RGBA; alpha must already be flattened (see flattenRgba).
 *
 * The DCT/quantisation approach follows the well-known AAN algorithm used by
 * the IJG reference implementation.
 */

const ZIGZAG = new Uint8Array([
  0, 1, 5, 6, 14, 15, 27, 28, 2, 4, 7, 13, 16, 26, 29, 42, 3, 8, 12, 17, 25, 30, 41, 43, 9, 11, 18, 24, 31, 40, 44, 53, 10,
  19, 23, 32, 39, 45, 52, 54, 20, 22, 33, 38, 46, 51, 55, 60, 21, 34, 37, 47, 50, 56, 59, 61, 35, 36, 48, 49, 57, 58, 62,
  63,
]);

const Y_QUANT = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87,
  80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92,
  95, 98, 112, 100, 103, 99,
];

const UV_QUANT = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99,
];

const DC_LUM_CODES = [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_LUM_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_LUM_CODES = [0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_LUM_VALUES = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32,
  0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16,
  0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94,
  0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8,
  0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];
const DC_CHR_CODES = [0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_CHR_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_CHR_CODES = [0, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const AC_CHR_VALUES = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81,
  0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34,
  0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44,
  0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92,
  0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
  0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6,
  0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

const AASF = [1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.5411961, 0.275899379];

type HuffTable = Array<[number, number] | undefined>;

function buildHuffmanTable(codes: number[], values: number[]): HuffTable {
  const table: HuffTable = [];
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let j = 1; j <= (codes[len] ?? 0); j++) {
      table[values[k] ?? 0] = [code, len];
      k++;
      code++;
    }
    code *= 2;
  }
  return table;
}

const HT_DC_LUM = buildHuffmanTable(DC_LUM_CODES, DC_LUM_VALUES);
const HT_AC_LUM = buildHuffmanTable(AC_LUM_CODES, AC_LUM_VALUES);
const HT_DC_CHR = buildHuffmanTable(DC_CHR_CODES, DC_CHR_VALUES);
const HT_AC_CHR = buildHuffmanTable(AC_CHR_CODES, AC_CHR_VALUES);

// category[32767 + v] and bitcode[32767 + v] for v in [-32767, 32767]
const CATEGORY = new Uint8Array(65535);
const BITCODE: Array<[number, number]> = new Array<[number, number]>(65535);
(() => {
  let lower = 1;
  let upper = 2;
  for (let cat = 1; cat <= 15; cat++) {
    for (let nr = lower; nr < upper; nr++) {
      CATEGORY[32767 + nr] = cat;
      BITCODE[32767 + nr] = [nr, cat];
    }
    for (let nr = -(upper - 1); nr <= -lower; nr++) {
      CATEGORY[32767 + nr] = cat;
      BITCODE[32767 + nr] = [upper - 1 + nr, cat];
    }
    lower <<= 1;
    upper <<= 1;
  }
})();

class ByteWriter {
  private buffer: Uint8Array;
  private length = 0;
  private bitBuffer = 0;
  private bitPos = 7;

  constructor(initial: number) {
    this.buffer = new Uint8Array(Math.max(1024, initial));
  }

  private ensure(extra: number) {
    if (this.length + extra <= this.buffer.length) return;
    let size = this.buffer.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
  }

  byte(value: number) {
    this.ensure(1);
    this.buffer[this.length++] = value & 0xff;
  }

  word(value: number) {
    this.byte((value >> 8) & 0xff);
    this.byte(value & 0xff);
  }

  bits(code: [number, number]) {
    const value = code[0];
    let pos = code[1] - 1;
    while (pos >= 0) {
      if (value & (1 << pos)) this.bitBuffer |= 1 << this.bitPos;
      pos--;
      this.bitPos--;
      if (this.bitPos < 0) {
        if (this.bitBuffer === 0xff) {
          this.byte(0xff);
          this.byte(0);
        } else {
          this.byte(this.bitBuffer);
        }
        this.bitPos = 7;
        this.bitBuffer = 0;
      }
    }
  }

  flushBits() {
    if (this.bitPos !== 7) {
      this.bits([(1 << (this.bitPos + 1)) - 1, this.bitPos + 1]);
    }
  }

  result(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

function quantTables(quality: number) {
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  const sf = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
  const yTable = new Uint8Array(64);
  const uvTable = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const y = Math.max(1, Math.min(255, Math.floor(((Y_QUANT[i] ?? 16) * sf + 50) / 100)));
    const uv = Math.max(1, Math.min(255, Math.floor(((UV_QUANT[i] ?? 17) * sf + 50) / 100)));
    yTable[ZIGZAG[i] ?? 0] = y;
    uvTable[ZIGZAG[i] ?? 0] = uv;
  }
  const fdY = new Float32Array(64);
  const fdUV = new Float32Array(64);
  let k = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const scale = (AASF[row] ?? 1) * (AASF[col] ?? 1) * 8;
      fdY[k] = 1 / ((yTable[ZIGZAG[k] ?? 0] ?? 1) * scale);
      fdUV[k] = 1 / ((uvTable[ZIGZAG[k] ?? 0] ?? 1) * scale);
      k++;
    }
  }
  return { yTable, uvTable, fdY, fdUV };
}

function fdctQuant(data: Float32Array, fdtbl: Float32Array, out: Int32Array) {
  // Rows
  for (let off = 0; off < 64; off += 8) {
    const d0 = data[off] ?? 0,
      d1 = data[off + 1] ?? 0,
      d2 = data[off + 2] ?? 0,
      d3 = data[off + 3] ?? 0,
      d4 = data[off + 4] ?? 0,
      d5 = data[off + 5] ?? 0,
      d6 = data[off + 6] ?? 0,
      d7 = data[off + 7] ?? 0;
    const tmp0 = d0 + d7,
      tmp7 = d0 - d7,
      tmp1 = d1 + d6,
      tmp6 = d1 - d6,
      tmp2 = d2 + d5,
      tmp5 = d2 - d5,
      tmp3 = d3 + d4,
      tmp4 = d3 - d4;
    let tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    let tmp11 = tmp1 + tmp2;
    let tmp12 = tmp1 - tmp2;
    data[off] = tmp10 + tmp11;
    data[off + 4] = tmp10 - tmp11;
    const z1 = (tmp12 + tmp13) * 0.707106781;
    data[off + 2] = tmp13 + z1;
    data[off + 6] = tmp13 - z1;
    tmp10 = tmp4 + tmp5;
    tmp11 = tmp5 + tmp6;
    tmp12 = tmp6 + tmp7;
    const z5 = (tmp10 - tmp12) * 0.382683433;
    const z2 = 0.5411961 * tmp10 + z5;
    const z4 = 1.306562965 * tmp12 + z5;
    const z3 = tmp11 * 0.707106781;
    const z11 = tmp7 + z3;
    const z13 = tmp7 - z3;
    data[off + 5] = z13 + z2;
    data[off + 3] = z13 - z2;
    data[off + 1] = z11 + z4;
    data[off + 7] = z11 - z4;
  }
  // Columns
  for (let off = 0; off < 8; off++) {
    const d0 = data[off] ?? 0,
      d1 = data[off + 8] ?? 0,
      d2 = data[off + 16] ?? 0,
      d3 = data[off + 24] ?? 0,
      d4 = data[off + 32] ?? 0,
      d5 = data[off + 40] ?? 0,
      d6 = data[off + 48] ?? 0,
      d7 = data[off + 56] ?? 0;
    const tmp0 = d0 + d7,
      tmp7 = d0 - d7,
      tmp1 = d1 + d6,
      tmp6 = d1 - d6,
      tmp2 = d2 + d5,
      tmp5 = d2 - d5,
      tmp3 = d3 + d4,
      tmp4 = d3 - d4;
    let tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    let tmp11 = tmp1 + tmp2;
    let tmp12 = tmp1 - tmp2;
    data[off] = tmp10 + tmp11;
    data[off + 32] = tmp10 - tmp11;
    const z1 = (tmp12 + tmp13) * 0.707106781;
    data[off + 16] = tmp13 + z1;
    data[off + 48] = tmp13 - z1;
    tmp10 = tmp4 + tmp5;
    tmp11 = tmp5 + tmp6;
    tmp12 = tmp6 + tmp7;
    const z5 = (tmp10 - tmp12) * 0.382683433;
    const z2 = 0.5411961 * tmp10 + z5;
    const z4 = 1.306562965 * tmp12 + z5;
    const z3 = tmp11 * 0.707106781;
    const z11 = tmp7 + z3;
    const z13 = tmp7 - z3;
    data[off + 40] = z13 + z2;
    data[off + 24] = z13 - z2;
    data[off + 8] = z11 + z4;
    data[off + 56] = z11 - z4;
  }
  for (let i = 0; i < 64; i++) {
    const v = (data[i] ?? 0) * (fdtbl[i] ?? 1);
    out[i] = Math.round(v);
  }
}

function processBlock(
  writer: ByteWriter,
  block: Float32Array,
  fdtbl: Float32Array,
  dcPrev: number,
  htDc: HuffTable,
  htAc: HuffTable,
  scratch: Int32Array,
  zz: Int32Array,
): number {
  fdctQuant(block, fdtbl, scratch);
  for (let j = 0; j < 64; j++) zz[ZIGZAG[j] ?? 0] = scratch[j] ?? 0;
  const dc = zz[0] ?? 0;
  const diff = dc - dcPrev;
  const eob = htAc[0x00] as [number, number];
  const m16 = htAc[0xf0] as [number, number];
  if (diff === 0) {
    writer.bits(htDc[0] as [number, number]);
  } else {
    const pos = 32767 + diff;
    writer.bits(htDc[CATEGORY[pos] ?? 0] as [number, number]);
    writer.bits(BITCODE[pos] as [number, number]);
  }
  let end = 63;
  while (end > 0 && (zz[end] ?? 0) === 0) end--;
  if (end === 0) {
    writer.bits(eob);
    return dc;
  }
  let i = 1;
  while (i <= end) {
    const start = i;
    while ((zz[i] ?? 0) === 0 && i <= end) i++;
    let zeros = i - start;
    if (zeros >= 16) {
      const runs = zeros >> 4;
      for (let r = 1; r <= runs; r++) writer.bits(m16);
      zeros &= 0xf;
    }
    const pos = 32767 + (zz[i] ?? 0);
    writer.bits(htAc[(zeros << 4) + (CATEGORY[pos] ?? 0)] as [number, number]);
    writer.bits(BITCODE[pos] as [number, number]);
    i++;
  }
  if (end !== 63) writer.bits(eob);
  return dc;
}

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  data: Uint8Array | Uint8ClampedArray;
}

/**
 * Composites RGBA pixels onto an opaque background colour in place and returns
 * the same buffer. JPEG has no alpha channel, so this must run first.
 */
export function flattenRgba(image: RgbaImage, background: { r: number; g: number; b: number }): RgbaImage {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const a = (data[i + 3] ?? 255) / 255;
    if (a === 1) continue;
    data[i] = Math.round((data[i] ?? 0) * a + background.r * (1 - a));
    data[i + 1] = Math.round((data[i + 1] ?? 0) * a + background.g * (1 - a));
    data[i + 2] = Math.round((data[i + 2] ?? 0) * a + background.b * (1 - a));
    data[i + 3] = 255;
  }
  return image;
}

export function encodeJpeg(image: RgbaImage, quality = 90): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0 || width > 65535 || height > 65535) throw new RangeError('Invalid JPEG dimensions');
  if (data.length < width * height * 4) throw new RangeError('Pixel buffer too small');

  const { yTable, uvTable, fdY, fdUV } = quantTables(quality);
  const writer = new ByteWriter(Math.ceil((width * height) / 4) + 1024);

  // SOI + JFIF APP0
  writer.word(0xffd8);
  writer.word(0xffe0);
  writer.word(16);
  writer.byte(0x4a);
  writer.byte(0x46);
  writer.byte(0x49);
  writer.byte(0x46);
  writer.byte(0);
  writer.byte(1);
  writer.byte(1);
  writer.byte(0); // units: none
  writer.word(1);
  writer.word(1);
  writer.byte(0);
  writer.byte(0);

  // DQT
  writer.word(0xffdb);
  writer.word(132);
  writer.byte(0);
  for (let i = 0; i < 64; i++) writer.byte(yTable[i] ?? 1);
  writer.byte(1);
  for (let i = 0; i < 64; i++) writer.byte(uvTable[i] ?? 1);

  // SOF0
  writer.word(0xffc0);
  writer.word(17);
  writer.byte(8);
  writer.word(height);
  writer.word(width);
  writer.byte(3);
  writer.byte(1);
  writer.byte(0x11);
  writer.byte(0);
  writer.byte(2);
  writer.byte(0x11);
  writer.byte(1);
  writer.byte(3);
  writer.byte(0x11);
  writer.byte(1);

  // DHT
  writer.word(0xffc4);
  writer.word(0x01a2);
  const writeTable = (cls: number, codes: number[], values: number[]) => {
    writer.byte(cls);
    for (let i = 1; i <= 16; i++) writer.byte(codes[i] ?? 0);
    for (const v of values) writer.byte(v);
  };
  writeTable(0x00, DC_LUM_CODES, DC_LUM_VALUES);
  writeTable(0x10, AC_LUM_CODES, AC_LUM_VALUES);
  writeTable(0x01, DC_CHR_CODES, DC_CHR_VALUES);
  writeTable(0x11, AC_CHR_CODES, AC_CHR_VALUES);

  // SOS
  writer.word(0xffda);
  writer.word(12);
  writer.byte(3);
  writer.byte(1);
  writer.byte(0);
  writer.byte(2);
  writer.byte(0x11);
  writer.byte(3);
  writer.byte(0x11);
  writer.byte(0);
  writer.byte(0x3f);
  writer.byte(0);

  const yBlock = new Float32Array(64);
  const uBlock = new Float32Array(64);
  const vBlock = new Float32Array(64);
  const scratch = new Int32Array(64);
  const zz = new Int32Array(64);
  let dcY = 0;
  let dcU = 0;
  let dcV = 0;

  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      for (let y = 0; y < 8; y++) {
        const sy = Math.min(height - 1, by + y);
        for (let x = 0; x < 8; x++) {
          const sx = Math.min(width - 1, bx + x);
          const p = (sy * width + sx) * 4;
          const r = data[p] ?? 0;
          const g = data[p + 1] ?? 0;
          const b = data[p + 2] ?? 0;
          const i = y * 8 + x;
          yBlock[i] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
          uBlock[i] = -0.168736 * r - 0.331264 * g + 0.5 * b;
          vBlock[i] = 0.5 * r - 0.418688 * g - 0.081312 * b;
        }
      }
      dcY = processBlock(writer, yBlock, fdY, dcY, HT_DC_LUM, HT_AC_LUM, scratch, zz);
      dcU = processBlock(writer, uBlock, fdUV, dcU, HT_DC_CHR, HT_AC_CHR, scratch, zz);
      dcV = processBlock(writer, vBlock, fdUV, dcV, HT_DC_CHR, HT_AC_CHR, scratch, zz);
    }
  }

  writer.flushBits();
  writer.word(0xffd9);
  return writer.result();
}
