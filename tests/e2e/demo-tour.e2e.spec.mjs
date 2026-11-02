import { expect, test } from '@playwright/test';
import { primeDemoSession, waitForDemoReady } from './helpers/demo-ready.mjs';

test('guided tour follows current demo views and can be restarted', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/demo-auth', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ expiresAt: new Date(Date.now()+3600000).toISOString() }) }));
  await page.route('**/demo-analytics', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' }));
  await primeDemoSession(page);
  await page.goto('/demo');
  await waitForDemoReady(page, { scenarios: true });
  await page.waitForFunction(() => window.__sfDemoReadyV1 === true);
  await page.locator('#sfDemoTourRestartBtn').click();
  const card=page.locator('#sfDemoTourCard');
  const titles=['Willkommen bei SchichtFunk','Heute im Blick','Dienstplan bearbeiten','Planungsvorschlag erstellen','Schichten anbieten und übernehmen','Abwesenheiten verwalten','Arbeitszeiten prüfen','Auswertungen ansehen','DATEV-Beispiel prüfen','Mitarbeiterperspektive erleben','Demo selbst ausprobieren'];
  for(let i=0;i<titles.length;i++){
    await expect(card.locator('h2')).toHaveText(titles[i], { timeout: 15000 });
    await expect(card.locator('.sf-demo-tour-count')).toHaveText(`${i+1} / ${titles.length}`);
    const box=await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y+box.height).toBeLessThanOrEqual(page.viewportSize().height+1);
    if(i===9)await expect(page.locator('#sfEmployeePortal')).toBeVisible();
    await card.locator('.sf-demo-tour-next').click();
  }
  await expect(card).toHaveCount(0);
  await expect(page.locator('#sfDemoTourRestartBtn')).toBeVisible();
});
