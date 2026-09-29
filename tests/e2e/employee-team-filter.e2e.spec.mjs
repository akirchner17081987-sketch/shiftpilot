import { expect, test } from '@playwright/test';
import { openManagerArea, primeDemoSession, waitForDemoReady } from './helpers/demo-ready.mjs';

test('manager filters employees by team or location',async({page})=>{
  await primeDemoSession(page);
  await page.route('**/demo-auth',async route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},status:200,contentType:'application/json',body:JSON.stringify({expiresAt:new Date(Date.now()+3_600_000).toISOString()})}));
  await page.route('**/demo-analytics',async route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},status:204,body:''}));
  await page.goto('/demo');
  await waitForDemoReady(page);
  await openManagerArea(page,'employees');
  await expect(page.locator('#spEmployeeV2')).toBeVisible({timeout:12_000});

  const total=await page.evaluate(()=>{
    employees.forEach((employee,index)=>{employee.team=index===0?'Standort Nord':index===1?'Standort Süd':''});
    renderEmployees();
    return employees.length;
  });

  const teamFilter=page.locator('#spEmpTeam');
  await expect(teamFilter).toContainText('Standort Nord');
  await expect(teamFilter).toContainText('Standort Süd');
  await expect(teamFilter).toContainText('Ohne Zuordnung');

  await teamFilter.selectOption('standort nord');
  await expect(page.locator('#spEmployeeList [data-id]')).toHaveCount(1);
  await expect(page.locator('#spEmployeeList [data-id]').first()).toContainText('Standort Nord');
  await expect(page.locator('#spEmpCount')).toHaveText(`1 von ${total}`);

  await teamFilter.selectOption('__unassigned__');
  await expect(page.locator('#spEmployeeList [data-id]')).toHaveCount(total-2);
});
