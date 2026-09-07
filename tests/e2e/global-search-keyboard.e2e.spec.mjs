import { expect, test } from '@playwright/test';

test('global search results are fully keyboard accessible', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('sf_demo_tour_seen_v1', 'complete'));
  await page.route('**/api/demo-auth', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
    });
  });
  await page.goto('/demo');
  await expect(page.locator('#appShell')).toBeVisible();
  await page.waitForTimeout(2_200);

  const search = page.getByRole('searchbox', { name: 'Globale Suche nach Mitarbeitern oder Schichten' });
  await page.keyboard.press('Control+KeyK');
  await expect(search).toBeFocused();

  await search.fill('Anna Becker');
  await expect(page.locator('#view-employees')).toHaveClass(/active/);
  await expect(page.locator('#spEmpSearch')).toHaveValue('Anna Becker');

  const results = page.locator('#spEmployeeList .sp-emp-row');
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText('Becker, Anna');

  await search.press('ArrowDown');
  await expect(results.first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#spEmployeeList .sp-emp-row.selected')).toContainText('Becker, Anna');

  await search.focus();
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(page.locator('#spEmpSearch')).toHaveValue('');
  expect(await results.count()).toBeGreaterThan(1);
});
