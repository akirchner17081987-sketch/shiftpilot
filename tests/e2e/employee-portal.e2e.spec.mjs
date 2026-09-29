import { expect, test } from '@playwright/test';

const email = process.env.SF_E2E_EMAIL;
const password = process.env.SF_E2E_PASSWORD;
const hasCredentials = Boolean(email && password);
const viewIds = ['dashboard', 'disruptions', 'marketplace', 'shifts', 'changes', 'swaps', 'time', 'absences', 'account', 'wage', 'profile'];

async function openArea(page, view) {
  const visibleTarget = page.locator(`[data-sf-employee-view="${view}"]:visible`).first();
  if (await visibleTarget.count()) {
    await visibleTarget.click();
    return;
  }
  await page.getByRole('button', { name: 'Weitere Bereiche' }).click();
  await page.locator(`[data-sf-employee-view="${view}"]:visible`).first().click();
}

test.describe('angemeldetes Mitarbeiterportal', () => {
  test.skip(!hasCredentials, 'SF_E2E_EMAIL und SF_E2E_PASSWORD sind für geschützte Portaltests erforderlich.');

  test.beforeEach(async ({ page }) => {
    await page.goto('/#app');
    await page.locator('#sfEmail').fill(email);
    await page.locator('#sfPassword').fill(password);
    await page.locator('#sfAuthSubmit').click();
    await expect(page.locator('#sfEmployeePortal')).toBeVisible({ timeout: 20_000 });
  });

  test('all eleven portal areas open with the expected heading', async ({ page }) => {
    const expected = [
      ['dashboard', /Hallo /], ['disruptions', 'Ersatzanfragen'], ['marketplace', 'Schicht-Marktplatz'],
      ['shifts', 'Meine Schichten'], ['changes', 'Schichtänderungen'], ['swaps', 'Schichttausch'],
      ['time', 'Arbeitszeit'], ['absences', 'Abwesenheiten'], ['account', 'Stundenkonto'],
      ['wage', 'Lohnvorschau'], ['profile', 'Mein Profil'],
    ];
    for (const [view, heading] of expected) {
      await openArea(page, view);
      await expect(page.locator('#sfEmployeePortal')).toHaveAttribute('data-sf-portal-active', view);
      const activeHeading = view === 'dashboard'
        ? page.locator('#sfEmployeePortal .sf-portal-welcome h1')
        : page.locator('#sfEmployeePortal .sf-employee-view-head h1');
      await expect(activeHeading).toHaveText(heading);
    }
  });

  test('employee shell stays isolated from manager and landing DOM', async ({ page }) => {
    await expect(page.locator('#landingPage')).toHaveCount(0);
    await expect(page.locator('#appShell')).toHaveCount(0);
    await expect(page.locator('#sfEmployeePortal')).toHaveCount(1);
    const renderedAreas = await page.locator('#sfEmployeePortal [data-sf-employee-view]').evaluateAll(nodes =>
      [...new Set(nodes.map(node => node.dataset.sfEmployeeView))].sort(),
    );
    expect(renderedAreas).toEqual([...viewIds].sort());
  });

  test('absence dialog is labelled, focuses its first control and closes with Escape', async ({ page }) => {
    await openArea(page, 'absences');
    const opener = page.getByRole('button', { name: /Antrag stellen/ });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Abwesenheit melden' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#sfAe3Type')).toBeFocused();
    await expect(page.locator('label[for="sfAe3Type"]')).toContainText('Art');
    await expect(page.locator('#sfAe3Msg')).toHaveAttribute('role', 'alert');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#sfEmployeePortal')).toHaveAttribute('data-sf-portal-active', 'absences');
  });

  test('portal remains usable without horizontal overflow on the selected device', async ({ page }) => {
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
    const renderedAreas = await page.locator('#sfEmployeePortal [data-sf-employee-view]').evaluateAll(nodes =>
      new Set(nodes.map(node => node.dataset.sfEmployeeView)).size,
    );
    expect(renderedAreas).toBe(11);
  });
});
