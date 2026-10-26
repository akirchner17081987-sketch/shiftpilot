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
 assert.deepEqual(b.calls,['server_stage_employee_erasure','server_record_employee_erasure_step','remove-files','server_record_employee_erasure_step','server_commit_employee_erasure','delete-login','server_record_employee_erasure_step','server_finish_employee_erasure']);
});
test('a storage failure leaves database deletion unstarted',async()=>{
 const b=backend({storageError:true});await assert.rejects(runEmployeeErasure(b,request,'actor'));assert.deepEqual(b.calls,['server_stage_employee_erasure','server_record_employee_erasure_step','remove-files']);
});
test('remaining storage metadata prevents login deletion and success',async()=>{
 const b=backend({commitError:true});await assert.rejects(runEmployeeErasure(b,request,'actor'));assert(!b.calls.includes('delete-login'));assert(!b.calls.includes('server_finish_employee_erasure'));
});
test('a failed login deletion never reports completion',async()=>{
 const b=backend({authError:true});await assert.rejects(runEmployeeErasure(b,request,'actor'));assert(!b.calls.includes('server_finish_employee_erasure'));
});
test('an interrupted external phase resumes without repeating committed database erasure',async()=>{
 const b=backend({databaseDone:true});assert.equal((await runEmployeeErasure(b,request,'actor')).verified,true);
 assert.deepEqual(b.calls,['server_stage_employee_erasure','server_record_employee_erasure_step','delete-login','server_record_employee_erasure_step','server_finish_employee_erasure']);
});
test('pending database batches never delete the login or report verified completion',async()=>{
 const b=backend(),original=b.rpc;
 b.rpc=async(name,args)=>{
  if(name==='server_commit_employee_erasure'){b.calls.push(name);return{data:{database_done:false,phase:'AUDIT',processed:500}};}
  return original(name,args);
 };
 assert.deepEqual(await runEmployeeErasure(b,request,'actor'),{database_done:false,complete:false,pending:true,phase:'AUDIT',processed:500});
 assert.equal(b.calls.filter(x=>x==='server_commit_employee_erasure').length,8);
 assert(!b.calls.includes('delete-login'));
 assert(!b.calls.includes('server_finish_employee_erasure'));
});
test('database batches resume and finish only after database_done is explicitly true',async()=>{
 const b=backend(),original=b.rpc;let batches=0;
 b.rpc=async(name,args)=>{
  if(name==='server_commit_employee_erasure'&&++batches<3){b.calls.push(name);return{data:{database_done:false,phase:'SHARED_DATA'}};}
  return original(name,args);
 };
 assert.equal((await runEmployeeErasure(b,request,'actor')).verified,true);
 assert.equal(b.calls.filter(x=>x==='server_commit_employee_erasure').length,3);
 assert.equal(b.calls.at(-1),'server_finish_employee_erasure');
});
test('pending responses preserve server progress and phase measurements',async()=>{
 const b=backend(),original=b.rpc;
 b.rpc=async(name,args)=>name==='server_commit_employee_erasure'?{data:{database_done:false,phase:'SHARED_DATA',percentage:48,phaseMs:{SHARED_DATA:2500}}}:original(name,args);
 const result=await runEmployeeErasure(b,request,'actor');
 assert.equal(result.percentage,48);assert.deepEqual(result.phaseMs,{SHARED_DATA:2500});assert.equal(result.pending,true);assert(!b.calls.includes('delete-login'));
});
test('verification continues in bounded batches and never reports pending work as complete',async()=>{
 const b=backend({databaseDone:true}),original=b.rpc;
 b.rpc=async(name,args)=>{
  if(name==='server_finish_employee_erasure'){b.calls.push(name);return{data:{complete:false,pending:true,phase:'VERIFY',percentage:96}};}
  return original(name,args);
 };
 const result=await runEmployeeErasure(b,request,'actor');
 assert.equal(result.complete,false);assert.equal(result.percentage,96);
 assert.equal(b.calls.filter(x=>x==='server_finish_employee_erasure').length,8);
 assert.equal(b.calls.filter(x=>x==='delete-login').length,1);
});
