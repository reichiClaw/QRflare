#!/usr/bin/env node
/**
 * Renders the PWA icons (PNG) from public/icons/icon.svg using resvg-wasm.
 * Run with `npm run icons` after changing the logo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { initWasm, Resvg } from '@resvg/resvg-wasm';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));

await initWasm(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
const svg = readFileSync(`${root}/public/icons/icon.svg`, 'utf8');

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['maskable-512.png', 512, true],
];

for (const [name, size, maskable] of targets) {
  // Maskable icons need ~10 % safe padding: scale the artwork into a solid square.
  const source = maskable
    ? svg.replace(
        '<rect width="512" height="512" rx="112" fill="url(#bg)"/>',
        '<rect width="512" height="512" rx="0" fill="url(#bg)"/>',
      )
    : svg;
  const resvg = new Resvg(source, {
    fitTo: { mode: 'width', value: size },
    font: { loadSystemFonts: false },
  });
  const image = resvg.render();
  writeFileSync(`${root}/public/icons/${name}`, image.asPng());
  image.free();
  resvg.free();
  console.log(`wrote public/icons/${name} (${size}px)`);
}
