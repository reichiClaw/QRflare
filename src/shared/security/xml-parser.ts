/**
 * Minimal, strict, non-validating XML parser that works in browsers, Node and
 * Cloudflare Workers (no DOM required). It is used by the SVG sanitizer and by
 * tests that need to inspect generated SVG documents.
 *
 * Supported: elements, attributes (quoted), text, CDATA, comments, processing
 * instructions and a DOCTYPE without an internal subset. Entities: the five
 * predefined XML entities and numeric character references. Anything else
 * (unclosed tags, mismatched tags, duplicate attributes, custom entities,
 * internal DTD subsets) raises XmlParseError, which the sanitizer treats as
 * "reject the file".
 */

export interface XmlElement {
  type: 'element';
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
}

export interface XmlText {
  type: 'text';
  value: string;
}

export interface XmlCData {
  type: 'cdata';
  value: string;
}

export interface XmlComment {
  type: 'comment';
  value: string;
}

export type XmlNode = XmlElement | XmlText | XmlCData | XmlComment;

export class XmlParseError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(`${message} (at offset ${position})`);
    this.name = 'XmlParseError';
  }
}

const NAME_START = /[A-Za-z_:\u00C0-\uFFFF]/;
const NAME_CHAR = /[A-Za-z0-9_:.\u00B7\u00C0-\uFFFF-]/;

export function decodeEntities(value: string, position = 0): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    switch (body) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        throw new XmlParseError(`Unknown entity ${whole}`, position);
    }
  });
}

export function parseXml(input: string, options: { maxDepth?: number; maxNodes?: number } = {}): XmlElement {
  const maxDepth = options.maxDepth ?? 64;
  const maxNodes = options.maxNodes ?? 20_000;
  let pos = 0;
  let nodeCount = 0;
  const src = input.replace(/^\uFEFF/, '');

  const fail = (msg: string): never => {
    throw new XmlParseError(msg, pos);
  };
  const peek = (s: string) => src.startsWith(s, pos);
  const skipWs = () => {
    while (pos < src.length && /\s/.test(src[pos] ?? '')) pos++;
  };
  const readName = (): string => {
    const start = pos;
    if (!NAME_START.test(src[pos] ?? '')) fail('Expected a name');
    pos++;
    while (pos < src.length && NAME_CHAR.test(src[pos] ?? '')) pos++;
    return src.slice(start, pos);
  };
  const bump = () => {
    if (++nodeCount > maxNodes) fail('Document has too many nodes');
  };

  const readAttributes = (): Record<string, string> => {
    const attrs: Record<string, string> = {};
    for (;;) {
      skipWs();
      if (peek('/>') || peek('>')) return attrs;
      if (pos >= src.length) fail('Unexpected end of input in tag');
      const name = readName();
      skipWs();
      if (src[pos] !== '=') fail(`Attribute "${name}" has no value`);
      pos++;
      skipWs();
      const quote = src[pos];
      if (quote !== '"' && quote !== "'") return fail(`Attribute "${name}" value must be quoted`);
      pos++;
      const end = src.indexOf(quote, pos);
      if (end === -1) fail('Unterminated attribute value');
      const raw = src.slice(pos, end);
      if (raw.includes('<')) fail('"<" is not allowed in attribute values');
      if (Object.prototype.hasOwnProperty.call(attrs, name)) fail(`Duplicate attribute "${name}"`);
      attrs[name] = decodeEntities(raw, pos);
      pos = end + 1;
    }
  };

  const parseElement = (depth: number): XmlElement => {
    if (depth > maxDepth) fail('Document is nested too deeply');
    bump();
    pos++; // '<'
    const name = readName();
    const attributes = readAttributes();
    const element: XmlElement = { type: 'element', name, attributes, children: [] };
    if (peek('/>')) {
      pos += 2;
      return element;
    }
    pos++; // '>'
    for (;;) {
      if (pos >= src.length) fail(`Unclosed element <${name}>`);
      if (peek('</')) {
        pos += 2;
        const closing = readName();
        if (closing !== name) fail(`Mismatched closing tag </${closing}> for <${name}>`);
        skipWs();
        if (src[pos] !== '>') fail('Malformed closing tag');
        pos++;
        return element;
      }
      if (peek('<!--')) {
        const end = src.indexOf('-->', pos + 4);
        if (end === -1) fail('Unterminated comment');
        bump();
        element.children.push({ type: 'comment', value: src.slice(pos + 4, end) });
        pos = end + 3;
        continue;
      }
      if (peek('<![CDATA[')) {
        const end = src.indexOf(']]>', pos + 9);
        if (end === -1) fail('Unterminated CDATA section');
        bump();
        element.children.push({ type: 'cdata', value: src.slice(pos + 9, end) });
        pos = end + 3;
        continue;
      }
      if (peek('<?')) {
        const end = src.indexOf('?>', pos + 2);
        if (end === -1) fail('Unterminated processing instruction');
        pos = end + 2;
        continue;
      }
      if (peek('<!')) fail('DOCTYPE declarations are only allowed in the prolog');
      if (src[pos] === '<') {
        element.children.push(parseElement(depth + 1));
        continue;
      }
      const next = src.indexOf('<', pos);
      const end = next === -1 ? src.length : next;
      const raw = src.slice(pos, end);
      bump();
      element.children.push({ type: 'text', value: decodeEntities(raw, pos) });
      pos = end;
    }
  };

  // Prolog: XML declaration, comments, PIs, at most one DOCTYPE without an internal subset.
  for (;;) {
    skipWs();
    if (peek('<?')) {
      const end = src.indexOf('?>', pos);
      if (end === -1) fail('Unterminated XML declaration');
      pos = end + 2;
      continue;
    }
    if (peek('<!--')) {
      const end = src.indexOf('-->', pos);
      if (end === -1) fail('Unterminated comment');
      pos = end + 3;
      continue;
    }
    if (peek('<!DOCTYPE')) {
      const end = src.indexOf('>', pos);
      if (end === -1) fail('Unterminated DOCTYPE');
      const doctype = src.slice(pos, end);
      if (doctype.includes('[')) fail('DOCTYPE internal subsets are not allowed');
      pos = end + 1;
      continue;
    }
    break;
  }

  if (src[pos] !== '<') fail('Expected root element');
  const root = parseElement(0);
  skipWs();
  while (pos < src.length) {
    if (peek('<!--')) {
      const end = src.indexOf('-->', pos);
      if (end === -1) fail('Unterminated comment');
      pos = end + 3;
      skipWs();
      continue;
    }
    fail('Content after the root element');
  }
  return root;
}

export function serializeXml(node: XmlNode): string {
  switch (node.type) {
    case 'text':
      return escapeText(node.value);
    case 'cdata':
      return `<![CDATA[${node.value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
    case 'comment':
      return '';
    case 'element': {
      const attrs = Object.entries(node.attributes)
        .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
        .join('');
      if (node.children.length === 0) return `<${node.name}${attrs}/>`;
      return `<${node.name}${attrs}>${node.children.map(serializeXml).join('')}</${node.name}>`;
    }
  }
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

export function* walkElements(node: XmlNode): Generator<XmlElement> {
  if (node.type !== 'element') return;
  yield node;
  for (const child of node.children) yield* walkElements(child);
}
