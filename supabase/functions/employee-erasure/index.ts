import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { lifecycleCors, readJwtAal, readJwtSessionId } from "../_shared/privacy-lifecycle.js";
import { parseErasureRequest, runEmployeeErasure } from "../_shared/employee-erasure.mjs";

const json=(body:unknown,status:number,headers:HeadersInit={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
Deno.serve(async req=>{
 const cors=lifecycleCors(req);
 if(!cors)return json({error:'Zugriff von dieser Seite ist nicht erlaubt.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json({error:'Ungültige Anfrage.'},405,cors);
 const authorization=req.headers.get('authorization')||'';
 const token=authorization.replace(/^Bearer\s+/i,'');
 if(!token)return json({error:'Bitte erneut anmelden.'},401,cors);
 let request;
 try{request=parseErasureRequest(await req.json());}catch{return json({error:'Bitte die Löschbestätigung prüfen.'},400,cors);}
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
 if(!url||!key||!anon)return json({error:'Die Löschfunktion ist noch nicht bereit.'},503,cors);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const user=await userClient.auth.getUser(token);
 if(user.error||!user.data.user)return json({error:'Bitte erneut anmelden.'},401,cors);
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const session=await admin.rpc('server_validate_employee_erasure_session',{p_actor:user.data.user.id,p_session:readJwtSessionId(token),p_aal:readJwtAal(token)});
  if(session.error)throw Error(session.error.message||'Bitte erneut anmelden.');
  const result=await runEmployeeErasure(admin,request,user.data.user.id);
  return json(result,200,cors);
 }catch(error){
  const message=String((error as Error).message||'Die Löschung wurde nicht abgeschlossen. Bitte erneut versuchen.');
  return json({error:message,complete:false},409,cors);
 }
});
