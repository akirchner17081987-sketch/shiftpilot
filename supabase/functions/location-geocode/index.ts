import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {locateStoredSite} from './core.mjs';
const origins=new Set(['https://schichtfunk.de','https://www.schichtfunk.de','https://home-5021411544.app-ionos.space']);
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'',headers:Record<string,string>={'Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 if(origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(origin&&!origins.has(origin))return reply({error:'ORIGIN_NOT_ALLOWED'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 const authorization=req.headers.get('authorization')||'';
 if(!/^Bearer \S+$/i.test(authorization))return reply({error:'UNAUTHENTICATED'},401);
 if(Number(req.headers.get('content-length')||0)>2048)return reply({error:'INVALID_REQUEST'},400);
 try{
  const text=await req.text();if(text.length>2048)return reply({error:'INVALID_REQUEST'},400);
  const body=JSON.parse(text),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!uuid.test(body.company_id||'')||!uuid.test(body.site_id||''))return reply({error:'INVALID_REQUEST'},400);
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await caller.auth.getUser(authorization.replace(/^Bearer /i,''));
  if(error||!data.user)return reply({error:'UNAUTHENTICATED'},401);
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await locateStoredSite({caller,admin,companyId:body.company_id,siteId:body.site_id,
   // Explicitly approved on 2026-10-21; can be disabled/switched server-side without a client update.
   enabled:Deno.env.get('LOCATION_GEOCODING_ENABLED')!=='false',baseURL:Deno.env.get('LOCATION_GEOCODING_URL')||'https://nominatim.openstreetmap.org/search'});
  return reply(result.body,result.status);
 }catch{return reply({error:'GEOCODING_FAILED'},500);}
});
