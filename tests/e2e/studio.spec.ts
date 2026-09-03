import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function collectConsoleErrors(page: Page): ConsoleMessage[] {
  const errors: ConsoleMessage[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message);
  });
  page.on('pageerror', (error) => {
    errors.push({ text: () => error.message, type: () => 'pageerror' } as unknown as ConsoleMessage);
  });
  return errors;
}

async function openStudio(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /what should the code contain/i })).toBeVisible();
}

async function goToMobileTab(page: Page, tab: 'content' | 'preview' | 'design' | 'export') {
  const button = page.getByTestId(`mobile-tab-${tab}`);
  if (await button.isVisible()) await button.click();
}

async function enterUrl(page: Page, url: string) {
  await goToMobileTab(page, 'content');
  const input = page.getByRole('textbox', { name: 'Website URL' });
  await input.fill(url);
  await expect(page.getByTestId('qr-preview').first()).toBeVisible();
}

async function download(page: Page, format: 'PNG' | 'JPG' | 'SVG') {
  await goToMobileTab(page, 'export');
  await page.getByRole('button', { name: format, exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-button').click();
  const dl = await downloadPromise;
  const stream = await dl.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
  return { name: dl.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

test.describe('EdgeQR Studio', () => {
  test('creates a URL QR code and downloads PNG, JPG and SVG with genuine data', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await openStudio(page);
    await enterUrl(page, 'https://example.com/e2e');

    const png = await download(page, 'PNG');
    expect(png.name).toMatch(/\.png$/);
    expect(png.bytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);

    const jpg = await download(page, 'JPG');
    expect(jpg.name).toMatch(/\.jpg$/);
    expect(jpg.bytes[0]).toBe(0xff);
    expect(jpg.bytes[1]).toBe(0xd8);
    expect(jpg.bytes[jpg.bytes.length - 2]).toBe(0xff);
    expect(jpg.bytes[jpg.bytes.length - 1]).toBe(0xd9);

    const svg = await download(page, 'SVG');
    expect(svg.name).toMatch(/\.svg$/);
    const text = svg.bytes.toString('utf8');
    expect(text.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(text).toContain('viewBox="0 0 ');
    expect(text).not.toMatch(/<script/i);
    expect(text).not.toMatch(/href="https?:/);

    expect(errors.map((e) => e.text())).toEqual([]);
  });

  test('changes module style and colours and reflects them in the SVG export', async ({ page }) => {
    await openStudio(page);
    await enterUrl(page, 'https://example.com/style');
    await goToMobileTab(page, 'design');
    await page.getByRole('radiogroup', { name: 'Module style' }).getByRole('radio', { name: 'Dots' }).click();
    await page.getByRole('tab', { name: 'Colours' }).click();
    const fg = page.getByLabel('Foreground', { exact: true });
    await fg.fill('#1D4ED8');
    await fg.press('Enter');
    const svg = await download(page, 'SVG');
    const text = svg.bytes.toString('utf8');
    expect(text).toContain('#1D4ED8');
    expect(text).toMatch(/A\.5 \.5 0 0 1/); // quarter arcs of circular dot modules
  });

  test('uploads a safe SVG logo and embeds it in the export', async ({ page }) => {
    await openStudio(page);
    await enterUrl(page, 'https://example.com/logo');
    await goToMobileTab(page, 'design');
    await page.getByRole('tab', { name: 'Logo' }).click();
    const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10" fill="#2563EB" onclick="x()"/></svg>`;
    await page
      .getByTestId('logo-input')
      .setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(logo) });
    await expect(page.getByAltText('Uploaded logo preview')).toBeVisible();
    const svg = await download(page, 'SVG');
    const text = svg.bytes.toString('utf8');
    expect(text).toContain('<image');
    expect(text).toContain('data:image/svg+xml;base64,');
    const embedded = /data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/.exec(text)?.[1] ?? '';
    const decoded = Buffer.from(embedded, 'base64').toString('utf8');
    expect(decoded).not.toMatch(/<script/i);
    expect(decoded).not.toMatch(/onclick/i);
  });

  test('switches between dark and light themes', async ({ page }) => {
    await openStudio(page);
    const html = page.locator('html');
    const toggle = page.getByTestId('theme-toggle');
    // The toggle cycles light → dark → system (initial mode is "system").
    for (let i = 0; i < 3; i++) {
      if (/dark theme/i.test((await toggle.getAttribute('aria-label')) ?? '')) break;
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute('aria-label', /dark theme/i);
    await expect(html).toHaveClass(/dark/);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', /system theme/i);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', /light theme/i);
    await expect(html).not.toHaveClass(/dark/);
    await page.reload();
    await expect(html).not.toHaveClass(/dark/);
  });

  test('supports keyboard navigation with visible focus', async ({ page }) => {
    await openStudio(page);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    // Tab into the content area and type a URL purely with the keyboard.
    const urlInput = page.getByRole('textbox', { name: 'Website URL' });
    await urlInput.focus();
    await page.keyboard.type('example.org');
    await expect(page.getByTestId('qr-preview').first()).toBeVisible();
    const outline = await urlInput.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('shows reliability warnings for risky styling and invalid content', async ({ page }) => {
    await openStudio(page);
    await enterUrl(page, 'https://example.com/risky');
    await goToMobileTab(page, 'design');
    await page.getByRole('tab', { name: 'Colours' }).click();
    const fg = page.getByLabel('Foreground', { exact: true });
    await fg.fill('#DDDDDD');
    await fg.press('Enter');
    await goToMobileTab(page, 'preview');
    const reliability = page.getByTestId('reliability');
    await expect(reliability).toContainText(/contrast/i);
    await expect(reliability).toContainText(/risky/i);
    await page.getByRole('button', { name: 'Safe defaults' }).click();
    await expect(reliability).toContainText(/excellent/i);

    await goToMobileTab(page, 'content');
    await page.getByRole('textbox', { name: 'Website URL' }).fill('not a url with spaces');
    await goToMobileTab(page, 'preview');
    await expect(page.getByTestId('reliability')).toContainText(/invalid/i);
    await goToMobileTab(page, 'export');
    await expect(page.getByTestId('download-button')).toBeDisabled();
  });

  test('has no horizontal overflow and works at a mobile viewport', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), 'mobile project only');
    const errors = collectConsoleErrors(page);
    await openStudio(page);
    await enterUrl(page, 'https://example.com/mobile');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await goToMobileTab(page, 'export');
    await expect(page.getByTestId('download-button')).toBeVisible();
    await expect(page.getByTestId('download-button')).toBeEnabled();
    expect(errors.map((e) => e.text())).toEqual([]);
  });

  test('serves the API, manifest and OpenAPI document', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBe(true);
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.ok()).toBe(true);
    const openapi = await request.get('/openapi.yaml');
    expect(openapi.ok()).toBe(true);
    expect(await openapi.text()).toContain('openapi: 3.1.0');
    const generate = await request.post('/api/v1/generate', {
      data: {
        content: { type: 'url', value: { url: 'https://example.com' } },
        output: { format: 'png', size: 256 },
      },
    });
    expect(generate.ok()).toBe(true);
    expect(generate.headers()['content-type']).toBe('image/png');
    const bytes = await generate.body();
    expect(bytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });
});
