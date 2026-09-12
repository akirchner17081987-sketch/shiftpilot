import { expect, test } from '@playwright/test';
import { openManagerArea, primeDemoSession, waitForDemoReady } from './helpers/demo-ready.mjs';

const demoUrl=()=>process.env.E2E_BASE_URL?.startsWith('http://localhost')?'/demo.html':process.env.E2E_SHARE_TOKEN?`/demo?_vercel_share=${encodeURIComponent(process.env.E2E_SHARE_TOKEN)}`:'/demo';

test('manager records all eligible open times in one guarded action',async({page})=>{
  await primeDemoSession(page);
  await page.route('**/api/demo-auth',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({expiresAt:new Date(Date.now()+3_600_000).toISOString()})}));
  await page.route('**/api/demo-analytics',async route=>route.fulfill({status:204,body:''}));
  const demoPath=demoUrl();
  await page.goto(demoPath);
  await waitForDemoReady(page);
  await openManagerArea(page,'time');
  const currentMonth=await page.evaluate(()=>new Date().toISOString().slice(0,7));
  await page.locator('#sfTimeMonthPicker').fill(currentMonth);
  await page.locator('#sfTimeMonthPicker').dispatchEvent('change');

  const bulk=page.locator('#sfTimeBulkOpen');
  await expect(bulk).toBeVisible({timeout:12_000});
  await expect(bulk).toBeEnabled();
  await expect(bulk).toContainText('Alle offenen Zeiten erfassen');
  await bulk.click();

  const modal=page.locator('#sfTimeModal');
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading',{name:'Alle offenen Zeiten erfassen'})).toBeVisible();
  const apply=modal.locator('#sfTimeBulkApply');
  await expect(apply).toBeEnabled();
  await expect(modal.locator('#sfTimeBulkAcknowledge')).toHaveCount(0);
  await expect(modal).toContainText('ohne weitere Einzelprüfung als bestätigt');
  await apply.click();

  await expect(modal).toBeHidden();
  await expect(page.locator('#timeTableBody')).toContainText('Bestätigt');
  await expect(bulk).toHaveText('Keine offenen Zeiten');
});

test('historical month selection wins over an older in-flight request',async({page})=>{
  await primeDemoSession(page);
  await page.route('**/api/demo-auth',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({expiresAt:new Date(Date.now()+3_600_000).toISOString()})}));
  await page.route('**/api/demo-analytics',async route=>route.fulfill({status:204,body:''}));
  const demoPath=demoUrl();
  await page.goto(demoPath);
  await waitForDemoReady(page);
  await openManagerArea(page,'time');

  const picker=page.locator('#sfTimeMonthPicker');
  await expect(picker).toHaveAttribute('data-sf-month-picker-bound','1');
  await page.evaluate(()=>{const base=window.SFBackend.client.rpc.bind(window.SFBackend.client);window.__sfTimeRangeCalls=[];window.SFBackend.client.rpc=async(name,args)=>{if(name==='manager_list_time_entries')window.__sfTimeRangeCalls.push({start:args?.p_start_date,end:args?.p_end_date});return base(name,args)}});
  await picker.fill('2026-09');
  await picker.dispatchEvent('change');
  await picker.fill('2026-08');
  await picker.dispatchEvent('change');

  await expect(picker).toHaveValue('2026-08');
  await expect.poll(()=>page.evaluate(()=>window.__sfTimeRangeCalls)).toContainEqual({start:'2026-08-01',end:'2026-08-31'});
  await expect(page.locator('#timeTableBody tr').first()).toContainText(/08\.2026/,{timeout:12_000});
  await expect(page.locator('#timeTableBody')).not.toContainText(/01\.09\.2026/);
});
