import { expect, test } from '@playwright/test';

test('demo switches between manager workspace and the existing employee portal', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('sf_demo_tour_seen_v1', 'complete'));
  await page.route('**/api/demo-auth', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }) });
  });
  await page.goto('/demo');

  const managerSwitch = page.locator('#appShell #sfDemoPerspectiveSwitch');
  await expect(managerSwitch).toBeVisible();
  await expect(managerSwitch.locator('[data-demo-perspective="manager"]')).toHaveAttribute('aria-pressed', 'true');
  await managerSwitch.locator('[data-demo-perspective="employee"]').click();

  const portal = page.locator('#sfEmployeePortal');
  await expect(portal).toBeVisible();
  await expect(portal).toContainText('Mitarbeiterportal');
  await expect(portal).toContainText('Anna Becker');
  await expect(portal).not.toContainText('permission denied');
  await expect(page.locator('#appShell')).toHaveCount(0);
  await expect(portal.locator('[data-demo-perspective="employee"]')).toHaveAttribute('aria-pressed', 'true');
  const scrollbar = await portal.locator('.sf-portal-main').evaluate(element => ({
    firefox: getComputedStyle(element).scrollbarColor,
    maxWidth: getComputedStyle(element).maxWidth,
    width: getComputedStyle(element, '::-webkit-scrollbar').width,
    thumb: getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
  }));
  expect(scrollbar.firefox).not.toBe('auto');
  expect(scrollbar.maxWidth).toBe('none');
  expect(['7px','9px']).toContain(scrollbar.width);
  expect(scrollbar.thumb).not.toBe('rgba(0, 0, 0, 0)');

  await portal.locator('[data-demo-perspective="manager"]').click();
  await expect(portal).toHaveCount(0);
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('#appShell #sfDemoPerspectiveSwitch [data-demo-perspective="manager"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#appShell [data-demo-perspective="employee"]').click();
  await expect(page.locator('#sfEmployeePortal')).toBeVisible();
  await page.locator('#sfEmployeePortal [data-demo-perspective="manager"]').click();
  await expect(page.locator('#appShell')).toBeVisible();
});
