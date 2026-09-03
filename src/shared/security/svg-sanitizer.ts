/**
 * SVG sanitizer for uploaded logos.
 *
 * Strategy: parse with the strict XML parser, then rebuild the document from
 * an allowlist of elements and attributes. Anything that can execute code,
 * load remote resources or embed foreign content is removed; if the document
 * cannot be parsed at all it is rejected outright.
 */
import { parseXml, serializeXml, XmlParseError, type XmlElement, type XmlNode } from './xml-parser';

export const MAX_SVG_LOGO_BYTES = 512 * 1024;

const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'title',
  'desc',
  'symbol',
  'use',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textPath',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'image',
  'style',
  'filter',
  'feGaussianBlur',
  'feOffset',
  'feBlend',
  'feColorMatrix',
  'feComposite',
  'feFlood',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feDropShadow',
  'metadata',
]);

/** Elements that are always removed together with their subtree. */
const FORBIDDEN_ELEMENTS = new Set([
  'script',
  'foreignObject',
  'iframe',
  'embed',
  'object',
  'audio',
  'video',
  'canvas',
  'a',
  'animate',
  'animateMotion',
  'animateTransform',
  'set',
  'feImage',
  'handler',
  'listener',
]);

const ALLOWED_ATTRIBUTES = new Set([
  'id',
  'class',
  'xmlns',
  'xmlns:xlink',
  'xml:space',
  'version',
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'fx',
  'fy',
  'fr',
  'd',
  'points',
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'color',
  'display',
  'visibility',
  'overflow',
  'clip-path',
  'clip-rule',
  'mask',
  'filter',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'patternUnits',
  'patternContentUnits',
  'patternTransform',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
  'preserveAspectRatio',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'text-decoration',
  'dx',
  'dy',
  'rotate',
  'textLength',
  'lengthAdjust',
  'shape-rendering',
  'vector-effect',
  'paint-order',
  'style',
  'href',
  'xlink:href',
  'in',
  'in2',
  'result',
  'stdDeviation',
  'mode',
  'type',
  'values',
  'operator',
  'k1',
  'k2',
  'k3',
  'k4',
  'flood-color',
  'flood-opacity',
  'radius',
  'filterUnits',
  'primitiveUnits',
  'color-interpolation-filters',
  'enable-background',
  'baseProfile',
  'aria-hidden',
  'role',
  'focusable',
]);

const ALLOWED_DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const LOCAL_REF = /^#[A-Za-z_][\w.:-]*$/;
const DANGEROUS_CSS = /(@import|expression\s*\(|javascript:|behavior\s*:|-moz-binding|<|&#|\\[0-9a-fA-F])/i;
const URL_FUNC = /url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

export interface SanitizeSuccess {
  ok: true;
  svg: string;
  /** Human-readable list of removed constructs (for the UI). */
  removed: string[];
  width: number;
  height: number;
}

export interface SanitizeFailure {
  ok: false;
  reason: string;
}

export type SanitizeResult = SanitizeSuccess | SanitizeFailure;

function cssIsSafe(css: string): boolean {
  if (DANGEROUS_CSS.test(css)) return false;
  for (const match of css.matchAll(URL_FUNC)) {
    const target = (match[2] ?? '').trim();
    if (!LOCAL_REF.test(target)) return false;
  }
  return true;
}

function parseLength(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^\s*([0-9]*\.?[0-9]+)\s*(px|pt|mm|cm|in|)\s*$/.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  switch (match[2]) {
    case 'pt':
      return n * (4 / 3);
    case 'mm':
      return n * 3.7795;
    case 'cm':
      return n * 37.795;
    case 'in':
      return n * 96;
    default:
      return n;
  }
}

function sanitizeElement(el: XmlElement, removed: string[], isRoot: boolean): XmlElement | null {
  const localName = el.name.includes(':') ? el.name.split(':')[1] ?? el.name : el.name;
  if (FORBIDDEN_ELEMENTS.has(localName)) {
    removed.push(`<${localName}> element`);
    return null;
  }
  if (!ALLOWED_ELEMENTS.has(localName) || (el.name.includes(':') && !el.name.startsWith('svg:'))) {
    removed.push(`<${el.name}> element`);
    return null;
  }
  if (isRoot && localName !== 'svg') return null;

  const attributes: Record<string, string> = {};
  for (const [rawName, value] of Object.entries(el.attributes)) {
    const name = rawName;
    const lower = name.toLowerCase();
    if (lower.startsWith('on')) {
      removed.push(`${name} event handler`);
      continue;
    }
    if (name.startsWith('xmlns:') && name !== 'xmlns:xlink') {
      continue; // foreign namespace declarations (inkscape, sodipodi, …)
    }
    if (!ALLOWED_ATTRIBUTES.has(name)) {
      if (name.includes(':')) continue; // foreign-namespace attributes are dropped silently
      removed.push(`${name} attribute`);
      continue;
    }
    if (name === 'href' || name === 'xlink:href') {
      if (localName === 'image') {
        if (!ALLOWED_DATA_IMAGE.test(value)) {
          removed.push('external or unsafe image reference');
          continue;
        }
      } else if (!LOCAL_REF.test(value)) {
        removed.push('external reference');
        continue;
      }
    }
    if (name === 'style') {
      if (!cssIsSafe(value)) {
        removed.push('unsafe inline style');
        continue;
      }
    }
    if (
      (name === 'fill' || name === 'stroke' || name === 'clip-path' || name === 'mask' || name === 'filter') &&
      /url\s*\(/i.test(value)
    ) {
      const match = /url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/i.exec(value);
      if (!match || !LOCAL_REF.test((match[2] ?? '').trim())) {
        removed.push(`external ${name} reference`);
        continue;
      }
    }
    if (/[<>]/.test(value)) {
      removed.push(`${name} attribute with markup`);
      continue;
    }
    attributes[name] = value;
  }

  const children: XmlNode[] = [];
  for (const child of el.children) {
    if (child.type === 'comment') continue;
    if (child.type === 'text' || child.type === 'cdata') {
      if (localName === 'style') {
        if (!cssIsSafe(child.value)) {
          removed.push('unsafe stylesheet');
          continue;
        }
        children.push({ type: 'text', value: child.value });
        continue;
      }
      children.push({ type: 'text', value: child.value });
      continue;
    }
    const sanitized = sanitizeElement(child, removed, false);
    if (sanitized) children.push(sanitized);
  }

  return { type: 'element', name: localName, attributes, children };
}

export function sanitizeSvg(source: string): SanitizeResult {
  if (source.length > MAX_SVG_LOGO_BYTES) {
    return { ok: false, reason: `SVG logos must be smaller than ${MAX_SVG_LOGO_BYTES / 1024} KB.` };
  }
  if (/<!ENTITY/i.test(source)) {
    return { ok: false, reason: 'SVG files with custom entities are not allowed.' };
  }
  let root: XmlElement;
  try {
    root = parseXml(source, { maxDepth: 48, maxNodes: 15_000 });
  } catch (error) {
    const message = error instanceof XmlParseError ? error.message : 'The file is not well-formed XML.';
    return { ok: false, reason: `Invalid SVG: ${message}` };
  }
  const rootLocal = root.name.includes(':') ? root.name.split(':')[1] : root.name;
  if (rootLocal !== 'svg') {
    return { ok: false, reason: 'The root element must be <svg>.' };
  }

  const removed: string[] = [];
  const sanitized = sanitizeElement(root, removed, true);
  if (!sanitized) return { ok: false, reason: 'The SVG contained no renderable content.' };

  sanitized.attributes.xmlns = 'http://www.w3.org/2000/svg';
  const usesXlink = JSON.stringify(sanitized).includes('"xlink:href"');
  if (usesXlink) sanitized.attributes['xmlns:xlink'] = 'http://www.w3.org/1999/xlink';
  else delete sanitized.attributes['xmlns:xlink'];

  // Ensure the document has a usable size: viewBox preferred, otherwise derive from width/height.
  let width = 0;
  let height = 0;
  const viewBox = sanitized.attributes.viewBox;
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p)) || (parts[2] ?? 0) <= 0 || (parts[3] ?? 0) <= 0) {
      return { ok: false, reason: 'The SVG viewBox attribute is invalid.' };
    }
    width = parts[2] ?? 0;
    height = parts[3] ?? 0;
  } else {
    const w = parseLength(sanitized.attributes.width);
    const h = parseLength(sanitized.attributes.height);
    if (!w || !h) {
      return { ok: false, reason: 'The SVG needs a viewBox or absolute width and height.' };
    }
    width = w;
    height = h;
    sanitized.attributes.viewBox = `0 0 ${w} ${h}`;
  }
  // Percentage sizes cannot be embedded reliably – normalise to the viewBox size.
  if (!sanitized.attributes.width || /%/.test(sanitized.attributes.width)) sanitized.attributes.width = String(width);
  if (!sanitized.attributes.height || /%/.test(sanitized.attributes.height)) sanitized.attributes.height = String(height);

  const unique = [...new Set(removed)];
  return { ok: true, svg: serializeXml(sanitized), removed: unique, width, height };
}

/** Quick check used by tests and the API: does an SVG string contain anything unsafe? */
export function svgHasUnsafeContent(svg: string): boolean {
  return /<script|<foreignObject|<iframe|javascript:|\son\w+\s*=|@import|xlink:href\s*=\s*["']https?:|href\s*=\s*["']https?:/i.test(
    svg,
  );
}
