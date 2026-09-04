import { expect, test } from '@playwright/test';

test('demo readability is applied to manager and employee perspectives', async ({ page }, testInfo) => {
  await page.addInitScript(() => sessionStorage.setItem('sf_demo_tour_seen_v1', 'complete'));
  await page.route('**/api/demo-auth', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }) });
  });
  await page.goto('/demo');
  await expect.poll(()=>page.locator('#appShell .content').evaluate(element=>getComputedStyle(element).maxWidth)).toBe('1720px');

  const manager=await page.locator('#appShell').evaluate(shell=>({
    contentMax:getComputedStyle(shell.querySelector('.content')).maxWidth,
    heading:parseFloat(getComputedStyle(shell.querySelector('.page-head h1')).fontSize),
    paragraph:parseFloat(getComputedStyle(shell.querySelector('.page-head p')).fontSize),
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
  }));
  expect(manager.contentMax).toBe('1720px');
  expect(manager.heading).toBeGreaterThanOrEqual(testInfo.project.name.startsWith('mobile')?26:32);
  expect(manager.paragraph).toBeGreaterThanOrEqual(13);
  expect(manager.overflow).toBeLessThanOrEqual(1);

  await page.locator('#appShell [data-demo-perspective="employee"]').click();
  await expect(page.locator('#sfEmployeePortal')).toBeVisible();
  await expect(page.locator('#sfEmployeePortal .sf-employee-tile').first()).toBeVisible();
  const employee=await page.locator('#sfEmployeePortal').evaluate(portal=>({
    welcome:parseFloat(getComputedStyle(portal.querySelector('.sf-portal-welcome h1')).fontSize),
    tileHelp:parseFloat(getComputedStyle(portal.querySelector('.sf-employee-tile small')).fontSize),
    mainWidth:portal.querySelector('.sf-portal-main').getBoundingClientRect().width,
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
  }));
  expect(employee.welcome).toBeGreaterThanOrEqual(testInfo.project.name.startsWith('mobile')?28:34);
  expect(employee.tileHelp).toBeGreaterThanOrEqual(11);
  expect(employee.mainWidth).toBeGreaterThan(250);
  expect(employee.overflow).toBeLessThanOrEqual(1);
});
