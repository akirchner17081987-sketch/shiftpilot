import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const safeEqual=(left:string,right:string)=>{
  if(left.length!==right.length)return false;
  let difference=0;
  for(let index=0;index<left.length;index++)difference|=left.charCodeAt(index)^right.charCodeAt(index);
  return difference===0;
};
const message=(error:unknown)=>String((error as {message?:string})?.message||error||'UNKNOWN_WORKER_ERROR').slice(0,1800);
const berlinDate=()=>{
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date());
  const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

Deno.serve(async req=>{
  if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  const expected=Deno.env.get('PRIVACY_WORKER_TOKEN')||'';
  const supplied=req.headers.get('x-privacy-worker-token')||'';
  if(!expected||!safeEqual(supplied,expected))return json({error:'UNAUTHENTICATED'},401);

  const url=Deno.env.get('SUPABASE_URL')||'';
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!serviceKey)return json({error:'NOT_CONFIGURED'},503);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const workerId=`privacy-${Deno.env.get('SB_EXECUTION_ID')||crypto.randomUUID()}`.slice(0,200);
  let batchSize=5;
  try{
    const body=await req.json();
    const requested=Number(body?.batchSize);
    if(Number.isInteger(requested))batchSize=Math.max(1,Math.min(requested,10));
  }catch{}

  const processed:Array<Record<string,unknown>>=[];
  for(let index=0;index<batchSize;index++){
    const claim=await admin.rpc('server_claim_due_privacy_request',{p_worker_id:workerId});
    if(claim.error)return json({error:'CLAIM_FAILED',detail:message(claim.error),processed},500);
    const request=claim.data as null|{id:string;execution_phase:'ACCESS'|'ERASURE'};
    if(!request)break;

    const outcome:Record<string,unknown>={};
    try{
      if(request.execution_phase==='ACCESS'){
        const applied=await admin.rpc('server_execute_privacy_access',{
          p_request_id:request.id,p_worker_id:workerId
        });
        if(applied.error)throw applied.error;
        processed.push({id:request.id,phase:'ACCESS',status:'ACCESS_REVOKED'});
        continue;
      }

      const planned=await admin.rpc('server_privacy_erasure_external_plan',{
        p_request_id:request.id,p_worker_id:workerId
      });
      if(planned.error)throw planned.error;
      const plan=planned.data as {
        bucket:string;delete_storage:boolean;storage_paths:string[];
        delete_auth_account:boolean;auth_user_id:string|null;
      };

      let storageDeleted=0;
      if(plan.delete_storage&&plan.storage_paths.length){
        const removed=await admin.storage.from(plan.bucket).remove(plan.storage_paths);
        if(removed.error)throw removed.error;
        for(const path of plan.storage_paths){
          const slash=path.lastIndexOf('/');
          const folder=path.slice(0,slash);
          const filename=path.slice(slash+1);
          const listed=await admin.storage.from(plan.bucket).list(folder,{limit:100,search:filename});
          if(listed.error)throw listed.error;
          if((listed.data||[]).some(row=>row.name===filename))throw new Error('STORAGE_DELETE_NOT_CONFIRMED');
        }
        const marked=await admin.rpc('server_mark_privacy_storage_deleted',{
          p_request_id:request.id,p_worker_id:workerId,p_storage_paths:plan.storage_paths
        });
        if(marked.error)throw marked.error;
        storageDeleted=Number(marked.data||0);
      }
      outcome.storage={requested:plan.delete_storage,objects_deleted:plan.storage_paths.length,metadata_deleted:storageDeleted};

      let authDeleted=false;
      if(plan.delete_auth_account&&plan.auth_user_id){
        const current=await admin.auth.admin.getUserById(plan.auth_user_id);
        if(current.error&&current.error.status!==404&&current.error.code!=='user_not_found')throw current.error;
        if(!current.error&&current.data.user){
          const deleted=await admin.auth.admin.deleteUser(plan.auth_user_id,false);
          if(deleted.error)throw deleted.error;
        }
        authDeleted=true;
      }
      outcome.auth={requested:plan.delete_auth_account,account_deleted:authDeleted};

      const applied=await admin.rpc('server_apply_employee_offboarding_erasure',{
        p_request_id:request.id,p_worker_id:workerId
      });
      if(applied.error)throw applied.error;
      const finished=await admin.rpc('server_finish_privacy_request',{
        p_request_id:request.id,p_worker_id:workerId,p_succeeded:true,
        p_outcome:{external_erasure:outcome},p_error:null
      });
      if(finished.error)throw finished.error;
      processed.push({id:request.id,phase:'ERASURE',status:'COMPLETED'});
    }catch(error){
      const failed=await admin.rpc('server_fail_privacy_request',{
        p_request_id:request.id,p_worker_id:workerId,
        p_outcome:{worker_failure:{external_steps:outcome}},p_error:message(error)
      });
      processed.push({id:request.id,phase:request.execution_phase,status:'BLOCKED',failureRecorded:!failed.error});
    }
  }

  const retention=await admin.rpc('server_run_due_privacy_longterm_redactions',{
    p_as_of:berlinDate(),p_limit:5
  });
  if(retention.error)return json({error:'RETENTION_REDACTION_FAILED',detail:message(retention.error),processed},500);

  return json({ok:true,workerId,processed,count:processed.length,retention:retention.data});
});
