import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { authorizeLifecycleRequest, lifecycleCors, parseLifecycleRequest, readJwtAal, readJwtSessionId } from "../_shared/privacy-lifecycle.js";

const json=(body:unknown,status=200,headers:HeadersInit={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});

Deno.serve(async req=>{
  const cors=lifecycleCors(req);
  if(!cors)return json({error:'ORIGIN_REJECTED'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405,cors);
  const authorization=req.headers.get('authorization')||'';
  const token=authorization.replace(/^Bearer\s+/i,'');
  if(!token)return json({error:'UNAUTHENTICATED'},401,cors);

  let request;
  try{request=parseLifecycleRequest(await req.json())}
  catch(error){return json({error:String((error as Error).message||error)},400,cors)}

  const url=Deno.env.get('SUPABASE_URL')||'';
  const anonKey=Deno.env.get('SUPABASE_ANON_KEY')||'';
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!anonKey||!serviceKey)return json({error:'NOT_CONFIGURED'},503,cors);

  const userClient=createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser(token);
  if(userError||!userData.user)return json({error:'UNAUTHENTICATED'},401,cors);

  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:membership,error:membershipError}=await admin.from('company_members')
    .select('company_id,user_id,role,status').eq('company_id',request.companyId)
    .eq('user_id',userData.user.id).maybeSingle();
  if(membershipError)return json({error:'MEMBERSHIP_CHECK_FAILED'},500,cors);

  try{authorizeLifecycleRequest({membership,userId:userData.user.id,aal:readJwtAal(token),request})}
  catch(error){
    const code=String((error as Error).message||error);
    return json({error:code},code==='MFA_REQUIRED'?403:code==='UNAUTHENTICATED'?401:403,cors);
  }

  let sessionId:string|null=null;
  if(['stage-sole-owner','confirm-sole-owner','stage-retention-profile','replace-retention-profile','confirm-retention-profile'].includes(request.action)){
    try{sessionId=readJwtSessionId(token)}
    catch{return json({error:'SESSION_REQUIRED'},403,cors)}
  }

  if(request.action==='retention-status'){
    const {data,error}=await admin.rpc('server_privacy_retention_status',{p_company_id:request.companyId});
    return error?json({error:'RETENTION_STATUS_FAILED'},400,cors):json({ok:true,status:data},200,cors);
  }

  if(request.action==='preview'){
    const {data,error}=await admin.rpc('server_employee_offboarding_preview',{
      p_company_id:request.companyId,p_employee_id:request.employeeId,p_as_of:request.asOf
    });
    return error?json({error:'PREVIEW_FAILED'},400,cors):json({ok:true,preview:data},200,cors);
  }

  if(request.action==='approve'){
    const {data,error}=await admin.rpc('server_approve_privacy_request',{
      p_request_id:request.requestId,p_approved_by:userData.user.id,
      p_retention_profile_id:request.retentionProfileId,p_legal_hold_until:request.legalHoldUntil
    });
    return error?json({error:'APPROVAL_FAILED'},400,cors):json({ok:true,request:data},200,cors);
  }

  if(request.action==='stage-sole-owner'){
    const {data,error}=await admin.rpc('server_stage_sole_owner_employee_offboarding',{
      p_idempotency_key:request.idempotencyKey,p_company_id:request.companyId,
      p_employee_id:request.employeeId,p_requested_by:userData.user.id,p_session_id:sessionId,
      p_reason:request.reason,p_as_of:request.asOf
    });
    return error?json({error:'SOLE_OWNER_STAGE_FAILED'},400,cors):json({ok:true,request:data},202,cors);
  }

  if(request.action==='confirm-sole-owner'){
    const {data,error}=await admin.rpc('server_confirm_sole_owner_privacy_request',{
      p_request_id:request.requestId,p_confirmed_by:userData.user.id,p_session_id:sessionId,
      p_retention_profile_id:request.retentionProfileId
    });
    return error?json({error:'SOLE_OWNER_CONFIRMATION_FAILED'},400,cors):json({ok:true,request:data},200,cors);
  }

  if(request.action==='stage-retention-profile'){
    const {data,error}=await admin.rpc('server_stage_sole_owner_retention_profile',{
      p_company_id:request.companyId,p_version:request.version,p_rules:request.rules,
      p_created_by:userData.user.id,p_session_id:sessionId,p_approval_reference:request.approvalReference
    });
    return error?json({error:'RETENTION_PROFILE_STAGE_FAILED'},400,cors):json({ok:true,profile:data},202,cors);
  }

  if(request.action==='replace-retention-profile'){
    const {data,error}=await admin.rpc('server_replace_sole_owner_retention_profile_draft',{
      p_profile_id:request.retentionProfileId,p_company_id:request.companyId,
      p_version:request.version,p_rules:request.rules,p_created_by:userData.user.id,
      p_session_id:sessionId,p_approval_reference:request.approvalReference
    });
    return error?json({error:'RETENTION_PROFILE_REPLACEMENT_FAILED'},400,cors):json({ok:true,profile:data},202,cors);
  }

  if(request.action==='confirm-retention-profile'){
    const {data,error}=await admin.rpc('server_confirm_sole_owner_retention_profile',{
      p_profile_id:request.retentionProfileId,p_confirmed_by:userData.user.id,p_session_id:sessionId
    });
    return error?json({error:'RETENTION_PROFILE_CONFIRMATION_FAILED'},400,cors):json({ok:true,profile:data},200,cors);
  }

  const {data,error}=await admin.rpc('server_stage_employee_offboarding',{
    p_idempotency_key:request.idempotencyKey,p_company_id:request.companyId,
    p_employee_id:request.employeeId,p_requested_by:userData.user.id,
    p_reason:request.reason,p_as_of:request.asOf
  });
  return error?json({error:'STAGE_FAILED'},400,cors):json({ok:true,requestId:data,status:'PENDING_APPROVAL'},202,cors);
});
