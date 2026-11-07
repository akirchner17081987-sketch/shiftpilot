import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Window} from 'happy-dom';

const code=readFileSync(new URL('../assets/employee-company-switch-v1.js',import.meta.url),'utf8');

function setup({enabled=true,stored='',employeeEntry=true,memberships=[],choices=[],profileCompany,profileEmployee}={}) {
  const calls=[];
  const session=new Map(stored?[['sfEmployeeCompany:user-1',stored]]:[]);
  const B={user:{id:'user-1'},ready:true,__sfEmployeeMultiCompanyReady:enabled,
    ensureCompany:async()=>{calls.push('legacy');return 'legacy'},
    hydrateEmployee:async()=>{},openEmployeePortal:()=>{}};
  B.client={from(table){
    const query={select(){return query},eq(){return query},then(resolve,reject){return Promise.resolve({data:table==='company_members'?memberships:choices.map(x=>({id:x.employee_id,company_id:x.company_id})),error:null}).then(resolve,reject)}};
    return query;
  },async rpc(name,params){calls.push([name,params]);
    if(name==='employee_company_options')return {data:choices,error:null};
    if(name==='employee_company_profile'){
      const c=choices.find(x=>x.company_id===params.p_company);
      return {data:{company:{id:profileCompany??c.company_id},employee:{id:profileEmployee??c.employee_id}},error:null};
    }
    throw Error('Unexpected RPC '+name);
  }};
  const context={window:{SFBackend:B},location:{search:employeeEntry?'?bereich=mitarbeiter':''},URLSearchParams,
    sessionStorage:{getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v)},document:{getElementById(){return null}},console};
  vm.runInNewContext(code,context);
  return {B,calls};
}

const choices=[{company_id:'a',employee_id:'ea',company_name:'QA A'},{company_id:'b',employee_id:'eb',company_name:'QA B'}];
test('company selector opens accessible company cards from the portal header',()=>{
  const w=new Window({url:'https://qa.invalid/?bereich=mitarbeiter'});
  const B={__sfEmployeeMultiCompanyReady:true,__sfMultiEmployee:true,__sfEmployeeOptions:choices,companyId:'a',user:{id:'qa'},
    ensureCompany:async()=>{},hydrateEmployee:async()=>{},openEmployeePortal(){w.document.body.innerHTML='<div id="sfEmployeePortal"><header class="sf-portal-top"></header><main class="sf-portal-main"></main></div>'}};
  w.SFBackend=B;w.eval(code);B.openEmployeePortal();
  const bar=w.document.getElementById('sfEmployeeCompanySwitch');
  assert.ok(bar);assert.equal(bar.parentElement.className,'sf-portal-top');assert.equal(bar.querySelector('select').value,'a');
  const trigger=bar.querySelector('button');trigger.click();const menu=w.document.getElementById('sfEmployeeCompanyMenu');
  assert.ok(menu);assert.equal(menu.querySelectorAll('.sf-employee-company-option').length,2);
  assert.equal(menu.querySelector('[aria-current="true"] b').textContent,'QA A');
  assert.equal(trigger.getAttribute('aria-expanded'),'true');
  menu.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(w.document.getElementById('sfEmployeeCompanyMenu'),null);assert.equal(trigger.getAttribute('aria-expanded'),'false');
  w.close();
});
test('employee company menu groups only authorized options and keeps ungrouped companies visible',async()=>{
  const w=new Window({url:'https://qa.invalid/?bereich=mitarbeiter'});
  const B={__sfEmployeeMultiCompanyReady:true,__sfMultiEmployee:true,__sfEmployeeOptions:choices,companyId:'a',user:{id:'qa'},
    client:{rpc:async()=>({data:[{company_id:'a',group_label:'Testgruppe'},{company_id:'foreign',group_label:'Fremd'}],error:null})},
    ensureCompany:async()=>{},hydrateEmployee:async()=>{},openEmployeePortal(){w.document.body.innerHTML='<div id="sfEmployeePortal"><header class="sf-portal-top"></header><main class="sf-portal-main"></main></div>'}};
  w.SFBackend=B;w.eval(code);B.openEmployeePortal();w.document.querySelector('.sf-employee-company-trigger').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  const menu=w.document.getElementById('sfEmployeeCompanyMenu');
  assert.equal(menu.querySelector('summary').textContent,'Testgruppe');assert.equal(menu.querySelector('details').open,true);
  assert.equal(menu.querySelectorAll('.sf-employee-company-option').length,2);
  assert.equal(menu.querySelector('.sf-employee-company-other b').textContent,'QA B');
  assert.doesNotMatch(menu.textContent,/Fremd/);w.close();
});
test('disabled switch delegates to existing portal',async()=>{
  const {B,calls}=setup({enabled:false,choices});assert.equal(await B.ensureCompany(),'legacy');assert.deepEqual(calls,['legacy']);
});
test('selected company resolves its own profile without QA adapter',async()=>{
  const {B}=setup({stored:'b',choices});await B.ensureCompany();assert.equal(B.companyId,'b');assert.equal(B.employeeDbId,'eb');assert.equal(B.role,'EMPLOYEE');
});
test('wrong returned company or employee cannot initialize portal',async()=>{
  for(const override of [{profileCompany:'foreign'},{profileEmployee:'other'}]){
    const {B}=setup({choices,...override});await assert.rejects(B.ensureCompany(),/stimmt nicht/);assert.notEqual(B.employeeDbId,'other');
  }
});
test('no active profiles fails closed',async()=>{
  const {B}=setup();await assert.rejects(B.ensureCompany(),/kein aktives Mitarbeiterprofil/);
});
test('management entry preserves the existing active management session',async()=>{
  const {B,calls}=setup({employeeEntry:false,memberships:[{company_id:'b',status:'ACTIVE',role:'PLANNER'}],choices});
  assert.equal(await B.ensureCompany(),'legacy');assert.ok(calls.includes('legacy'));
});

test('link action stays hidden until the multi-company feature is enabled',()=>{
  const source=readFileSync(new URL('../assets/team-admin-v1.js',import.meta.url),'utf8');
  const start=source.indexOf('  function draw(host){'),end=source.indexOf('  B.renderUserManagement=');
  assert.ok(start>=0&&end>start);
  const drawFactory=new Function('rows','enabled',`const B={__sfMultiRoleInvitesReady:enabled},roles={TEAM_LEAD:['Teamleiter']},roleShort={},statusIcon={active:'ok'};
    const esc=s=>String(s??''),employeeName=r=>r.email,statusKey=()=> 'active',state=()=> 'Aktiv',canAdminister=()=>true,roleDetails=()=>'';
    const editRole=()=>{},linkExistingProfile=()=>{},toggleAccess=()=>{},revoke=()=>{},invite=()=>{};
    ${source.slice(start,end)}
    let list={innerHTML:''},count={textContent:''};const host={querySelector(q){if(q==='#sfUsersList')return list;if(q==='#sfUsersCount')return count;return null},querySelectorAll(){return []}};
    draw(host);return list.innerHTML;`);
  const row={record_id:'u',kind:'MEMBER',role:'TEAM_LEAD',status:'ACTIVE',employee_id:null,email:'qa@example.invalid',permissions:[]};
  assert.doesNotMatch(drawFactory([row],false),/data-link-profile/);
  assert.match(drawFactory([row],true),/data-link-profile/);
  assert.doesNotMatch(drawFactory([{...row,employee_id:'existing'}],true),/data-link-profile/);
});
