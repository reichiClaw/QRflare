import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import { prepare } from '@shared/pipeline';
import {
  base64Encode,
  parseImageDataUrl,
  sniffImageType,
  validateLogoDataUrl,
} from '@shared/security/data-url';
import {
  buildDownloadName,
  contentDisposition,
  sanitizeFilename,
  uniqueFilenames,
} from '@shared/security/filename';
import { sanitizeSvg, svgHasUnsafeContent } from '@shared/security/svg-sanitizer';
import { parseXml, serializeXml, XmlParseError } from '@shared/security/xml-parser';

const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const svgDataUrl = (svg: string) =>
  `data:image/svg+xml;base64,${base64Encode(new TextEncoder().encode(svg))}`;

describe('XML parser', () => {
  it('parses elements, attributes, text, CDATA and entities', () => {
    const root = parseXml(
      `<?xml version="1.0"?><!-- c --><svg a="1" b='two &amp; three'><g><![CDATA[<raw>]]>text &lt; more</g></svg>`,
    );
    expect(root.name).toBe('svg');
    expect(root.attributes).toEqual({ a: '1', b: 'two & three' });
    const g = root.children[0];
    expect(g?.type === 'element' && g.name).toBe('g');
    expect(serializeXml(root)).toBe(
      '<svg a="1" b="two &amp; three"><g><![CDATA[<raw>]]>text &lt; more</g></svg>',
    );
  });
  it('rejects malformed documents', () => {
    for (const bad of [
      '<svg><g></svg>',
      '<svg a=1></svg>',
      '<svg a="1" a="2"></svg>',
      '<svg>&custom;</svg>',
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>',
      '<svg/><svg/>',
      '<svg',
    ]) {
      expect(() => parseXml(bad), bad).toThrow(XmlParseError);
    }
  });
  it('limits depth and node count', () => {
    const deep = `${'<g>'.repeat(100)}${'</g>'.repeat(100)}`;
    expect(() => parseXml(`<svg>${deep}</svg>`, { maxDepth: 20 })).toThrow(/nested too deeply/);
    expect(() => parseXml(`<svg>${'<a/>'.repeat(50)}</svg>`, { maxNodes: 10 })).toThrow(/too many nodes/);
  });
});

describe('SVG sanitizer', () => {
  it('removes scripts, event handlers, foreignObject and external references', () => {
    const evil = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" onload="evil()">
      <script>alert(1)</script>
      <foreignObject><body xmlns="http://www.w3.org/1999/xhtml">hi</body></foreignObject>
      <a href="https://evil.example"><rect width="10" height="10" onclick="x()" fill="url(https://evil.example/p.svg#g)"/></a>
      <image xlink:href="https://evil.example/track.png" width="1" height="1"/>
      <use href="https://evil.example/x.svg#y"/>
      <style>@import url(https://evil.example/e.css); .a{fill:red}</style>
      <rect width="5" height="5" style="fill:url(https://evil.example/x)"/>
      <circle cx="5" cy="5" r="2" fill="#123456"/>
    </svg>`;
    const result = sanitizeSvg(evil);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toMatch(/<script|foreignObject|<a\b|onload|onclick|evil\.example|@import/);
    expect(result.svg).toContain('<circle cx="5" cy="5" r="2" fill="#123456"/>');
    expect(result.removed).toEqual(
      expect.arrayContaining([
        '<script> element',
        '<foreignObject> element',
        '<a> element',
        'onload event handler',
      ]),
    );
    expect(svgHasUnsafeContent(result.svg)).toBe(false);
  });
  it('keeps safe local references and data-URL raster images', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient><clipPath id="c"><rect width="10" height="10"/></clipPath></defs><rect width="20" height="20" fill="url(#g)" clip-path="url(#c)"/><image href="data:image/png;base64,${PNG_1x1}" width="1" height="1"/><use href="#c"/></svg>`;
    const result = sanitizeSvg(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('fill="url(#g)"');
    expect(result.svg).toContain('<image href="data:image/png;base64,');
    expect(result.svg).toContain('viewBox="0 0 20 20"');
    expect(result.removed).toEqual([]);
    expect(result.width).toBe(20);
  });
  it('rejects unparseable SVG, wrong roots, entities and missing size', () => {
    expect(sanitizeSvg('<svg><rect></svg>').ok).toBe(false);
    expect(sanitizeSvg('<html><svg/></html>').ok).toBe(false);
    expect(
      sanitizeSvg(
        '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 1 1">&xxe;</svg>',
      ).ok,
    ).toBe(false);
    expect(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>').ok).toBe(false);
  });
  it('strips foreign-namespace attributes silently', () => {
    const result = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://x" viewBox="0 0 1 1" inkscape:version="1"><rect inkscape:label="x" width="1" height="1"/></svg>`,
    );
    expect(result.ok && result.svg).not.toContain('inkscape');
  });
});

describe('data URLs and file signatures', () => {
  it('sniffs image types from magic bytes', () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="x"/>'))).toBe(
      'image/svg+xml',
    );
    expect(sniffImageType(new TextEncoder().encode('GIF89a'))).toBeNull();
  });
  it('rejects malformed base64, mismatched types and oversize', () => {
    expect(() => parseImageDataUrl('data:image/png;base64,@@@')).toThrow(/base64|data URL/);
    expect(() => parseImageDataUrl('data:image/png;base64,QUJD')).not.toThrow();
    expect(() => parseImageDataUrl('data:image/gif;base64,QUJD')).toThrow(/PNG, JPEG, WebP or SVG/);
    expect(() => validateLogoDataUrl(`data:image/jpeg;base64,${PNG_1x1}`)).toThrow(
      /claims to be image\/jpeg/,
    );
    expect(() =>
      validateLogoDataUrl(
        svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script/></svg>'),
      ),
    ).not.toThrow();
    expect(() => parseImageDataUrl(`data:image/png;base64,${'A'.repeat(2_000_000)}`)).toThrow(/too large/);
  });
  it('sanitizes SVG logos end-to-end through the pipeline', () => {
    const evil = svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>x()</script><rect width="10" height="10"/></svg>',
    );
    const result = prepare({
      content: { type: 'text', value: { text: 'logo' } },
      qr: { errorCorrection: 'H' },
      style: { logo: { enabled: true, dataUrl: evil } },
      output: { format: 'svg' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const embedded = /href="data:image\/svg\+xml;base64,([^"]+)"/.exec(result.render.svg)?.[1] ?? '';
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(embedded), (c) => c.charCodeAt(0)));
    expect(decoded).not.toMatch(/<script/);
    expect(decoded).toContain('<rect width="10" height="10"/>');
  });
});

describe('generated SVG safety', () => {
  it('is well-formed XML, self-contained and escapes caption text', () => {
    const result = prepare({
      content: { type: 'text', value: { text: 'safe' } },
      style: { layout: { caption: { enabled: true, text: '<script>alert("x")</script> & "quotes"' } } },
      output: { format: 'svg' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const svg = result.render.svg;
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quotes&quot;');
    expect(svg).not.toMatch(/href="https?:/);
    expect(svg).not.toMatch(/url\(\s*['"]?https?:/);
    const errors: string[] = [];
    const doc = new DOMParser({ onError: (_level, message) => errors.push(message) }).parseFromString(
      svg,
      'image/svg+xml',
    );
    expect(errors).toEqual([]);
    expect(doc.documentElement?.tagName).toBe('svg');
    expect(doc.documentElement?.getAttribute('viewBox')).toMatch(/^0 0 \d/);
  });
});

describe('filenames', () => {
  it('sanitizes names and enforces real extensions', () => {
    expect(sanitizeFilename('  My Café / ..\\evil:name?.png ')).toBe('My-Cafe.evil-name.png');
    expect(sanitizeFilename('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeFilename('CON')).toBe('qr-code');
    expect(sanitizeFilename('')).toBe('qr-code');
    expect(buildDownloadName('menu.jpg', 'png')).toBe('menu.png');
    expect(buildDownloadName('menu.PNG', 'jpeg')).toBe('menu.jpg');
    expect(buildDownloadName(undefined, 'svg', 'url-qr')).toBe('url-qr.svg');
    expect(buildDownloadName('x'.repeat(200), 'png').length).toBeLessThanOrEqual(84);
  });
  it('builds Content-Disposition with ASCII fallback', () => {
    expect(contentDisposition('café ✓.png')).toBe(
      `attachment; filename="caf_ _.png"; filename*=UTF-8''caf%C3%A9%20%E2%9C%93.png`,
    );
    expect(contentDisposition('a"b.png', true)).toMatch(/^inline; filename="a_b.png"/);
  });
  it('makes batch filenames unique', () => {
    expect(uniqueFilenames(['a.png', 'a.png', 'A.PNG', 'b.svg', 'a-2.png'])).toEqual([
      'a.png',
      'a-2.png',
      'A-3.PNG',
      'b.svg',
      'a-2-2.png',
    ]);
  });
});
