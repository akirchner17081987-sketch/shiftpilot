import { expect, test } from '@playwright/test';

test('branding, favicon and installable app manifest are available', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('SchichtFunk – Dienstplanung');
  await expect(page.locator('link[rel="icon"][sizes="32x32"]')).toHaveAttribute('href', '/assets/favicon-32x32.png');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/assets/apple-touch-icon.png');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#08111f');

  for (const path of ['/favicon.ico', '/assets/favicon-32x32.png', '/assets/apple-touch-icon.png', '/site.webmanifest']) {
    const response = await request.get(path);
    expect(response.ok(), `${path} muss erreichbar sein`).toBeTruthy();
  }
  const manifest = await (await request.get('/site.webmanifest')).json();
  expect(manifest.short_name).toBe('SchichtFunk');
  expect(manifest.icons.map(icon => icon.sizes)).toEqual(['192x192', '512x512', '512x512']);
});

test('login rejects incomplete credentials with a clear message', async ({ page }) => {
  await page.goto('/#app');
  await page.waitForLoadState('networkidle');
  const dialog = page.locator('#sfAuthBackdrop:visible').last();
  await expect(dialog).toBeVisible();
  await dialog.locator('#sfEmail').fill('e2e-validation@example.invalid');
  await dialog.locator('#sfPassword').fill('kurz');
  await dialog.locator('#sfAuthSubmit').click();
  await expect(dialog.locator('#sfAuthMsg')).toContainText('Bitte E-Mail und ein Passwort mit mindestens 8 Zeichen eingeben.');
});

test('public page has no horizontal document overflow', async ({ page }) => {
  await page.goto('/');
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
});

test('production response sends the required browser security headers', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();

  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['strict-transport-security']).toContain('max-age=63072000');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('camera=()');
});
