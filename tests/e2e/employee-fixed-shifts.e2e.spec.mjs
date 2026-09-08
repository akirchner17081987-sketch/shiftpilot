import { expect, test } from '@playwright/test';
import { demoPerspectiveSwitch, openManagerArea, primeDemoSession, waitForDemoReady } from './helpers/demo-ready.mjs';

async function configureFixedWeek(page) {
  const fixedWeek=['OT1','OT2','OT1','OT2','OT1','FREI','FREI'];
  await page.locator('#spRhythmMode').waitFor({state:'visible'});

  // Der Demo-Datenabgleich darf das Profil neu rendern. Deshalb setzen wir die
  // zusammengehörige Wochenregel und lösen denselben Save-Handler in einem
  // Browser-Task aus. Die echten change-Events und die echte Speicherroutine
  // werden weiterhin benutzt, nur ein Zwischen-Render kann keine halbe Eingabe
  // mehr verwerfen.
  const configured=await page.evaluate(({fixedWeek})=>{
    const mode=document.getElementById('spRhythmMode');
    const start=document.getElementById('spRhythmStart');
    const save=document.getElementById('spSave');
    const fields=[...document.querySelectorAll('[data-rhythm-day]')];
    if(!mode||!start||!save||fields.length!==7)return false;

    mode.value='required';
    mode.dispatchEvent(new Event('change',{bubbles:true}));
    start.value='2026-09-07';
    start.dispatchEvent(new Event('input',{bubbles:true}));
    start.dispatchEvent(new Event('change',{bubbles:true}));

    fields.forEach((field,index)=>{
      field.value=fixedWeek[index];
      field.dispatchEvent(new Event('change',{bubbles:true}));
    });
    save.click();
    return true;
  },{fixedWeek});
  expect(configured).toBe(true);

  await expect(page.locator('#spRhythmMode')).toHaveValue('required',{timeout:10_000});
  await expect(page.locator('[data-rhythm-day="0"]')).toHaveValue('OT1');
  await expect(page.locator('[data-rhythm-day="1"]')).toHaveValue('OT2');
  await expect(page.locator('[data-rhythm-day="6"]')).toHaveValue('FREI');
  await expect(page.locator('#spRhythmSummary')).toContainText('Montag: OT1');
  await expect(page.locator('#spRhythmSummary')).toContainText('Sonntag: FREI');
}

test('manager configures an exclusive shift and a fixed working week', async ({ page }) => {
  await primeDemoSession(page);
  await page.route('**/api/demo-auth', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }) });
  });
  await page.route('**/api/demo-analytics', async route => {
    await route.fulfill({ status: 204, body: '' });
  });
  await page.goto('/demo');
  await waitForDemoReady(page);

  await expect(demoPerspectiveSwitch(page)).toBeVisible();
  await openManagerArea(page,'employees');
  await expect(page.locator('#view-employees')).toHaveClass(/active/);
  await expect(page.locator('#spEmployeeV2')).toBeVisible({ timeout: 12_000 });
  await page.locator('#spEmployeeList [data-id]').first().click();

  await expect(page.getByText('Feste Schichtregel', { exact: true })).toBeVisible();
  await configureFixedWeek(page);

  await page.locator('[data-tab="planning"]').click();
  await expect(page.locator('.sp-plan-rule-warning').first()).toBeVisible();

  await page.locator('#spEmployeeList [data-id]').nth(1).click();
  await page.locator('[data-tab="qualifications"]').click();
  await page.locator('#spExclusiveShift').selectOption('O1S');
  await expect(page.locator('[data-qual]:checked')).toHaveCount(1);
  await expect(page.locator('[data-qual][value="O1S"]')).toBeChecked();
  await page.locator('#spSaveQualifications').click();
  await expect(page.locator('#spExclusiveShift')).toHaveValue('O1S');
});
