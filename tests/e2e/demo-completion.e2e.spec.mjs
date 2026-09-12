import { expect, test } from '@playwright/test';
import { demoExitControl, primeDemoSession, waitForDemoReady } from './helpers/demo-ready.mjs';

test('ending the demo opens the responsive completion page', async ({ page }) => {
  let signedOut=false;
  await primeDemoSession(page);
  await page.route('**/demo-auth', async route => {
    if(route.request().method()==='DELETE'){signedOut=true;await route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},status:200,contentType:'application/json',body:'{"ok":true}'});return}
    await route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},status:200,contentType:'application/json',body:JSON.stringify({expiresAt:new Date(Date.now()+3_600_000).toISOString()})});
  });
  await page.goto('/demo');
  await waitForDemoReady(page);
  await demoExitControl(page).click();
  await page.waitForURL('**/demo-abschluss');

  await expect(page.getByRole('heading',{name:/weiter unterstützen/})).toBeVisible();
  for(const label of ['Gespräch vereinbaren','Persönliche Vorführung','Eigenen Testzugang','Feedback geben'])await expect(page.getByRole('button',{name:new RegExp(label)})).toBeVisible();
  expect(signedOut).toBe(true);
  expect(await page.evaluate(()=>sessionStorage.getItem('sf_demo_session_v1'))).toBeNull();

  await page.getByRole('button',{name:/Feedback geben/}).click();
  await expect(page.locator('#finishCompose')).toHaveClass(/show/);
  await expect(page.locator('#finishMessage')).toHaveValue(/Mein Eindruck/);
  await expect(page.locator('.finish-check')).toContainText('Demo-Daten wurden verworfen');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
