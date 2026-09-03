import { expect, test, type Page } from '@playwright/test';

/**
 * Admin flow: first-run password setup → settings → built-in dynamic links →
 * the short link is loaded into the studio. Runs serially because it mutates
 * the shared local D1 database of the test server.
 */
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'playwright-admin-pass';

async function openAdmin(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin' }).click();
}

async function loginIfNeeded(page: Page) {
  const loginHeading = page.getByRole('heading', { name: /admin login/i });
  const settingsTab = page.getByRole('tab', { name: 'Settings' });
  await expect(loginHeading.or(settingsTab)).toBeVisible();
  if (await loginHeading.isVisible()) {
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
  }
  await expect(settingsTab).toBeVisible();
}

test.describe('admin area', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'desktop only');

  test('sets up the admin password on first run or logs in', async ({ page }) => {
    await openAdmin(page);
    const setupHeading = page.getByRole('heading', { name: /secure your admin area/i });
    const loginHeading = page.getByRole('heading', { name: /admin login/i });
    await expect(setupHeading.or(loginHeading)).toBeVisible();
    if (await setupHeading.isVisible()) {
      await page.getByRole('textbox', { name: 'Admin password' }).fill(PASSWORD);
      await page.getByRole('textbox', { name: 'Repeat password' }).fill(PASSWORD);
      await page.getByRole('button', { name: /create password and continue/i }).click();
    } else {
      await page.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: 'Log in' }).click();
    }
    await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  });

  test('enables built-in dynamic links and uses a short link in the studio', async ({ page }) => {
    await openAdmin(page);
    await loginIfNeeded(page);

    await page.getByRole('button', { name: 'Built-in (this Worker)' }).click();
    await page.getByRole('textbox', { name: 'Public link domain (optional)' }).fill('https://qr.example.com');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible();

    await page.getByRole('tab', { name: 'Dynamic links' }).click();
    await page.getByRole('textbox', { name: 'Destination URL' }).fill('https://example.com/e2e-link');
    await page.getByRole('textbox', { name: 'Code (optional)' }).fill('e2e-code');
    await page.getByRole('button', { name: 'Create link' }).click();
    await expect(page.locator('code', { hasText: 'https://qr.example.com/r/e2e-code' })).toBeVisible();

    await page.getByRole('button', { name: 'Use in studio' }).first().click();
    await expect(page.getByRole('textbox', { name: 'Website URL' })).toHaveValue(
      'https://qr.example.com/r/e2e-code',
    );
    await expect(page.getByTestId('qr-preview').first()).toBeVisible();

    // The redirect works through the Worker.
    const response = await page.request.get('/r/e2e-code', { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe('https://example.com/e2e-link');

    // The "Links" navigation item appears once a provider is active and shows the link to the logged-in admin.
    await page.getByRole('button', { name: 'Links' }).click();
    await expect(page.locator('code', { hasText: 'https://qr.example.com/r/e2e-code' })).toBeVisible();

    // Clean up: switch links off again so other test runs start from the default.
    await page.getByRole('button', { name: 'Admin' }).click();
    await loginIfNeeded(page);
    await page.getByRole('tab', { name: 'Dynamic links' }).click();
    await page.getByRole('button', { name: 'Delete e2e-code' }).click();
    await page.getByRole('button', { name: 'Delete link' }).click();
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Off', exact: true }).click();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible();
  });
});
