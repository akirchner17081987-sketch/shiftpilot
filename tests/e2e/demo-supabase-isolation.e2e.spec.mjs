import { expect, test } from '@playwright/test';
import { waitForDemoReady } from './helpers/demo-ready.mjs';

test('demo never connects to Supabase in manager or employee views',async({page})=>{
  const supabaseRequests=[];
  const isolationErrors=[];
  page.on('request',request=>{if(/(^|\.)supabase\.(co|in)(\/|$)/i.test(new URL(request.url()).hostname))supabaseRequests.push(request.url())});
  page.on('console',message=>{if(/SF_DEMO_(?:UNHANDLED|NETWORK_BLOCKED)/.test(message.text()))isolationErrors.push(message.text())});
  page.on('pageerror',error=>{if(/SF_DEMO_(?:UNHANDLED|NETWORK_BLOCKED)/.test(error.message))isolationErrors.push(error.message)});
  await page.addInitScript(()=>sessionStorage.setItem('sf_demo_tour_seen_v1','complete'));
  await page.route('**/api/demo-auth',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({expiresAt:new Date(Date.now()+3_600_000).toISOString()})}));

  await page.goto('/demo');
  await waitForDemoReady(page, { scenarios: true });
  await expect(page.locator('#sfDemoBadge')).toHaveCount(1);
  await expect.poll(()=>page.evaluate(()=>({local:window.SFBackend?.client?.__sfDemoLocalClientV1,ready:window.SFBackend?.ready}))).toEqual({local:true,ready:true});

  const managerViews=await page.locator('#appShell [data-view]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.view).filter(Boolean))]);
  for(const view of managerViews){
    await page.evaluate(name=>window.switchView?.(name),view);
    await page.waitForTimeout(120);
  }
  const localCoverage=await page.evaluate(async()=>{
    const client=window.SFBackend.client;
    const [swaps,settings,holidays]=await Promise.all([
      client.from('shift_swap_requests').select('*').eq('company_id','demo-local-company'),
      client.from('time_account_settings').select('*').eq('company_id','demo-local-company').maybeSingle(),
      client.rpc('manager_monthly_holidays',{p_company_id:'demo-local-company',p_month:'2026-05-01'}),
    ]);
    return {swaps:swaps.error,settings:settings.error,holidays:holidays.error};
  });
  expect(localCoverage).toEqual({swaps:null,settings:null,holidays:null});

  const scenarios=await page.evaluate(()=>window.SFDemoScenarios?.list?.()||[]);
  for(const scenario of scenarios){
    await page.evaluate(name=>window.SFDemoScenarios.apply(name),scenario);
    await page.waitForTimeout(1050);
  }
  await page.evaluate(()=>window.SFDemoScenarios?.reset?.());
  await page.waitForTimeout(250);

  await page.locator('#appShell [data-demo-perspective="employee"]').click();
  await expect(page.locator('#sfEmployeePortal')).toBeVisible();
  const employeeViews=await page.locator('#sfEmployeePortal [data-portal-view]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.portalView).filter(Boolean))]);
  for(const view of employeeViews){
    await page.evaluate(name=>window.SFBackend?.employeePortalNavigate?.(name),view);
    await page.waitForTimeout(100);
  }

  await page.waitForTimeout(1800);
  expect(supabaseRequests,'Die Demo hat eine Supabase-Netzwerkverbindung aufgebaut.').toEqual([]);
  expect(isolationErrors,'Die Demo hat einen nicht lokal abgedeckten Datenzugriff ausgelöst.').toEqual([]);
  expect(await page.evaluate(()=>window.SFBackend?.client?.__sfDemoLocalClientV1)).toBe(true);
});
