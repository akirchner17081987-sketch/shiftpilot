import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/supabase-employee-access-guard-v1.js',import.meta.url),'utf8');
const member=(overrides={})=>({company_id:'company-a',role:'PLANNER',status:'ACTIVE',extra_permissions:[],...overrides});
const employee=(overrides={})=>({id:'employee-a',company_id:'company-a',auth_user_id:'user-a',status:'active',access_status:'ACTIVE',deleted_at:null,...overrides});
function setup({area='mitarbeiter',members=[member()],own=employee(),error=null}={}){
 const calls=[];
 const B={user:{id:'user-a'},role:'PLANNER',companyId:'previous-company',employeePortalData:{employee:{id:'previous-employee'}},ensureCompany:async()=>{calls.push('bootstrap')},pickCompanyMembership:rows=>rows.find(r=>r.company_id==='preferred-company')||rows[0],client:{from(table){const filters=[];let single=false;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle(){single=true;return q},then(resolve,reject){calls.push({table,filters});const rows=table==='company_members'?members:own?[own]:[];return Promise.resolve({data:single?rows[0]||null:rows,error}).then(resolve,reject)}};return q;}}};
 vm.runInNewContext(source,{window:{SFBackend:B,location:{search:area?'?bereich='+area:''}},URLSearchParams});return {B,calls};
}
test('a linked team leader enters their personal workspace without changing the membership',async()=>{
 const members=[member()],{B,calls}=setup({members});await B.ensureCompany();
 assert.equal(B.role,'EMPLOYEE');assert.equal(B.employeeDbId,'employee-a');assert.equal(B.companyId,'company-a');assert.equal(B.employeePortalData,null);
 assert.equal(members[0].role,'PLANNER');assert.ok(!calls.includes('bootstrap'));
 assert.deepEqual(calls.find(c=>c.table==='employees').filters,[['auth_user_id','user-a']]);
});
for(const area of ['verwaltung','zeitkonto',''])test(`${area||'legacy'} keeps the verified management membership`,async()=>{
 const {B,calls}=setup({area,members:[member(),member({company_id:'preferred-company',role:'ADMIN'})]});await B.ensureCompany();
 assert.equal(B.role,'ADMIN');assert.equal(B.companyId,'preferred-company');assert.equal(B.employeeDbId,null);assert.equal(B.employeeRecord,null);assert.equal(calls.length,1);
});
test('employee entry follows the own linked company without changing the manager company preference',async()=>{
 const {B}=setup({members:[member({company_id:'preferred-company',role:'OWNER'}),member()]});await B.ensureCompany();assert.equal(B.companyId,'company-a');assert.equal(B.role,'EMPLOYEE');
});
for(const role of ['OWNER','ADMIN','PLANNER','DISPATCHER'])test(`${role} can use an active linked employee profile`,async()=>{const {B}=setup({members:[member({role})]});await B.ensureCompany();assert.equal(B.role,'EMPLOYEE')});
for(const overrides of [{status:'DISABLED'},{role:'VIEWER'},{role:'TIME_TRACKING'},{extra_permissions:['read_only']}])test(`restricted membership cannot gain employee capabilities: ${JSON.stringify(overrides)}`,async()=>{
 const {B,calls}=setup({members:[member(overrides)]});await assert.rejects(B.ensureCompany(),/nicht freigegeben/);assert.ok(!calls.includes('bootstrap'));assert.equal(B.employeeDbId,null);
});
for(const overrides of [{status:'inactive'},{access_status:'DISABLED'},{access_status:'NONE'},{deleted_at:'2026-10-01'}])test(`inactive employee cannot enter: ${JSON.stringify(overrides)}`,async()=>{
 const {B}=setup({own:employee(overrides)});await assert.rejects(B.ensureCompany(),/nicht freigegeben/);
});
test('missing own link gives an actionable error instead of bootstrapping or redirecting to management',async()=>{
 const {B,calls}=setup({own:null});await assert.rejects(B.ensureCompany(),/kein persönliches Mitarbeiterprofil/);assert.ok(!calls.includes('bootstrap'));
});
test('ordinary employee stays in employee workspace even through management URL',async()=>{
 const {B}=setup({area:'verwaltung',members:[]});await B.ensureCompany();assert.equal(B.role,'EMPLOYEE');
});
test('membership errors fail closed',async()=>{const {B}=setup({error:new Error('network unavailable')});await assert.rejects(B.ensureCompany(),/network unavailable/)});
test('resolved entry does not leak the previous employee when reusing the backend context',async()=>{
 const {B}=setup();await B.ensureCompany();B.employeePortalData={employee:{id:'old'}};await B.ensureCompany();assert.equal(B.employeePortalData,null);assert.equal(B.employeeRecord.id,'employee-a');
});
