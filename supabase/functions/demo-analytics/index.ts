import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { bearer, cors, json, verifyToken } from '../_shared/demo-security.js';

const ALLOWED:Record<string,Set<string>>={
  session_started:new Set(['manager']),
  area_opened:new Set(['overview','schedule','auto','disruptions','marketplace','employees','absence','time','reports','settings','employee_dashboard','employee_disruptions','employee_marketplace','employee_shifts','employee_changes','employee_swaps','employee_time','employee_absences','employee_account','employee_wage','employee_profile']),
  tour:new Set(['started','completed','skipped']),perspective_changed:new Set(['manager','employee']),scenario_selected:new Set(['outage','understaffing','vacation','deviation','swap']),scenario_reset:new Set(['prepared_scenario']),demo_reset:new Set(['presentation_state']),session_finished:new Set(['manual','idle','maximum'])
};

function publishableKey(){
  try{return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||Deno.env.get('SUPABASE_ANON_KEY')||''}catch{return Deno.env.get('SUPABASE_ANON_KEY')||''}
}

Deno.serve(async req=>{
  const corsHeaders=cors(req);
  if(!corsHeaders)return json({ok:false,code:'origin_rejected'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
  if(req.method!=='POST')return json({ok:false,code:'method_not_allowed'},405,{...corsHeaders,Allow:'POST'});
  const secret=Deno.env.get('DEMO_SESSION_SECRET')||'';
  if(!await verifyToken(bearer(req),secret,'access'))return json({ok:false,code:'expired'},401,corsHeaders);
  let input:any;
  try{input=await req.json()}catch{return json({ok:false,code:'invalid_request'},400,corsHeaders)}
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['event','value'].includes(key)))return json({ok:false,code:'invalid_request'},400,corsHeaders);
  const event=String(input.event||''),value=String(input.value||'');
  if(!ALLOWED[event]?.has(value))return json({ok:false,code:'event_rejected'},400,corsHeaders);
  const projectUrl=String(Deno.env.get('SUPABASE_URL')||'').replace(/\/$/,'');
  const key=publishableKey(),ingestSecret=Deno.env.get('DEMO_ANALYTICS_INGEST_SECRET')||'';
  if(!projectUrl||!key||!ingestSecret)return json({ok:false,code:'not_configured'},503,corsHeaders);
  try{
    const response=await fetch(`${projectUrl}/rest/v1/rpc/record_demo_usage`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({p_event_name:event,p_event_value:value,p_ingest_secret:ingestSecret})});
    return response.ok?new Response(null,{status:204,headers:corsHeaders}):json({ok:false,code:'storage_unavailable'},503,corsHeaders);
  }catch{return json({ok:false,code:'storage_unavailable'},503,corsHeaders)}
});
