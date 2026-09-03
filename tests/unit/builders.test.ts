import { describe, expect, it } from 'vitest';

import { buildPayload } from '@shared/content/builders';
import type { ContentInput } from '@shared/content/schemas';
import {
  escapeMeCard,
  escapeVText,
  escapeWifi,
  isValidIban,
  normalizePhoneNumber,
  normalizeUrl,
  zonedTimeToUtc,
} from '@shared/content/utils';

function payload(content: ContentInput): string {
  const result = buildPayload(content);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.payload;
}

function issues(content: unknown): string[] {
  const result = buildPayload(content);
  return result.ok ? [] : result.issues.map((i) => `${i.path}: ${i.message}`);
}

describe('text / raw / json', () => {
  it('encodes text verbatim including newlines and emoji', () => {
    expect(payload({ type: 'text', value: { text: 'line1\nline2 🚀' } })).toBe('line1\nline2 🚀');
  });
  it('rejects empty text', () => {
    expect(issues({ type: 'text', value: { text: '' } })[0]).toMatch(/text/);
  });
  it('minifies JSON and rejects invalid JSON', () => {
    expect(payload({ type: 'json', value: { json: '{ "a" : 1 ,\n "b": [1, 2] }', minify: true } })).toBe(
      '{"a":1,"b":[1,2]}',
    );
    expect(payload({ type: 'json', value: { json: '{ "a" : 1 }', minify: false } })).toBe('{ "a" : 1 }');
    expect(issues({ type: 'json', value: { json: '{oops', minify: true } })[0]).toMatch(/Invalid JSON/);
  });
  it('raw payload is untouched', () => {
    expect(payload({ type: 'raw', value: { payload: 'WIFI:T:WPA;;' } })).toBe('WIFI:T:WPA;;');
  });
});

describe('url', () => {
  it('adds https:// and normalizes', () => {
    expect(payload({ type: 'url', value: { url: 'example.com/path?x=1' } })).toBe(
      'https://example.com/path?x=1',
    );
    expect(normalizeUrl('Example.COM')).toBe('https://example.com/');
  });
  it('preserves custom schemes', () => {
    expect(payload({ type: 'url', value: { url: 'myapp://open/item/42' } })).toBe('myapp://open/item/42');
  });
  it('rejects invalid URLs and URLs with spaces', () => {
    expect(issues({ type: 'url', value: { url: 'not a url' } })[0]).toMatch(/valid URL/);
    expect(issues({ type: 'url', value: { url: 'nodot', autoHttps: true } })[0]).toMatch(/valid URL/);
    expect(issues({ type: 'url', value: { url: 'example.com', autoHttps: false } })[0]).toMatch(/valid URL/);
  });
  it('warns about plain http', () => {
    const result = buildPayload({ type: 'url', value: { url: 'http://example.com' } });
    expect(result.ok && result.warnings[0]).toMatch(/http:\/\//);
  });
});

describe('email / phone / sms / whatsapp', () => {
  it('builds mailto with encoded params and multiple recipients', () => {
    expect(
      payload({
        type: 'email',
        value: {
          to: 'a@example.com, b@example.com',
          cc: 'c@example.com',
          bcc: '',
          subject: 'Hi & bye',
          body: 'Line 1\nLine 2 ✓',
        },
      }),
    ).toBe(
      'mailto:a@example.com,b@example.com?cc=c%40example.com&subject=Hi%20%26%20bye&body=Line%201%0ALine%202%20%E2%9C%93',
    );
  });
  it('rejects invalid email addresses', () => {
    expect(issues({ type: 'email', value: { to: 'nope' } })[0]).toMatch(/to/);
    expect(issues({ type: 'email', value: { to: 'a@example.com', cc: 'bad' } })[0]).toMatch(/cc/);
  });
  it('normalizes phone numbers into tel: URIs', () => {
    expect(payload({ type: 'phone', value: { number: '+1 (415) 555-0132' } })).toBe('tel:+14155550132');
    expect(normalizePhoneNumber('0049 30 1234')).toBe('0049301234');
    expect(issues({ type: 'phone', value: { number: '12' } })[0]).toMatch(/digits/);
  });
  it('builds sms: URIs with body', () => {
    expect(
      payload({ type: 'sms', value: { number: '+14155550132', message: 'Hello there & friends' } }),
    ).toBe('sms:+14155550132?body=Hello%20there%20%26%20friends');
    expect(payload({ type: 'sms', value: { number: '+14155550132', message: '' } })).toBe('sms:+14155550132');
  });
  it('builds wa.me links without the plus sign', () => {
    expect(payload({ type: 'whatsapp', value: { number: '+1 415 555 0132', message: 'Hi from QR' } })).toBe(
      'https://wa.me/14155550132?text=Hi%20from%20QR',
    );
  });
});

describe('wifi', () => {
  it('escapes special characters and quotes hex-looking values', () => {
    expect(escapeWifi('a;b,c:d"e\\f')).toBe('a\\;b\\,c\\:d\\"e\\\\f');
    expect(escapeWifi('CAFE')).toBe('"CAFE"');
    expect(
      payload({
        type: 'wifi',
        value: { ssid: 'My;Net', password: 'p@ss;word', encryption: 'WPA', hidden: true },
      }),
    ).toBe('WIFI:T:WPA;S:My\\;Net;P:p@ss\\;word;H:true;;');
  });
  it('omits the password for open networks and validates WPA length', () => {
    expect(
      payload({
        type: 'wifi',
        value: { ssid: 'Open Net', password: '', encryption: 'nopass', hidden: false },
      }),
    ).toBe('WIFI:T:nopass;S:Open Net;;');
    expect(issues({ type: 'wifi', value: { ssid: 'X', password: 'short', encryption: 'WPA' } })[0]).toMatch(
      /8 characters/,
    );
    expect(issues({ type: 'wifi', value: { ssid: 'X', password: '', encryption: 'WEP' } })[0]).toMatch(
      /password/i,
    );
  });
});

describe('vcard / mecard', () => {
  it('escapes vCard text', () => {
    expect(escapeVText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
  it('builds a vCard 3.0 with all fields', () => {
    const out = payload({
      type: 'vcard',
      value: {
        version: '3.0',
        firstName: 'Ada',
        lastName: 'Lovelace',
        organization: 'Engines, Ltd',
        title: 'Mathematician',
        phones: [
          { type: 'CELL', number: '+44 20 7946 0958' },
          { type: 'WORK', number: '+44 20 7946 0000' },
        ],
        emails: [{ type: 'WORK', address: 'ada@example.com' }],
        website: 'example.com',
        street: '12 Byron St',
        city: 'London',
        postalCode: 'W1J 5AA',
        region: '',
        country: 'UK',
        birthday: '1815-12-10',
        notes: 'First; programmer',
      },
    });
    const lines = out.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCARD');
    expect(lines[1]).toBe('VERSION:3.0');
    expect(lines).toContain('N:Lovelace;Ada;;;');
    expect(lines).toContain('FN:Ada Lovelace');
    expect(lines).toContain('ORG:Engines\\, Ltd');
    expect(lines).toContain('TEL;TYPE=CELL:+442079460958');
    expect(lines).toContain('TEL;TYPE=WORK:+442079460000');
    expect(lines).toContain('EMAIL;TYPE=WORK:ada@example.com');
    expect(lines).toContain('URL:https://example.com/');
    expect(lines).toContain('ADR;TYPE=WORK:;;12 Byron St;London;;W1J 5AA;UK');
    expect(lines).toContain('BDAY:1815-12-10');
    expect(lines).toContain('NOTE:First\\; programmer');
    expect(lines[lines.length - 1]).toBe('END:VCARD');
  });
  it('builds vCard 4.0 with tel: URIs and compact birthday', () => {
    const out = payload({
      type: 'vcard',
      value: {
        version: '4.0',
        firstName: 'Ada',
        lastName: 'L',
        phones: [{ type: 'CELL', number: '+1 555' }],
        emails: [],
        birthday: '1815-12-10',
      },
    });
    expect(out).toContain('TEL;TYPE=cell;VALUE=uri:tel:+1555');
    expect(out).toContain('BDAY:18151210');
  });
  it('embeds a small photo and omits an oversized one with a warning', () => {
    const tiny = `data:image/png;base64,${'A'.repeat(200)}`;
    const small = buildPayload({ type: 'vcard', value: { firstName: 'A', photo: tiny } });
    expect(small.ok && small.payload).toContain('PHOTO;ENCODING=b;TYPE=PNG:');
    const huge = `data:image/png;base64,${'A'.repeat(4000)}`;
    const big = buildPayload({ type: 'vcard', value: { firstName: 'A', photo: huge } }, { maxBytes: 1273 });
    expect(big.ok && !big.payload.includes('PHOTO')).toBe(true);
    expect(big.ok && big.warnings[0]).toMatch(/photo was omitted/);
  });
  it('requires a name or organization and validates phones', () => {
    expect(issues({ type: 'vcard', value: {} })[0]).toMatch(/name or an organization/);
    expect(
      issues({ type: 'vcard', value: { firstName: 'A', phones: [{ type: 'CELL', number: 'abc' }] } })[0],
    ).toMatch(/phones.0.number/);
  });
  it('builds MeCard with escaping', () => {
    expect(escapeMeCard('a:b;c,d\\')).toBe('a\\:b\\;c\\,d\\\\');
    expect(
      payload({
        type: 'mecard',
        value: {
          lastName: 'Lovelace',
          firstName: 'Ada',
          phone: '+44 20 7946 0958',
          email: 'ada@example.com',
          address: '12 Byron St, London',
          website: 'example.com',
          note: 'Note: x',
        },
      }),
    ).toBe(
      'MECARD:N:Lovelace,Ada;TEL:+442079460958;EMAIL:ada@example.com;ADR:12 Byron St\\, London;URL:https\\://example.com/;NOTE:Note\\: x;;',
    );
  });
});

describe('event (iCalendar)', () => {
  it('converts zoned times to UTC and escapes text', () => {
    const out = payload({
      type: 'event',
      value: {
        title: 'Launch; party',
        start: '2026-10-01T10:00',
        end: '2026-10-01T11:30',
        allDay: false,
        timeZone: 'Europe/Berlin',
        location: 'Hall, A',
        description: 'Line1\nLine2',
        url: 'example.com/x',
      },
    });
    const lines = out.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('BEGIN:VEVENT');
    expect(lines).toContain('DTSTART:20261001T080000Z'); // CEST is UTC+2
    expect(lines).toContain('DTEND:20261001T093000Z');
    expect(lines).toContain('SUMMARY:Launch\\; party');
    expect(lines).toContain('LOCATION:Hall\\, A');
    expect(lines).toContain('DESCRIPTION:Line1\\nLine2');
    expect(lines).toContain('URL:https://example.com/x');
    expect(lines.some((l) => l.startsWith('UID:'))).toBe(true);
    expect(lines.some((l) => l.startsWith('DTSTAMP:'))).toBe(true);
    expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
  });
  it('handles all-day events with exclusive DTEND', () => {
    const out = payload({
      type: 'event',
      value: { title: 'Holiday', start: '2026-12-24', end: '2026-12-26', allDay: true },
    });
    expect(out).toContain('DTSTART;VALUE=DATE:20261224');
    expect(out).toContain('DTEND;VALUE=DATE:20261227');
  });
  it('uses floating time when no zone is given and warns', () => {
    const result = buildPayload({ type: 'event', value: { title: 'T', start: '2026-01-01T09:00' } });
    expect(result.ok && result.payload).toContain('DTSTART:20260101T090000');
    expect(result.ok && result.warnings[0]).toMatch(/floating/);
  });
  it('handles DST correctly', () => {
    expect(zonedTimeToUtc('2026-01-15T12:00', 'Europe/Berlin')?.toISOString()).toBe(
      '2026-01-15T11:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-07-15T12:00', 'America/New_York')?.toISOString()).toBe(
      '2026-07-15T16:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-07-15T12:00', 'Not/AZone')).toBeNull();
  });
  it('validates ordering and time zone', () => {
    expect(
      issues({ type: 'event', value: { title: 'T', start: '2026-01-02T09:00', end: '2026-01-01T09:00' } })[0],
    ).toMatch(/End must be after/);
    expect(
      issues({
        type: 'event',
        value: { title: 'T', start: '2026-01-02T09:00', timeZone: 'Mars/Olympus' },
      })[0],
    ).toMatch(/time zone/i);
  });
});

describe('geo', () => {
  it('builds geo URIs with optional label', () => {
    expect(payload({ type: 'geo', value: { latitude: 48.858844, longitude: 2.294351 } })).toBe(
      'geo:48.858844,2.294351',
    );
    expect(
      payload({
        type: 'geo',
        value: {
          latitude: '48.8588440001',
          longitude: 2.2943510001,
          label: 'Eiffel Tower',
        },
      }),
    ).toBe('geo:48.858844,2.294351?q=48.858844,2.294351(Eiffel%20Tower)');
    expect(issues({ type: 'geo', value: { latitude: 91, longitude: 0 } })[0]).toMatch(/Latitude/);
  });
});

describe('epc (SEPA)', () => {
  it('validates IBANs with mod-97', () => {
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(isValidIban('BE72000000001616')).toBe(true);
    expect(isValidIban('DE89370400440532013001')).toBe(false);
    expect(isValidIban('XX00')).toBe(false);
  });
  it('builds the EPC069-12 payload', () => {
    const out = payload({
      type: 'epc',
      value: {
        name: 'Red Cross of Belgium',
        iban: 'be72 0000 0000 1616',
        bic: 'BPOTBEB1',
        amount: '12.5',
        currency: 'EUR',
        purpose: 'CHAR',
        reference: '',
        remittance: 'Urgency fund',
        information: '',
      },
    });
    expect(out.split('\n')).toEqual([
      'BCD',
      '002',
      '1',
      'SCT',
      'BPOTBEB1',
      'Red Cross of Belgium',
      'BE72000000001616',
      'EUR12.50',
      'CHAR',
      '',
      'Urgency fund',
    ]);
  });
  it('drops trailing empty lines but keeps required ones', () => {
    const out = payload({ type: 'epc', value: { name: 'Alice', iban: 'DE89370400440532013000' } });
    expect(out.split('\n')).toEqual(['BCD', '002', '1', 'SCT', '', 'Alice', 'DE89370400440532013000']);
  });
  it('rejects invalid fields', () => {
    expect(issues({ type: 'epc', value: { name: 'A', iban: 'DE00' } })[0]).toMatch(/IBAN/);
    expect(
      issues({ type: 'epc', value: { name: 'A', iban: 'DE89370400440532013000', amount: '0.001' } })[0],
    ).toMatch(/Amount/);
    expect(
      issues({
        type: 'epc',
        value: { name: 'A', iban: 'DE89370400440532013000', reference: 'R', remittance: 'T' },
      })[0],
    ).toMatch(/either/);
    expect(
      issues({ type: 'epc', value: { name: 'A', iban: 'DE89370400440532013000', bic: 'BAD' } })[0],
    ).toMatch(/BIC/);
  });
});

describe('bitcoin / ethereum', () => {
  it('builds BIP-21 URIs', () => {
    expect(
      payload({
        type: 'bitcoin',
        value: {
          address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
          amount: '0.00100000',
          label: 'Coffee shop',
          message: 'Thanks!',
        },
      }),
    ).toBe(
      'bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.001&label=Coffee%20shop&message=Thanks%21',
    );
    expect(payload({ type: 'bitcoin', value: { address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2' } })).toBe(
      'bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    );
    expect(issues({ type: 'bitcoin', value: { address: 'not-an-address' } })[0]).toMatch(/Bitcoin address/);
  });
  it('builds EIP-681 URIs for ETH and tokens', () => {
    const addr = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
    expect(payload({ type: 'ethereum', value: { address: addr, chainId: '1', amount: '0.5' } })).toBe(
      `ethereum:${addr}@1?value=500000000000000000`,
    );
    expect(payload({ type: 'ethereum', value: { address: addr } })).toBe(`ethereum:${addr}`);
    const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    expect(
      payload({
        type: 'ethereum',
        value: { address: addr, chainId: '1', token: { contract: usdc, amount: '25.5', decimals: 6 } },
      }),
    ).toBe(`ethereum:${usdc}@1/transfer?address=${addr}&uint256=25500000`);
    expect(issues({ type: 'ethereum', value: { address: '0x123' } })[0]).toMatch(/Ethereum address/);
    expect(
      issues({
        type: 'ethereum',
        value: { address: addr, amount: '1', token: { contract: usdc, amount: '1' } },
      })[0],
    ).toMatch(/cannot also send ETH/);
  });
});

describe('otpauth', () => {
  it('builds TOTP and HOTP URIs with a normalized secret', () => {
    expect(
      payload({
        type: 'otpauth',
        value: {
          type: 'totp',
          account: 'alice@example.com',
          issuer: 'Example Corp',
          secret: 'jbsw y3dp ehpk 3pxp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          counter: 0,
        },
      }),
    ).toBe(
      'otpauth://totp/Example%20Corp:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example%20Corp&algorithm=SHA1&digits=6&period=30',
    );
    expect(
      payload({
        type: 'otpauth',
        value: { type: 'hotp', account: 'bob', secret: 'JBSWY3DPEHPK3PXP', counter: 7 },
      }),
    ).toBe('otpauth://hotp/bob?secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&counter=7');
    expect(issues({ type: 'otpauth', value: { account: 'a', secret: 'not base32!' } })[0]).toMatch(/base32/);
    expect(
      issues({ type: 'otpauth', value: { account: 'a', secret: 'JBSWY3DPEHPK3PXP', digits: 9 } })[0],
    ).toMatch(/Digits/);
  });
});

describe('social / app links / custom URI', () => {
  it('builds profile URLs from handles and keeps full URLs', () => {
    expect(payload({ type: 'social', value: { network: 'instagram', handle: '@edgeqr' } })).toBe(
      'https://www.instagram.com/edgeqr',
    );
    expect(payload({ type: 'social', value: { network: 'x', handle: 'edgeqr' } })).toBe(
      'https://x.com/edgeqr',
    );
    expect(payload({ type: 'social', value: { network: 'youtube', handle: '@channel' } })).toBe(
      'https://www.youtube.com/@channel',
    );
    expect(
      payload({ type: 'social', value: { network: 'linkedin', handle: 'https://www.linkedin.com/in/ada' } }),
    ).toBe('https://www.linkedin.com/in/ada');
    expect(payload({ type: 'social', value: { network: 'signal', handle: '+1 415 555 0132' } })).toBe(
      'https://signal.me/#p/+14155550132',
    );
    expect(payload({ type: 'social', value: { network: 'telegram', handle: 'edgeqr' } })).toBe(
      'https://t.me/edgeqr',
    );
    expect(payload({ type: 'social', value: { network: 'custom', handle: 'mastodon.social/@edgeqr' } })).toBe(
      'https://mastodon.social/@edgeqr',
    );
    expect(issues({ type: 'social', value: { network: 'custom', handle: 'nope' } })[0]).toMatch(
      /profile URL/,
    );
  });
  it('builds app links', () => {
    expect(payload({ type: 'applink', value: { kind: 'playstore', value: 'com.example.app' } })).toBe(
      'https://play.google.com/store/apps/details?id=com.example.app',
    );
    expect(
      payload({ type: 'applink', value: { kind: 'appstore', value: 'https://apps.apple.com/app/id123' } }),
    ).toBe('https://apps.apple.com/app/id123');
    expect(payload({ type: 'applink', value: { kind: 'deeplink', value: 'myapp://open/42' } })).toBe(
      'myapp://open/42',
    );
    expect(issues({ type: 'applink', value: { kind: 'appstore', value: 'https://example.com' } })[0]).toMatch(
      /apps.apple.com/,
    );
    expect(issues({ type: 'applink', value: { kind: 'universal', value: 'http://example.com' } })[0]).toMatch(
      /https/,
    );
  });
  it('composes custom URIs with encoded query parameters', () => {
    expect(
      payload({
        type: 'customuri',
        value: {
          mode: 'builder',
          scheme: 'myapp',
          authority: 'open',
          path: 'item/42 a',
          query: [
            { key: 'ref', value: 'poster & flyer' },
            { key: '', value: 'ignored' },
          ],
        },
      }),
    ).toBe('myapp://open/item/42%20a?ref=poster%20%26%20flyer');
    expect(payload({ type: 'customuri', value: { mode: 'raw', raw: ' spotify:track:abc ' } })).toBe(
      'spotify:track:abc',
    );
    expect(issues({ type: 'customuri', value: { mode: 'builder', scheme: '1bad' } })[0]).toMatch(/Scheme/);
    expect(issues({ type: 'customuri', value: { mode: 'raw', raw: 'no scheme here' } })[0]).toMatch(
      /complete URI/,
    );
  });
});

describe('schema hardening', () => {
  it('rejects unknown keys and unknown types', () => {
    expect(issues({ type: 'url', value: { url: 'example.com', evil: true } }).length).toBeGreaterThan(0);
    expect(issues({ type: 'unknown', value: {} }).length).toBeGreaterThan(0);
    expect(issues(null).length).toBeGreaterThan(0);
  });
});
