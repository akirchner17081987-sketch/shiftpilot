import { expect, test } from '@playwright/test';

const email = process.env.SF_E2E_EMAIL;
const password = process.env.SF_E2E_PASSWORD;
const hasCredentials = Boolean(email && password);

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
      await page.locator(`[data-sf-employee-view="${view}"]:visible`).first().click();
      await expect(page.locator('#sfEmployeePortal main h1')).toHaveText(heading);
    }
  });

  test('employee shell stays isolated from manager and landing DOM', async ({ page }) => {
    await expect(page.locator('#landingPage')).toHaveCount(0);
    await expect(page.locator('#appShell')).toHaveCount(0);
    await expect(page.locator('#sfEmployeePortal')).toHaveCount(1);
    await expect(page.locator('[data-sf-employee-view]:visible')).toHaveCount(11);
  });

  test('absence dialog is labelled, traps focus and closes with Escape', async ({ page }) => {
    await page.locator('[data-sf-employee-view="absences"]:visible').first().click();
    await page.getByRole('button', { name: /Antrag stellen/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Abwesenheit melden' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#sfAe3Type')).toBeFocused();
    await expect(page.locator('label[for="sfAe3Type"]')).toContainText('Art');
    await expect(page.locator('#sfAe3Msg')).toHaveAttribute('role', 'alert');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Antrag stellen/ })).toBeFocused();
  });

  test('portal remains usable without horizontal overflow on the selected device', async ({ page }) => {
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
    const buttons = page.getByRole('navigation', { name: 'Mitarbeiterportal Bereiche' }).getByRole('button');
    await expect(buttons).toHaveCount(11);
  });
});
