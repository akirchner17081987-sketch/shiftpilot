import {test,expect} from '@playwright/test';
import {primeDemoSession,waitForDemoReady,demoPerspectiveSwitch} from './helpers/demo-ready.mjs';

test('current demo uses five fictional staff and blocks production data',async({page})=>{
 test.setTimeout(120000);
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
 await page.waitForFunction(()=>window.__sfDemoReadyV1===true,null,{timeout:30000});
 const demoDock=page.locator('#sfDemoControlDock'),managerNav=page.locator('#sfOrbitDock');
 await expect(managerNav).toBeVisible();
 await expect.poll(async()=>{const d=await demoDock.boundingBox(),n=await managerNav.boundingBox();return d&&n?n.y-(d.y+d.height):-999}).toBeGreaterThanOrEqual(4);
 await managerNav.locator('[data-orbit-category="planning"]').click();
 await expect(page.locator('#sfOrbitPopup')).toHaveClass(/is-open/);
 await expect(demoDock).toBeHidden();
 await page.locator('#sfOrbitPopup button[aria-label="Auswahlmenü schließen"]').click();
 await expect(demoDock).toBeVisible();
 await expect(page.locator('#sfTodayWorkspace')).toBeVisible();
 await expect(page.locator('#sfTodayStatus')).toContainText('fiktive');
 await expect.poll(()=>page.evaluate(()=>!!window.SFToday?.getResult())).toBe(true);
 const initial=await page.evaluate(()=>({staff:JSON.parse(sessionStorage.getItem('sf_demo_data_employees')),data:SFToday.getResult()}));
 expect(initial.staff).toHaveLength(5);
 expect(initial.staff.every(p=>p.email.endsWith('@demo.schichtfunk.invalid'))).toBe(true);
 expect(initial.data).toBeTruthy();
 const sites=await page.evaluate(async()=>{
  const client=window.SFBackend.client,company='demo-local-company';
  const profile=await client.rpc('manager_company_profile',{p_company_id:company});
  const today=await client.rpc('manager_today_workspace',{p_company_id:company});
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const reports=await client.rpc('manager_reports_workspace',{p_company_id:company,p_start_date:date,p_end_date:date});
  return {profile:profile.data?.sites,today:today.data?.sites,reports:reports.data?.sites};
 });
 for(const list of Object.values(sites)){
  expect(list.map(site=>site.name)).toEqual(['Standort Nord','Standort Süd']);
  expect(list.every(site=>site.latitude==null&&site.longitude==null)).toBe(true);
 }
 await expect(page.locator('#sfTodaySite')).toContainText('Standort Nord');
 await expect(page.locator('#sfTodaySite')).toContainText('Standort Süd');

 const planIntegrity=await page.evaluate(()=>{
  const rows=JSON.parse(sessionStorage.getItem('sf_demo_data_assignments')||'[]'),keys=rows.map(a=>[a.employeeId,a.date,a.type,a.start,a.end].join('|'));
  return {duplicates:keys.filter((key,i)=>keys.indexOf(key)!==i),canPlan:window.SFBackend.can('plan'),role:window.SFBackend.accessRole};
 });
 expect(planIntegrity.duplicates).toEqual([]);expect(planIntegrity.canPlan).toBe(true);expect(planIntegrity.role).toBe('ADMIN');
 const assignmentCheck=await page.evaluate(()=>{
  const date=new Date();date.setDate(date.getDate()+120);const day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  window.assignEmployeeByDrop('demo-e01','O1',day);
  return JSON.parse(sessionStorage.getItem('sf_demo_data_assignments')||'[]').some(a=>a.employeeId==='demo-e01'&&a.type==='O1'&&a.date===day);
 });
 expect(assignmentCheck).toBe(true);

 await page.evaluate(()=>window.switchView('schedule'));
 await expect(page.locator('#view-schedule')).toHaveClass(/active/);
 await expect.poll(()=>page.evaluate(()=>window.SchichtFunkCalendarView?.getMode())).toBe('week');
 await expect(page.locator('#sfWeekBoardV2')).toBeVisible();
 await expect(page.locator('#sfManualPlanBtn')).toBeVisible();
 await expect(page.locator('#sfMarketScheduleEntry')).toBeVisible();
 await expect(page.locator('#sfMarketScheduleEntry [data-market-all]')).toBeDisabled();
 await expect(page.locator('#sfMarketScheduleEntry [data-market-state]')).toContainText('in der Demo noch nicht verfügbar');
 await expect(page.locator('#sfPlanContext')).not.toContainText('Nur lesen');
 const compareProductStyles=async selectors=>page.evaluate(selectors=>{
  const root=document.documentElement,props=['fontSize','lineHeight','paddingTop','paddingLeft','maxWidth'];
  const snapshot=()=>selectors.map(selector=>{const el=document.querySelector(selector);if(!el)return null;const css=getComputedStyle(el);return Object.fromEntries(props.map(p=>[p,css[p]]))});
  const demo=snapshot(),value=root.getAttribute('data-sf-demo');root.removeAttribute('data-sf-demo');const original=snapshot();root.setAttribute('data-sf-demo',value);return {demo,original};
 },selectors);
 await expect.poll(()=>page.evaluate(()=>document.getElementById('sfDemoReadabilityV1Css')?.sheet.disabled)).toBe(true);
 let styles=await compareProductStyles(['#appShell .main','#view-schedule .page-head h1','#view-schedule .page-head p','#view-schedule .sf-week-row-label small']);
 expect(styles.demo.every(Boolean)).toBe(true);expect(styles.demo).toEqual(styles.original);
 await page.evaluate(()=>window.switchView('auto'));
 await expect(page.locator('#view-auto')).toHaveClass(/active/);
 await expect.poll(()=>page.evaluate(()=>document.getElementById('sfDemoReadabilityV1Css')?.sheet.disabled)).toBe(true);
 styles=await compareProductStyles(['#appShell .main','#view-auto .page-head h1','#view-auto .page-head p','#view-auto .sf-auto-steps small']);
 expect(styles.demo.every(Boolean)).toBe(true);expect(styles.demo).toEqual(styles.original);
 await page.evaluate(()=>window.switchView('schedule'));

 await expect(page.locator('#sfWeekModeSeg [data-sf-week-mode="compact"]')).toBeVisible();
 await page.locator('#view-schedule .cal-toolbar .seg button').nth(1).click();
 await expect.poll(()=>page.evaluate(()=>window.SchichtFunkCalendarView?.getMode())).toBe('month');
 await page.reload();await waitForDemoReady(page,{scenarios:true});
 await expect.poll(()=>page.evaluate(()=>window.SchichtFunkCalendarView?.getMode())).toBe('month');
 await page.evaluate(()=>window.SchichtFunkCalendarView.setMode('week'));

 const workflow=await page.evaluate(async()=>{
  const client=window.SFBackend.client,day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const submitted=await client.rpc('employee_submit_absence_request_for_company',{p_company_id:'demo-local-company',p_absence_type:'Krank',p_start_date:day,p_end_date:day});
  if(submitted.error)return {error:submitted.error.message};
  const reviewed=await client.rpc('manager_review_absence_request',{p_absence_id:submitted.data,p_decision:'APPROVE'});
  const overview=await client.rpc('manager_today_workspace',{p_company_id:'demo-local-company'});
  const market=await client.rpc('manager_list_shift_marketplace',{});
  const entries=JSON.parse(sessionStorage.getItem('sf_demo_data_timeEntries')||'{}');
  const invalid=market.data?.find(row=>['MARKET_OPEN','PENDING_MANAGER'].includes(row.status)&&(entries[row.assignment_id]?.actualStart||new Date(row.starts_at).getTime()<=Date.now()));
  if(invalid)return {error:'Demo-Angebot verweist auf einen begonnenen Dienst'};
  const pending=market.data?.find(row=>row.status==='PENDING_MANAGER');
  if(!pending)return {error:'Kein verknüpftes Demo-Angebot zur Prüfung vorhanden'};
  const accepted=await client.rpc('manager_review_shift_swap',{p_swap_id:pending.id,p_decision:'APPROVE'});
  const plans=JSON.parse(sessionStorage.getItem('sf_demo_data_assignments'));
  const people=JSON.parse(sessionStorage.getItem('sf_demo_data_employees'));
  const target=people.find(person=>`${person.first} ${person.last}`===pending.claimed_by);
  return {absence:overview.data?.absences?.some(a=>a.employee_id==='demo-e01'&&a.status==='Genehmigt'),reviewError:reviewed.error?.message,marketError:accepted.error?.message,assigned:plans.find(p=>p.id===pending.assignment_id)?.employeeId,target:target?.id,assignmentId:pending.assignment_id,absenceId:submitted.data};
 });
 expect(workflow.error||workflow.reviewError||workflow.marketError).toBeFalsy();
 expect(workflow.absence).toBe(true);
 expect(workflow.assigned).toBe(workflow.target);
 const guards=await page.evaluate(async()=>{
  const client=window.SFBackend.client,before=sessionStorage.getItem('sf_demo_datev_v2');
  const invalid=[await client.from('employees').insert({first_name:'X'}),await client.from('employees').upsert({id:'x'}),await client.from('employees').update({first_name:'X'}).eq('id','demo-e01'),await client.rpc('manager_set_time_account_opening',{})];
  await client.from('time_account_settings').upsert({federal_state:'DE-BY'});
  return {codes:invalid.map(x=>x.error?.code),datevUnchanged:before===sessionStorage.getItem('sf_demo_datev_v2')};
 });
 expect(guards.codes).toEqual(Array(4).fill('SF_DEMO_UNHANDLED'));expect(guards.datevUnchanged).toBe(true);
 const started=await page.evaluate(()=>sessionStorage.getItem('sf_demo_started_at_v1'));
 await page.reload();await waitForDemoReady(page,{scenarios:true});
 const resumed=await page.evaluate(({assignmentId,absenceId})=>({assignment:JSON.parse(sessionStorage.getItem('sf_demo_data_assignments')).find(a=>a.id===assignmentId)?.employeeId,absence:JSON.parse(sessionStorage.getItem('sf_demo_absence_requests_v1')).find(a=>a.id===absenceId)?.status,started:sessionStorage.getItem('sf_demo_started_at_v1')}),workflow);
 expect(resumed.assignment).toBe(workflow.target);expect(resumed.absence).toBe('Genehmigt');expect(resumed.started).toBe(started);
 await page.locator('#sfDemoResetBtn').click();await Promise.all([page.waitForEvent('load'),page.locator('.sf-demo-reset-confirm').click()]);await waitForDemoReady(page,{scenarios:true});
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('sf_demo_time_account_settings_v1')).federal_state)).not.toBe('DE-BY');
 const reset=await page.evaluate(({assignmentId,absenceId})=>({assignment:JSON.parse(sessionStorage.getItem('sf_demo_data_assignments')).find(a=>a.id===assignmentId)?.employeeId,absence:JSON.parse(sessionStorage.getItem('sf_demo_absence_requests_v1')||'[]').some(a=>a.id===absenceId)}),workflow);
 expect(reset.assignment).not.toBe(workflow.target);expect(reset.absence).toBe(false);
 await page.evaluate(()=>window.switchView('reports'));
 await expect(page.locator('#sfReportsWorkspace')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>!!window.SFReports?.getResult())).toBe(true);
 await demoPerspectiveSwitch(page).locator('[data-demo-perspective="employee"]').click();
 await expect(page.locator('#sfEmployeePortal')).toBeVisible();
 expect(await page.evaluate(()=>({role:window.SFBackend.accessRole,canPlan:window.SFBackend.can('plan')}))).toEqual({role:'EMPLOYEE',canPlan:false});
 const employeeNav=page.locator('#sfEmployeePortal .sf-orbit-dock');await expect(employeeNav).toBeVisible();
 await expect.poll(async()=>{const d=await demoDock.boundingBox(),n=await employeeNav.boundingBox();return d&&n?n.y-(d.y+d.height):-999}).toBeGreaterThanOrEqual(4);
 const integrity=await page.evaluate(()=>{const p=window.SFBackend.employeePortalData,ids=new Set(JSON.parse(sessionStorage.getItem('sf_demo_data_assignments')).filter(a=>a.publishedAt||a._dbStatus==='PUBLISHED').map(a=>a.id));return p.shifts.every(s=>ids.has(s.id))});
 expect(integrity).toBe(true);
 await page.locator('#sfDemoTourRestartBtn').click();
 const tour=page.locator('#sfDemoTourCard');
 const tourTargets=['#sfTodayWorkspace .sf-td-head','#sfTodayActions .sf-td-section-head','#view-schedule .cal-toolbar','#view-auto .page-head','#sfMarketTabs','#view-absence .page-head','#view-time .page-head','#sfReportsWorkspace .sf-rp-head','#sfDatevMonth','#sfEmployeePortal .sf-portal-welcome','#sfDemoControlDock'];
 const tourTitles=['Willkommen bei SchichtFunk','Heute im Blick','Dienstplan bearbeiten','Planungsvorschlag erstellen','Schichten anbieten und übernehmen','Abwesenheiten verwalten','Arbeitszeiten prüfen','Auswertungen ansehen','DATEV-Beispiel prüfen','Mitarbeiterperspektive erleben','Demo selbst ausprobieren'];
 for(let i=0;i<tourTitles.length;i++){
  await expect(tour.locator('h2')).toHaveText(tourTitles[i],{timeout:15000});
  await expect(tour.locator('.sf-demo-tour-count')).toHaveText(`${i+1} / ${tourTitles.length}`);
  await expect(page.locator(tourTargets[i])).toHaveClass(/sf-demo-tour-target/,{timeout:10000});
  const marker=page.locator('#sfDemoTourMarker');await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute('data-step',String(i+1));
  await expect(marker).toHaveAttribute('data-positioned',String(i+1));
  await expect(page.locator('#sfDemoTourLayer')).toHaveCount(0);
  const geometry=await page.evaluate(()=>{const c=document.getElementById('sfDemoTourCard').getBoundingClientRect(),m=document.getElementById('sfDemoTourMarker').getBoundingClientRect();return {inside:c.top>=0&&c.left>=0&&c.right<=innerWidth+1&&c.bottom<=innerHeight+1,overlap:Math.max(0,Math.min(c.right,m.right)-Math.max(c.left,m.left))*Math.max(0,Math.min(c.bottom,m.bottom)-Math.max(c.top,m.top)),fits:m.top>=c.height+28||innerHeight-m.bottom>=c.height+28||m.left>=c.width+28||innerWidth-m.right>=c.width+28};});
  expect(geometry.inside).toBe(true);
  if(geometry.fits)expect(geometry.overlap).toBeLessThanOrEqual(5);

  if(i===9)await expect(page.locator('#sfEmployeePortal')).toBeVisible();
  await tour.locator('.sf-demo-tour-next').click();
 }
 await expect(tour).toHaveCount(0);
 await expect(page.locator('#sfDemoTourRestartBtn')).toBeVisible();
 await demoPerspectiveSwitch(page).locator('[data-demo-perspective="manager"]').click();
 await expect(page.locator('#sfHelpButton')).toHaveAttribute('aria-label','Hilfe öffnen');
 expect(forbidden).toEqual([]);
});

