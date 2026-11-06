import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

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
