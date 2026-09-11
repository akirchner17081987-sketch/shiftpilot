import { expect, test } from '@playwright/test';
import { openManagerArea, primeDemoSession, waitForDemoReady } from './helpers/demo-ready.mjs';

async function downloadText(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('ascii');
}

test('DATEV LODAS one-click export is authorized, audited and downloaded', async ({ page }) => {
  await primeDemoSession(page);
  await page.route('**/api/demo-auth', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
    });
  });

  await page.goto('/demo');
  await waitForDemoReady(page);
  await openManagerArea(page, 'reports');

  const workspace = page.locator('#sfTimeAccounts');
  await workspace.waitFor({ state: 'visible' });
  await workspace.locator('[data-sf-ta-tab="datev"]').click();

  const panel = workspace.locator('#sfDatevPanel');
  await expect(panel).toBeVisible();
  await panel.locator('#sfDatevMonth').fill('2026-08');
  await panel.locator('#sfDatevMonth').dispatchEvent('change');

  const downloadPromise = page.waitForEvent('download');
  await panel.locator('#sfDatevExport').click();
  const download = await downloadPromise;
  const content = await downloadText(download);

  expect(download.suggestedFilename()).toBe('SchichtFunk_DATEV_LODAS_2026-08.txt');
  expect(content).toContain('[Allgemein]\r\nZiel=LODAS\r\nDatumsformat=TT.MM.JJJJ\r\nZahlenkomma=,\r\nVersion=15.06');
  expect(content).toContain('[Satzbeschreibung]\r\n1;u_lod_bwd_buchung_standard;');
  expect(content).toContain('[Bewegungsdaten]\r\n1;01.08.2026;');
  expect(content.replaceAll('\r\n', '')).not.toContain('\n');
  expect([...content].every(character => character.charCodeAt(0) <= 127)).toBe(true);
  await expect(panel.locator('#sfDatevStatus')).toContainText('erstellt und protokolliert');
});

test('DATEV download is blocked when server authorization fails', async ({ page }) => {
  await primeDemoSession(page);
  await page.route('**/api/demo-auth', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
    });
  });

  await page.goto('/demo');
  await waitForDemoReady(page);
  await openManagerArea(page, 'reports');

  const workspace = page.locator('#sfTimeAccounts');
  await workspace.locator('[data-sf-ta-tab="datev"]').click();
  const panel = workspace.locator('#sfDatevPanel');
  await panel.locator('#sfDatevMonth').fill('2026-08');
  await panel.locator('#sfDatevMonth').dispatchEvent('change');

  await page.evaluate(() => {
    const baseClient = window.SFBackend.client;
    const guardedClient = new Proxy(baseClient, {
      get(target, property, receiver) {
        if (property === 'rpc') return (name, args) => name === 'manager_authorize_datev_lodas_export'
          ? Promise.resolve({ data: null, error: { message: 'Audit nicht verfügbar' } })
          : target.rpc(name, args);
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    Object.defineProperty(window.SFBackend, 'client', {
      configurable: true,
      get: () => guardedClient,
      set: () => {},
    });
  });

  let downloaded = false;
  page.once('download', () => { downloaded = true; });
  await panel.locator('#sfDatevExport').click();
  await expect(panel.locator('#sfDatevStatus')).toContainText('Audit nicht verfügbar');
  expect(downloaded).toBe(false);
});
