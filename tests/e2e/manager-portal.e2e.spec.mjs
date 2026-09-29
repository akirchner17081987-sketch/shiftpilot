import { expect, test } from '@playwright/test';

const email = process.env.SF_MANAGER_E2E_EMAIL;
const password = process.env.SF_MANAGER_E2E_PASSWORD;
const expectedCompany = process.env.SF_E2E_COMPANY || 'SchichtFunk Abnahme 5bbb5d5a (FIKTIV)';
const hasCredentials = Boolean(email && password);

async function openManagerView(page, view) {
  const mobileToggle = page.locator('#sfMobileManagerNavToggle');
  if (await mobileToggle.isVisible()) {
    await mobileToggle.click();
    await expect(page.locator('#sfManagerSidebar')).toHaveAttribute('aria-hidden', 'false');
  }
  await page.locator(`#nav [data-view="${view}"], .side-bottom [data-view="${view}"]`).first().click();
}

test.describe('angemeldeter Managerbereich', () => {
  test.skip(!hasCredentials, 'SF_MANAGER_E2E_EMAIL und SF_MANAGER_E2E_PASSWORD sind für geschützte Portaltests erforderlich.');

  test.beforeEach(async ({ page }) => {
    await page.goto('/#app');
    await page.locator('#sfEmail').fill(email);
    await page.locator('#sfPassword').fill(password);
    await page.locator('#sfAuthSubmit').click();
    await expect(page.locator('#appShell')).toBeVisible({ timeout: 25_000 });
  });

  test('owner session is connected to the isolated acceptance company', async ({ page }) => {
    await expect.poll(() => page.evaluate(() => ({
      ready: window.SFBackend?.ready,
      email: window.SFBackend?.user?.email,
      role: window.SFBackend?.role,
    }))).toEqual({ ready: true, email, role: 'OWNER' });
    await expect(page.locator('.company-card b')).toHaveText(expectedCompany);
    await expect(page.locator('#sfEmployeePortal')).toHaveCount(0);
    await expect(page.locator('#landingPage')).toBeHidden();
  });

  test('all core manager areas open without writes', async ({ page }) => {
    const views = [
      ['overview', /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),/],
      ['schedule', 'Wochenplanung'],
      ['auto', 'Auto-Planung'],
      ['employees', 'Mitarbeiter'],
      ['absence', 'Abwesenheiten'],
      ['time', 'Zeiterfassung'],
      ['reports', 'Auswertungs-Dashboard'],
      ['audit', 'Audit-Logs'],
      ['settings', /Schichten & SOLL-Besetzung|Einstellungen/],
    ];
    for (const [view, heading] of views) {
      await openManagerView(page, view);
      const section = page.locator(`#view-${view}`);
      await expect(section).toHaveClass(/active/);
      await expect(section.getByRole('heading', { level: 1 }).first()).toHaveText(heading);
    }
  });

  test('manager sees only the fictitious employee in the acceptance tenant', async ({ page }) => {
    await openManagerView(page, 'employees');
    await expect(page.locator('#employeeList .emp')).toHaveCount(1);
    await expect(page.locator('#employeeList')).toContainText('Testperson, Mara');
  });

  test('manager shell has no horizontal page overflow on the selected device', async ({ page }) => {
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  });
});
