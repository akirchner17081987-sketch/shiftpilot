import {test,expect} from '@playwright/test';
import {primeDemoSession,waitForDemoReady,demoPerspectiveSwitch} from './helpers/demo-ready.mjs';

test('current demo uses five fictional staff and blocks production data',async({page})=>{
 const forbidden=[];
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1'||url.hostname==='localhost')return route.continue();
  if(/(^|\.)supabase\.(co|in)$/i.test(url.hostname))forbidden.push(url.pathname);
  return route.abort();
 });
 await page.route('**/demo-auth',route=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({expiresAt:new Date(Date.now()+3600000).toISOString()})}));
 await page.route('**/demo-analytics',route=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'{}'}));
 await primeDemoSession(page);
 await page.goto('/demo');
 await waitForDemoReady(page,{scenarios:true});
 await expect(page.locator('#sfTodayWorkspace')).toBeVisible();
 await expect(page.locator('#sfTodayStatus')).toContainText('fiktive');
 await expect.poll(()=>page.evaluate(()=>!!window.SFToday?.getResult())).toBe(true);
 const initial=await page.evaluate(()=>({staff:JSON.parse(sessionStorage.getItem('sf_demo_data_employees')),data:SFToday.getResult()}));
 expect(initial.staff).toHaveLength(5);
 expect(initial.staff.every(p=>p.email.endsWith('@demo.schichtfunk.invalid'))).toBe(true);
 expect(initial.data).toBeTruthy();
 await page.evaluate(()=>window.switchView('reports'));
 await expect(page.locator('#sfReportsWorkspace')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>!!window.SFReports?.getResult())).toBe(true);
 await demoPerspectiveSwitch(page).locator('[data-demo-perspective="employee"]').click();
 await expect(page.locator('#sfEmployeePortal')).toBeVisible();
 const integrity=await page.evaluate(()=>{const p=window.SFBackend.employeePortalData,ids=new Set(JSON.parse(sessionStorage.getItem('sf_demo_data_assignments')).filter(a=>a.publishedAt||a._dbStatus==='PUBLISHED').map(a=>a.id));return p.shifts.every(s=>ids.has(s.id))});
 expect(integrity).toBe(true);
 expect(forbidden).toEqual([]);
});
