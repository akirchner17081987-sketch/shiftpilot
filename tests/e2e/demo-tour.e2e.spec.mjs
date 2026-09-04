import { expect, test } from '@playwright/test';

test('guided demo tour remains visible through every station', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('sf_demo_session_v1', 'active'));
  await page.setViewportSize({ width: 2528, height: 953 });
  await page.goto('/?sf_demo_source=1');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => window.openApp?.('schedule'));
  await page.addScriptTag({ url: '/assets/demo-tour-v1.js' });

  const card = page.locator('#sfDemoTourCard');
  await expect(card).toBeVisible();
  for (let step = 1; step <= 6; step += 1) {
    await expect(card).toBeVisible();
    await expect(card.locator('.sf-demo-tour-count')).toHaveText(`${step} / 6`);
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(953);
    if (step < 6) await card.locator('.sf-demo-tour-next').click();
    if (step === 1) await expect(page.locator('#view-overview')).toHaveClass(/active/);
  }

  await expect(page.locator('#view-overview')).not.toHaveClass(/active/);
  await expect(page.locator('#view-time')).toHaveClass(/active/);
  await card.locator('.sf-demo-tour-next').click();
  await expect(card).toBeHidden();
});
