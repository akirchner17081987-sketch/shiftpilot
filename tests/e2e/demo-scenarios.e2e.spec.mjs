import { expect, test } from '@playwright/test';

test('all prepared demo scenarios open their matching workspace', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('sf_demo_tour_seen_v1', 'complete'));
  await page.route('**/api/demo-auth', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }) });
  });
  await page.goto('/demo');

  await expect(page.locator('#appShell [data-demo-scenarios]')).toBeVisible();
  const cases=[
    ['understaffing','schedule','Unterbesetzung'],
    ['vacation','absence','Urlaubsantrag'],
    ['deviation','time','Zeitabweichung'],
    ['swap','marketplace','Schichttausch'],
    ['outage','disruptions','Kurzfristiger Ausfall'],
  ];
  for(const [key,view,title] of cases){
    await page.locator('#appShell [data-demo-scenarios]').click();
    await expect(page.locator('#sfDemoScenarioModal')).toBeVisible();
    await page.locator(`#sfDemoScenarioModal [data-scenario="${key}"]`).click();
    await expect(page.locator(`#view-${view}`)).toHaveClass(/active/);
    await expect(page.locator(`#view-${view} .sf-demo-scenario-banner`)).toContainText(title);
    if(key==='vacation')await expect(page.locator('#view-absence')).toContainText(/Anna Becker[\s\S]*Beantragt/);
    if(key==='deviation')await expect(page.locator('#timeDeviations')).toContainText('Anna Becker');
    if(key==='swap')await expect(page.locator('#view-marketplace')).toContainText(/Jonas Wagner[\s\S]*Lea Hoffmann/);
    if(key==='outage')await expect(page.locator('#view-disruptions')).toContainText(/Anna Becker[\s\S]*Lukas Fischer/);
  }

  await page.locator('#view-disruptions .sf-demo-scenario-banner [data-reset]').click();
  await expect(page.locator('#view-overview')).toHaveClass(/active/);
  await expect(page.locator('.sf-demo-scenario-banner')).toHaveCount(0);
  await expect(page.locator('#appShell [data-demo-scenarios]')).not.toHaveClass(/active/);
});
