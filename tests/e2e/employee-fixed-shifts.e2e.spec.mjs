import { expect, test } from '@playwright/test';
import { demoPerspectiveSwitch, openManagerArea, primeDemoSession, waitForDemoReady } from './helpers/demo-ready.mjs';

async function configureFixedWeek(page) {
  const fixedWeek=['OT1','OT2','OT1','OT2','OT1','FREI','FREI'];
  for(let attempt=0;attempt<3;attempt++){
    const mode=page.locator('#spRhythmMode');
    await mode.waitFor({state:'visible'});
    await mode.selectOption('required');
    await expect(mode).toHaveValue('required');
    await page.locator('#spRhythmStart').fill('2026-09-07');

    let stable=true;
    for(let day=0;day<fixedWeek.length;day++){
      const field=page.locator(`[data-rhythm-day="${day}"]`);
      if(await field.isDisabled().catch(()=>true)){stable=false;break}
      await field.selectOption(fixedWeek[day]);
      if(await mode.inputValue().catch(()=> 'off')!=='required'){stable=false;break}
    }
    if(!stable)continue;

    await expect(page.locator('#spRhythmSummary')).toContainText('Montag: OT1');
    await expect(page.locator('#spRhythmSummary')).toContainText('Sonntag: FREI');
    await page.locator('#spSave').click();
    try{
      await expect(page.locator('#spRhythmMode')).toHaveValue('required',{timeout:4000});
      await expect(page.locator('[data-rhythm-day="1"]')).toHaveValue('OT2',{timeout:4000});
      return;
    }catch(error){
      if(attempt===2)throw error;
    }
  }
  throw new Error('Feste Schichtregel konnte nach einem Demo-Re-Render nicht stabil gespeichert werden.');
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
