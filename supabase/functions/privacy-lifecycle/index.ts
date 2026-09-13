import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeLifecycleRequest, lifecycleCors, parseLifecycleRequest, readJwtAal } from "../_shared/privacy-lifecycle.js";

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

  if(request.action==='preview'){
    const {data,error}=await admin.rpc('server_employee_offboarding_preview',{
      p_company_id:request.companyId,p_employee_id:request.employeeId,p_as_of:request.asOf
    });
    return error?json({error:'PREVIEW_FAILED'},400,cors):json({ok:true,preview:data},200,cors);
  }

  const {data,error}=await admin.rpc('server_stage_employee_offboarding',{
    p_idempotency_key:request.idempotencyKey,p_company_id:request.companyId,
    p_employee_id:request.employeeId,p_requested_by:userData.user.id,
    p_reason:request.reason,p_as_of:request.asOf
  });
  return error?json({error:'STAGE_FAILED'},400,cors):json({ok:true,requestId:data,status:'PENDING_APPROVAL'},202,cors);
});
