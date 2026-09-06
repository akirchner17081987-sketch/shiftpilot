import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../demo.html',import.meta.url),'utf8');
const demo=fs.readFileSync(new URL('../assets/demo-mode-v1.js',import.meta.url),'utf8');
const roles=fs.readFileSync(new URL('../assets/demo-role-switch-v1.js',import.meta.url),'utf8');
const access=fs.readFileSync(new URL('../assets/supabase-employee-access-v1.js',import.meta.url),'utf8');
const portal=fs.readFileSync(new URL('../assets/employee-portal-vertical-layout-v1.js',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../assets/demo-marketplace-v1.js',import.meta.url),'utf8');
const tracking=fs.readFileSync(new URL('../assets/supabase-time-tracking-v1.js',import.meta.url),'utf8');
const accounts=fs.readFileSync(new URL('../assets/supabase-time-accounts-v1.js',import.meta.url),'utf8');
const holidays=fs.readFileSync(new URL('../assets/supabase-time-account-holidays-v1.js',import.meta.url),'utf8');
const brand=fs.readFileSync(new URL('../assets/schichtfunk-brand-cleanup-v2.js',import.meta.url),'utf8');

test('protected demo loads the perspective switcher',()=>{
  assert.match(page,/scrollbar-design-v1\.js/);
  assert.match(page,/demo-role-switch-v1\.js/);
  assert.match(roles,/sf_demo_session_v1/);
  assert.match(roles,/sf_demo_perspective_v1/);
});

test('manager and employee perspectives use the existing employee portal',()=>{
  assert.match(roles,/B\.openEmployeePortal\(\)/);
  assert.match(roles,/B\.restoreNonEmployeeShell\?\.\(\)/);
  assert.match(access,/B\.restoreNonEmployeeShell=restoreNonEmployeeShell/);
  assert.match(demo,/PERSPECTIVE_KEY/);
  assert.match(demo,/\?'EMPLOYEE':'ADMIN'/);
});

test('employee perspective derives its contents from the shared demo data',()=>{
  assert.match(roles,/EMPLOYEE_NO='D001'/);
  assert.match(roles,/allAssignments=assignments/);
  assert.match(roles,/allAbsences=absences/);
  assert.match(roles,/entries=timeEntries/);
  assert.match(roles,/Demo-Profil:/);
  assert.match(roles,/employee_my_time_account_month/);
  assert.match(roles,/employeeAccount\(args\.p_month\)/);
  assert.match(demo,/previewEmployee/);
  assert.match(demo,/for\(const offset of \[7,9\]\)/);
});

test('employee demo includes interactive replacement requests with rolling dates',()=>{
  assert.match(roles,/sf_demo_disruption_offers_v1/);
  assert.match(roles,/employee_list_disruption_offers/);
  assert.match(roles,/employee_respond_disruption_offer/);
  assert.match(roles,/offer_status:'OFFERED'/);
  assert.match(roles,/offer_status:'DECLINED'/);
  assert.match(roles,/futureStamp\(1,'15:00'\)/);
  assert.match(roles,/saveDisruptionOffers\(offers\)/);
  assert.match(roles,/wrapped\.__sfDemoCloudV2=rpc\.__sfDemoCloudV2===true/);
});

test('employee demo includes interactive shift-change presentation data',()=>{
  assert.match(roles,/sf_demo_shift_changes_v1/);
  assert.match(roles,/status:'PENDING_EMPLOYEE'/);
  assert.match(roles,/status:'APPLIED'/);
  assert.match(roles,/status:'REJECTED'/);
  assert.match(roles,/Dienstplananpassung/);
  assert.match(roles,/requests:clone\(changeState\.requests\)/);
  assert.match(roles,/patchEmployeeHydrate/);
});

test('employee demo includes local absence presentation data',()=>{
  assert.match(roles,/sf_demo_absence_requests_v1/);
  assert.match(roles,/absence_type:'Fortbildung'/);
  assert.match(roles,/absence_type:'Urlaub'/);
  assert.match(roles,/absence_type:'Frei'/);
  assert.match(roles,/status:'Beantragt'/);
  assert.match(roles,/status:'Genehmigt'/);
  assert.match(roles,/status:'Abgelehnt'/);
  assert.match(roles,/absenceRequests\(employee\.id\)/);
});

test('perspective selector is clearly labelled and reports its state',()=>{
  assert.match(roles,/role=\"group\"/);
  assert.match(roles,/aria-label=\"Demo-Perspektive wechseln\"/);
  assert.match(roles,/aria-pressed/);
  assert.match(roles,/Manager/);
  assert.match(roles,/Mitarbeiter/);
});

test('employee portal uses the full workspace width',()=>{
  assert.match(portal,/#sfEmployeePortal \.sf-portal-main\{max-width:none/);
  assert.match(roles,/#sfEmployeePortal \.sf-portal-main\{max-width:none!important/);
});

test('demo time entries persist and monthly accounts use compatible data',()=>{
  assert.match(roles,/demo-employee-shift-/);
  assert.match(adapter,/employee_submit_time_entry/);
  assert.match(adapter,/row\.entry_status='recorded'/);
  assert.match(adapter,/return \{data:managerAccountRows\(args\.p_month\),error:null\}/);
  assert.match(accounts,/Array\.isArray\(payload\?\.rows\)/);
  assert.match(tracking,/Die Pause muss kürzer als die gesamte Arbeitszeit sein/);
  assert.match(tracking,/toLocaleString\('de-DE'/);
});

test('time account month selection stays separate from DATEV month selection',()=>{
  assert.match(brand,/id="sfDatevMonth"/);
  assert.doesNotMatch(brand,/id="sfTaMonth" type="month"/);
  assert.match(brand,/data-sf-ta-tab="account"/);
  assert.match(brand,/data-sf-ta-tab="datev"/);
  assert.match(brand,/sf-ta-account-pane/);
  assert.match(brand,/sf-ta-datev-pane/);
  assert.match(holidays,/B\.employeeFinanceMonth\|\|new Date/);
  assert.match(holidays,/sf:employee-finance-month-change/);
});
