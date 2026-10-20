import {createClient} from "npm:@supabase/supabase-js@2.116.0";
import {transferArchive,authorizedPart} from "./core.mjs";
const origins=new Set(['https://schichtfunk.de','https://www.schichtfunk.de','https://home-5021411544.app-ionos.space']);
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers:Record<string,string>={'Cache-Control':'no-store','Vary':'Origin'};
 if(origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
 headers['Access-Control-Allow-Headers']='authorization,apikey,content-type,x-client-info';
 headers['Access-Control-Allow-Methods']='POST,OPTIONS';
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 if(origin&&!origins.has(origin))return reply({error:'ORIGIN_NOT_ALLOWED'},403);
 const url=Deno.env.get('SUPABASE_URL')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const workerToken=req.headers.get('x-audit-archive-token');
 try{
  const body=await req.json(),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!uuid.test(body.archive_id||''))return reply({error:'INVALID_ARCHIVE'},400);
  if(workerToken){
   if(!uuid.test(workerToken))return reply({error:'UNAUTHENTICATED'},401);
   return reply(await transferArchive(admin,body.archive_id,workerToken));
  }
  const authorization=req.headers.get('authorization')||'';
  if(!/^Bearer \S+$/i.test(authorization)||!uuid.test(body.company_id||''))return reply({error:'UNAUTHENTICATED'},401);
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  return reply(await authorizedPart(caller,admin,body));
 }catch(error){
  const code=(error as {code?:string})?.code;
  return reply({error:code==='42501'?'UNAUTHENTICATED':'ARCHIVE_OPERATION_FAILED',message:workerToken?'Sicherungsauftrag konnte nicht abgeschlossen werden.':String((error as {message?:string})?.message||'Archiv nicht verfügbar').slice(0,500)},code==='42501'?401:500);
 }
});
