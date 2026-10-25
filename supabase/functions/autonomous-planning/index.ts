import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.116.0";
import "../../../assets/ot-weekend-holiday-policy.js";
import "../../../assets/solid-planning-core-v1.js";
import "../../../assets/individual-month-planner-v1.js";
import "../../../assets/month-optimizer-core-v1.js";
import "../../../assets/wish-planning-core-v1.js";
import "../../../assets/solid-planning-resume-v1.js";
import "../../../assets/block-exchange-core-v1.js";
import "../../../assets/background-auto-plan-core-v1.js";
import "../../../assets/auto-plan-repair-core-v1.js";
import "../../../assets/planning-continuity-core-v1.js";
import "../../../assets/autonomous-planning-core-v1.js";
const A=(globalThis as any).SFAutonomousPlanningCore;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
Deno.serve(async req=>{
 if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
 const token=req.headers.get("x-autonomy-token")||"";if(!uuid.test(token))return json({error:"UNAUTHENTICATED"},401);
 let id:string;try{id=(await req.json()).run_id;}catch{return json({error:"INVALID_REQUEST"},400);}if(!uuid.test(id))return json({error:"INVALID_REQUEST"},400);
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 const started=performance.now();
 const claim=await db.rpc("claim_autonomous_planning",{p_run_id:id,p_token:token});if(claim.error)return json({error:"UNAUTHENTICATED"},401);const job=claim.data;if(!job)return json({status:"NOT_CLAIMED"});
 const claimMs=Math.round(performance.now()-started),workStarted=performance.now();
 let part=null,payload=null,summary=null,error=null;
 try{
  if(job.phase==="ASSESSING")summary=A.assess(job.payload,job.result);
  else{const snap=job.snapshot,index=job.parts.length,month=snap.months[index];if(!month)throw Error("Die Vorbereitung ist bereits vollständig.");const offset=snap.preparation?.offset||0,selected=snap.employees.slice(offset,offset+3).map((e:any)=>e.id),prepared=A.build({...snap,scopedBlockRecovery:true,months:[month],demand:snap.demand.filter((d:any)=>d.date.startsWith(month)),candidates:snap.candidates.filter((a:any)=>a.date.startsWith(month)),rhythms:snap.rhythms.filter((a:any)=>a.date.startsWith(month))},selected);part=snap.preparation?.part?A.mergeEmployeeParts([snap.preparation.part,prepared]):prepared;
   if(offset+3<snap.employees.length)part={preparation:true,month,offset:offset+3,part};else if(index+1===snap.months.length)payload=A.withContinuity(A.combine([...job.parts,part],snap),snap);}
 }catch(e){error=String((e as Error)?.message||"Automatiklauf nicht abgeschlossen").slice(0,700);}
 const workMs=Math.round(performance.now()-workStarted),saveStarted=performance.now();
 const save=await db.rpc("finish_autonomous_planning",{p_run_id:id,p_token:token,p_lease:job.lease,p_revision:job.revision,p_part:part,p_payload:payload,p_summary:summary,p_error:error});if(save.error)return json({error:"STEP_NOT_SAVED"},503);
 console.info(JSON.stringify({event:"auto_plan_phase",run_id:id,revision:job.revision,phase:job.phase,month_index:job.parts?.length??null,timing_ms:{claim:claimMs,work:workMs,save:Math.round(performance.now()-saveStarted),total:Math.round(performance.now()-started)},committed:save.data}));
 return json({committed:save.data,phase:job.phase,failed:!!error});
});
