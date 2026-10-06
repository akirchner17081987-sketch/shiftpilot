import test from 'node:test';
import assert from 'node:assert/strict';
import {parseErasureRequest,runEmployeeErasure} from '../supabase/functions/_shared/employee-erasure.mjs';

const request={companyId:'10000000-0000-0000-0000-000000000001',employeeId:'20000000-0000-0000-0000-000000000001',
 operationId:'30000000-0000-0000-0000-000000000001',confirmation:'Fixture Employee',acknowledged:true,fingerprint:'a'.repeat(32)};
function backend({storageError=false,commitError=false,authError=false,databaseDone=false}={}){
 const calls=[];const plan={storage_paths:['company/employee/file.pdf'],delete_auth:true,auth_user_id:'40000000-0000-0000-0000-000000000001'};
 return{calls,rpc:async(name,args)=>{calls.push(name);if(name==='server_stage_employee_erasure')return{data:{job_id:request.operationId,status:databaseDone?'DATABASE_DONE':'EXTERNAL',plan}};
  if(name==='server_commit_employee_erasure'&&commitError)return{error:{message:'Dokumente sind noch vorhanden'}};return{data:name==='server_finish_employee_erasure'?{complete:true,verified:true}:{database_done:true}};},
  storage:{from:()=>({remove:async()=>{calls.push('remove-files');return storageError?{error:{message:'offline'}}:{data:[]};}})},
  auth:{admin:{getUserById:async()=>({data:{user:{id:plan.auth_user_id}}}),deleteUser:async()=>{calls.push('delete-login');return authError?{error:{message:'offline'}}:{data:{}};}}}};
}
test('a name and explicit acknowledgement are required before staging',()=>{
 assert.deepEqual(parseErasureRequest(request),request);
 for(const change of [{acknowledged:false},{employeeId:'not-a-uuid'},{operationId:undefined},{confirmation:22},{fingerprint:'wrong'}])assert.throws(()=>parseErasureRequest({...request,...change}));
});
test('completion is returned only after file deletion, database deletion, login deletion and independent verification',async()=>{
 const b=backend();assert.equal((await runEmployeeErasure(b,request,'actor')).complete,true);
 assert.deepEqual(b.calls,['server_stage_employee_erasure','remove-files','server_commit_employee_erasure','delete-login','server_finish_employee_erasure']);
});
test('a storage failure leaves database deletion unstarted',async()=>{
 const b=backend({storageError:true});await assert.rejects(runEmployeeErasure(b,request,'actor'));assert.deepEqual(b.calls,['server_stage_employee_erasure','remove-files']);
});
test('remaining storage metadata prevents login deletion and success',async()=>{
 const b=backend({commitError:true});await assert.rejects(runEmployeeErasure(b,request,'actor'));assert(!b.calls.includes('delete-login'));assert(!b.calls.includes('server_finish_employee_erasure'));
});
test('a failed login deletion never reports completion',async()=>{
 const b=backend({authError:true});await assert.rejects(runEmployeeErasure(b,request,'actor'));assert(!b.calls.includes('server_finish_employee_erasure'));
});
test('an interrupted external phase resumes without repeating committed database erasure',async()=>{
 const b=backend({databaseDone:true});assert.equal((await runEmployeeErasure(b,request,'actor')).verified,true);
 assert.deepEqual(b.calls,['server_stage_employee_erasure','delete-login','server_finish_employee_erasure']);
});
