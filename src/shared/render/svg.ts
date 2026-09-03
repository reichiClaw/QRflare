/**
 * SVG renderer: turns a QR matrix plus a Style into a self-contained SVG
 * document. The renderer never changes which modules are dark – styling is
 * purely geometric – so decoders always see the encoded matrix.
 *
 * Coordinate system: the QR symbol including its quiet zone occupies
 * 1000 x 1000 "design units". Border, frame, caption and padding are added
 * around it; the final SVG width/height attributes scale everything to the
 * requested pixel size.
 */
import { finderOrigins, isDark, isFinderModule, type QrMatrix } from '../qr/encode';
import { readableTextColor } from '../style/color';
import type { FinderCenterShape, FinderFrameShape, ModuleShape, Style } from '../style/schema';
import { escapeXml, num } from './xml';

export const QR_DESIGN_SIZE = 1000;

/** Bundled system font stack used for captions (no external font requests). */
export const CAPTION_FONT_FAMILY =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";

export interface RenderInput {
  matrix: QrMatrix;
  marginModules: number;
  style: Style;
  /** Width of the SVG in CSS pixels; height follows the aspect ratio. */
  size: number;
  /** Accessible title. */
  title?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderResult {
  svg: string;
  width: number;
  height: number;
  /** Design-unit dimensions of the whole document. */
  design: { width: number; height: number };
  /** QR square (including quiet zone) in design units. */
  qrRect: Rect;
  /** Logo box (including padding) in design units, when a logo was drawn. */
  logoRect: Rect | null;
  /** Fraction of the matrix area (0-1) hidden by the logo box. */
  logoCoverage: number;
  /** Requested logo scale was reduced to protect finder patterns. */
  logoClamped: boolean;
  /** Number of dark modules removed under the logo. */
  clearedModules: number;
}

interface Neighbors {
  l: boolean;
  r: boolean;
  u: boolean;
  d: boolean;
}

interface ModuleGeometry {
  radii: [number, number, number, number]; // TL, TR, BR, BL as fraction of the cell
  connected: boolean;
  diamond?: boolean;
}

function moduleGeometry(shape: ModuleShape, style: Style): ModuleGeometry {
  switch (shape) {
    case 'square':
      return { radii: [0, 0, 0, 0], connected: false };
    case 'rounded':
      return { radii: [0.3, 0.3, 0.3, 0.3], connected: false };
    case 'dots':
      return { radii: [0.5, 0.5, 0.5, 0.5], connected: false };
    case 'extra-rounded':
      return { radii: [0.5, 0.5, 0.5, 0.5], connected: true };
    case 'diamond':
      return { radii: [0, 0, 0, 0], connected: false, diamond: true };
    case 'classy':
      return { radii: [0.5, 0, 0.5, 0], connected: false };
    case 'classy-rounded':
      return { radii: [0.5, 0, 0.5, 0], connected: true };
    case 'custom': {
      const r = style.customModule.cornerRadius;
      return { radii: [r, r, r, r], connected: style.customModule.connected };
    }
  }
}

/** Rounded rectangle path with individual corner radii (TL, TR, BR, BL). */
export function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radii: [number, number, number, number],
): string {
  const maxR = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, maxR))) as [
    number,
    number,
    number,
    number,
  ];
  const right = x + w;
  const bottom = y + h;
  let d = `M${num(x + tl)} ${num(y)}`;
  d += `H${num(right - tr)}`;
  if (tr > 0) d += `A${num(tr)} ${num(tr)} 0 0 1 ${num(right)} ${num(y + tr)}`;
  d += `V${num(bottom - br)}`;
  if (br > 0) d += `A${num(br)} ${num(br)} 0 0 1 ${num(right - br)} ${num(bottom)}`;
  d += `H${num(x + bl)}`;
  if (bl > 0) d += `A${num(bl)} ${num(bl)} 0 0 1 ${num(x)} ${num(bottom - bl)}`;
  d += `V${num(y + tl)}`;
  if (tl > 0) d += `A${num(tl)} ${num(tl)} 0 0 1 ${num(x + tl)} ${num(y)}`;
  return `${d}Z`;
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M${num(cx)} ${num(cy - r)}A${num(r)} ${num(r)} 0 1 0 ${num(cx)} ${num(cy + r)}A${num(r)} ${num(r)} 0 1 0 ${num(cx)} ${num(cy - r)}Z`;
}

/**
 * Diamond modules. A diamond inscribed in the cell would cover only 50 % of it,
 * which decoders tolerate poorly, so the half-diagonal is extended to 0.68
 * (≈ 92 % coverage). The tips overlap the edge midpoints of neighbouring cells
 * but never reach their centres, so the matrix is preserved.
 */
const DIAMOND_HALF_DIAGONAL = 0.68;

function diamondPath(x: number, y: number, scale: number): string {
  const cx = x + 0.5;
  const cy = y + 0.5;
  const h = DIAMOND_HALF_DIAGONAL * scale;
  return `M${num(cx)} ${num(cy - h)}L${num(cx + h)} ${num(cy)}L${num(cx)} ${num(cy + h)}L${num(cx - h)} ${num(cy)}Z`;
}

function modulePath(x: number, y: number, nb: Neighbors, geo: ModuleGeometry, scale: number): string {
  if (geo.diamond) return diamondPath(x, y, scale);
  const inset = (1 - scale) / 2;
  const left = x + (geo.connected && nb.l ? 0 : inset);
  const right = x + 1 - (geo.connected && nb.r ? 0 : inset);
  const top = y + (geo.connected && nb.u ? 0 : inset);
  const bottom = y + 1 - (geo.connected && nb.d ? 0 : inset);
  const w = right - left;
  const h = bottom - top;
  let [tl, tr, br, bl] = geo.radii;
  if (geo.connected) {
    if (nb.l || nb.u) tl = 0;
    if (nb.r || nb.u) tr = 0;
    if (nb.r || nb.d) br = 0;
    if (nb.l || nb.d) bl = 0;
  }
  const unit = Math.min(w, h);
  return roundedRectPath(left, top, w, h, [tl * unit, tr * unit, br * unit, bl * unit]);
}

function finderFramePath(ox: number, oy: number, shape: FinderFrameShape): string {
  switch (shape) {
    case 'square':
      return `${roundedRectPath(ox, oy, 7, 7, [0, 0, 0, 0])}${roundedRectPath(ox + 1, oy + 1, 5, 5, [0, 0, 0, 0])}`;
    case 'rounded':
      return `${roundedRectPath(ox, oy, 7, 7, [1.75, 1.75, 1.75, 1.75])}${roundedRectPath(ox + 1, oy + 1, 5, 5, [1, 1, 1, 1])}`;
    case 'extra-rounded':
      return `${roundedRectPath(ox, oy, 7, 7, [2.6, 2.6, 2.6, 2.6])}${roundedRectPath(ox + 1, oy + 1, 5, 5, [1.7, 1.7, 1.7, 1.7])}`;
    case 'circle':
      return `${circlePath(ox + 3.5, oy + 3.5, 3.5)}${circlePath(ox + 3.5, oy + 3.5, 2.5)}`;
    case 'dots': {
      let d = '';
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          if (i === 0 || i === 6 || j === 0 || j === 6) d += circlePath(ox + i + 0.5, oy + j + 0.5, 0.5);
        }
      }
      return d;
    }
  }
}

function finderCenterPath(ox: number, oy: number, shape: FinderCenterShape): string {
  const x = ox + 2;
  const y = oy + 2;
  switch (shape) {
    case 'square':
      return roundedRectPath(x, y, 3, 3, [0, 0, 0, 0]);
    case 'rounded':
      return roundedRectPath(x, y, 3, 3, [0.9, 0.9, 0.9, 0.9]);
    case 'circle':
      return circlePath(x + 1.5, y + 1.5, 1.5);
    case 'diamond':
      return `M${num(x + 1.5)} ${num(y)}L${num(x + 3)} ${num(y + 1.5)}L${num(x + 1.5)} ${num(y + 3)}L${num(x)} ${num(y + 1.5)}Z`;
  }
}

function gradientDefs(style: Style, n: number): string {
  const g = style.gradient;
  if (!g.enabled) return '';
  const stops = g.stops
    .slice()
    .sort((a, b) => a.offset - b.offset)
    .map((s) => `<stop offset="${num(s.offset * 100)}%" stop-color="${s.color}"/>`)
    .join('');
  if (g.type === 'radial') {
    const c = n / 2;
    return `<radialGradient id="qrg" gradientUnits="userSpaceOnUse" cx="${num(c)}" cy="${num(c)}" r="${num(n * 0.7071)}">${stops}</radialGradient>`;
  }
  const theta = (g.angle * Math.PI) / 180;
  const c = n / 2;
  const half = c * (Math.abs(Math.cos(theta)) + Math.abs(Math.sin(theta)));
  const dx = Math.cos(theta) * half;
  const dy = Math.sin(theta) * half;
  return `<linearGradient id="qrg" gradientUnits="userSpaceOnUse" x1="${num(c - dx)}" y1="${num(c - dy)}" x2="${num(c + dx)}" y2="${num(c + dy)}">${stops}</linearGradient>`;
}

/**
 * Computes the largest logo box (logo + padding, in modules) that keeps a
 * 1-module gap to the finder pattern separators.
 */
export function maxLogoBoxModules(n: number, paddingModules: number): number {
  return Math.max(0, n - 16 - 2 - 2 * paddingModules) + 2 * paddingModules;
}

export function computeLogoBox(
  n: number,
  style: Style,
): { logoModules: number; boxModules: number; clamped: boolean } | null {
  const logo = style.logo;
  if (!logo.enabled || !logo.dataUrl) return null;
  const requested = logo.scale * n;
  const maxBox = maxLogoBoxModules(n, logo.padding);
  const maxLogo = maxBox - 2 * logo.padding;
  if (maxLogo < 1) return null;
  const logoModules = Math.min(requested, maxLogo);
  return { logoModules, boxModules: logoModules + 2 * logo.padding, clamped: requested > maxLogo + 1e-9 };
}

export function renderSvg(input: RenderInput): RenderResult {
  const { matrix, style, marginModules } = input;
  const n = matrix.size;
  const totalModules = n + marginModules * 2;
  const mu = QR_DESIGN_SIZE / totalModules;

  const layout = style.layout;
  const P = layout.padding;
  const B = layout.border.enabled ? layout.border.width : 0;
  const T = layout.frame.enabled ? layout.frame.thickness : 0;
  const caption = layout.caption;
  const capH = caption.enabled ? caption.gap + caption.fontSize * 1.3 : 0;
  const contentW = QR_DESIGN_SIZE + 2 * T;
  const contentH = QR_DESIGN_SIZE + 2 * T + capH;
  const W = 2 * (P + B) + contentW;
  const H = 2 * (P + B) + contentH;
  const qx = P + B + T;
  const qy = P + B + T + (caption.enabled && caption.position === 'top' ? capH : 0);

  const width = Math.max(1, Math.round(input.size));
  const height = Math.max(1, Math.round((input.size * H) / W));

  const parts: string[] = [];
  const titleId = 'qr-title';
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${num(W)} ${num(H)}" role="img" aria-labelledby="${titleId}">`,
  );
  parts.push(`<title id="${titleId}">${escapeXml(input.title ?? 'QR code')}</title>`);

  // Definitions
  const defs: string[] = [];
  const gradient = gradientDefs(style, n);
  if (gradient) defs.push(gradient);

  const logoBox = computeLogoBox(n, style);
  let logoRect: Rect | null = null;
  let clearedModules = 0;
  if (logoBox) {
    const logoUnits = logoBox.logoModules * mu;
    const r = style.logo.cornerRadius * logoUnits;
    defs.push(
      `<clipPath id="qrlogo"><rect x="${num((n - logoBox.logoModules) / 2)}" y="${num((n - logoBox.logoModules) / 2)}" width="${num(logoBox.logoModules)}" height="${num(logoBox.logoModules)}" rx="${num(r / mu)}"/></clipPath>`,
    );
    logoRect = {
      x: qx + (marginModules + (n - logoBox.boxModules) / 2) * mu,
      y: qy + (marginModules + (n - logoBox.boxModules) / 2) * mu,
      width: logoBox.boxModules * mu,
      height: logoBox.boxModules * mu,
    };
  }
  if (defs.length) parts.push(`<defs>${defs.join('')}</defs>`);

  // Background
  if (!style.transparentBackground) {
    parts.push(
      `<rect width="${num(W)}" height="${num(H)}" rx="${num(layout.cornerRadius)}" fill="${style.background}"/>`,
    );
  }

  // Border (stroke fully inside [P, P+B])
  if (layout.border.enabled) {
    parts.push(
      `<rect x="${num(P + B / 2)}" y="${num(P + B / 2)}" width="${num(contentW + B)}" height="${num(contentH + B)}" rx="${num(layout.border.radius)}" fill="none" stroke="${layout.border.color}" stroke-width="${num(B)}"/>`,
    );
  }

  // Frame band
  if (layout.frame.enabled) {
    parts.push(
      `<rect x="${num(P + B)}" y="${num(P + B)}" width="${num(contentW)}" height="${num(contentH)}" rx="${num(layout.frame.radius)}" fill="${layout.frame.color}"/>`,
    );
    if (!style.transparentBackground) {
      const innerR = Math.max(0, layout.frame.radius - T);
      parts.push(
        `<rect x="${num(qx)}" y="${num(qy)}" width="${QR_DESIGN_SIZE}" height="${QR_DESIGN_SIZE}" rx="${num(innerR)}" fill="${style.background}"/>`,
      );
    }
  }

  // Modules
  const fill = style.gradient.enabled ? 'url(#qrg)' : style.foreground;
  const finderFill = style.finderColors.enabled
    ? { frame: style.finderColors.frame, center: style.finderColors.center }
    : style.gradient.enabled && style.gradient.target === 'all'
      ? { frame: 'url(#qrg)', center: 'url(#qrg)' }
      : { frame: style.foreground, center: style.foreground };

  const geo = moduleGeometry(style.moduleShape, style);
  const scale = style.moduleScale;
  const clear = logoBox && style.logo.clearModules ? logoBox.boxModules : 0;
  const clearMin = (n - clear) / 2;
  const clearMax = (n + clear) / 2;

  const dark = (x: number, y: number) => isDark(matrix, x, y) && !isFinderModule(n, x, y) && !isCleared(x, y);
  const isCleared = (x: number, y: number) => {
    if (!clear) return false;
    const cx = x + 0.5;
    const cy = y + 0.5;
    return cx > clearMin && cx < clearMax && cy > clearMin && cy < clearMax;
  };

  let modulesPath = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!isDark(matrix, x, y) || isFinderModule(n, x, y)) continue;
      if (isCleared(x, y)) {
        clearedModules++;
        continue;
      }
      const nb: Neighbors = { l: dark(x - 1, y), r: dark(x + 1, y), u: dark(x, y - 1), d: dark(x, y + 1) };
      modulesPath += modulePath(x, y, nb, geo, scale);
    }
  }

  parts.push(
    `<g transform="translate(${num(qx + marginModules * mu)} ${num(qy + marginModules * mu)}) scale(${num(mu)})">`,
  );
  const crisp = style.moduleShape === 'square' && scale === 1 ? ' shape-rendering="crispEdges"' : '';
  parts.push(`<path fill="${fill}" d="${modulesPath}"${crisp}/>`);

  let framePath = '';
  let centerPath = '';
  for (const { x, y } of finderOrigins(n)) {
    framePath += finderFramePath(x, y, style.finderFrameShape);
    centerPath += finderCenterPath(x, y, style.finderCenterShape);
  }
  const finderCrisp = style.finderFrameShape === 'square' ? ' shape-rendering="crispEdges"' : '';
  parts.push(`<path fill="${finderFill.frame}" fill-rule="evenodd" d="${framePath}"${finderCrisp}/>`);
  parts.push(
    `<path fill="${finderFill.center}" d="${centerPath}"${style.finderCenterShape === 'square' ? ' shape-rendering="crispEdges"' : ''}/>`,
  );

  if (logoBox && style.logo.dataUrl) {
    const box = logoBox.boxModules;
    const bx = (n - box) / 2;
    if (style.logo.backplate.enabled) {
      parts.push(
        `<rect x="${num(bx)}" y="${num(bx)}" width="${num(box)}" height="${num(box)}" rx="${num(style.logo.backplate.cornerRadius * box)}" fill="${style.logo.backplate.color}"/>`,
      );
    }
    const lx = (n - logoBox.logoModules) / 2;
    const href = style.logo.dataUrl; // validated data:image/...;base64,<base64> by the schema
    parts.push(
      `<image x="${num(lx)}" y="${num(lx)}" width="${num(logoBox.logoModules)}" height="${num(logoBox.logoModules)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#qrlogo)" href="${href}" xlink:href="${href}"/>`,
    );
  }
  parts.push('</g>');

  // Caption
  if (caption.enabled && caption.text.trim().length > 0) {
    const blockTop = caption.position === 'top' ? P + B + T : qy + QR_DESIGN_SIZE;
    const baseline = blockTop + caption.gap * (caption.position === 'top' ? 0.5 : 1) + caption.fontSize;
    const anchor = caption.align === 'left' ? 'start' : caption.align === 'right' ? 'end' : 'middle';
    const tx =
      caption.align === 'left'
        ? qx
        : caption.align === 'right'
          ? qx + QR_DESIGN_SIZE
          : qx + QR_DESIGN_SIZE / 2;
    const color =
      layout.frame.enabled && caption.color === style.foreground
        ? readableTextColor(layout.frame.color)
        : caption.color;
    parts.push(
      `<text x="${num(tx)}" y="${num(baseline)}" font-family="${escapeXml(CAPTION_FONT_FAMILY)}" font-size="${num(caption.fontSize)}" font-weight="${caption.fontWeight}" letter-spacing="${num(caption.letterSpacing)}" text-anchor="${anchor}" fill="${color}">${escapeXml(caption.text)}</text>`,
    );
  }

  parts.push('</svg>');

  return {
    svg: parts.join(''),
    width,
    height,
    design: { width: W, height: H },
    qrRect: { x: qx, y: qy, width: QR_DESIGN_SIZE, height: QR_DESIGN_SIZE },
    logoRect,
    logoCoverage: logoBox ? (logoBox.boxModules * logoBox.boxModules) / (n * n) : 0,
    logoClamped: logoBox?.clamped ?? false,
    clearedModules,
  };
}
