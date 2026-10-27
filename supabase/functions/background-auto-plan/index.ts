import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import "../../../assets/ot-weekend-holiday-policy.js";
import "../../../assets/solid-planning-core-v1.js";
import "../../../assets/individual-month-planner-v1.js";
import "../../../assets/month-optimizer-core-v1.js";
import "../../../assets/wish-planning-core-v1.js";
import "../../../assets/solid-planning-resume-v1.js";
import "../../../assets/block-exchange-core-v1.js";
import "../../../assets/team-leader-balance-core-v1.js";
import "../../../assets/background-auto-plan-core-v1.js";
import "../../../assets/auto-plan-repair-core-v1.js";
import "../../../assets/planning-continuity-core-v1.js";
import "../../../assets/autonomous-planning-core-v1.js";
import {loadBlockSolver} from "../_shared/block-solver-runtime.ts";

const core = (globalThis as any).SFBackgroundAutoPlanCore;
const A=(globalThis as any).SFAutonomousPlanningCore;
const TL=(globalThis as any).SFTeamLeaderBalanceCore;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  // This is a server dispatcher, not a public user endpoint. The random per-job
  // capability is checked in Postgres before any planning input is returned.
  const token = req.headers.get("x-background-job-token") || "";
  if (!uuid.test(token)) return json({ error: "UNAUTHENTICATED" }, 401);
  let id: string;
  try { id = (await req.json()).job_id; } catch { return json({ error: "INVALID_REQUEST" }, 400); }
  if (!uuid.test(id)) return json({ error: "INVALID_REQUEST" }, 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const requestStarted = performance.now();
  const claimed = await admin.rpc("claim_background_auto_plan", { p_job_id: id, p_worker_token: token });
  const claimMs = Math.round(performance.now() - requestStarted);
  if (claimed.error) return json({ error: "UNAUTHENTICATED" }, 401);
  const job = claimed.data;
  if (!job) return json({ status: "NOT_CLAIMED" });
  const started = performance.now();
  const stageBefore=job.checkpoint?.stage||"new";
  const intervalMs=(value: string | null | undefined)=>{const stamp=Date.parse(value||"");return Number.isFinite(stamp)?Math.max(0,Date.now()-stamp):null;};
  const betweenStepsMs=intervalMs(job.previous_update_at),dispatchMs=intervalMs(job.dispatched_at);
  let preparationMs=0,computeMs=0,computeStarted=0;
  let checkpoint = job.checkpoint, output = null, failure = null, progress = null, steps = 0;
  try {
    const preparationStarted=performance.now();
    const policy = await admin.from("company_compliance_policy").select("standard_max_shift_hours").eq("company_id", job.payload.metadata.company).single();
    if (policy.error || !policy.data) throw new Error("Die Schichtdauer des Unternehmens konnte nicht geladen werden.");
    // Shared search capability; eligibility and hard rules come from this job's company.
    // New jobs reserve a separate durable repair budget after initial allocation.
    // Every accepted repair still passes the same company-specific hard rules.
    const startedAt=Date.parse(job.started_at||"");
    const boundedSearch = checkpoint ? checkpoint.boundedSearch === true || Number.isFinite(startedAt)&&Date.now()-startedAt>120000 : true;
    const scopedBlockRecovery = !boundedSearch;
    const prepared = core.withShiftDurationLimit(core.withServerWishes(job.payload, job.server_wishes), Number(policy.data.standard_max_shift_hours));
    const repairLevel=checkpoint?.repairLevel||0;
    const scoped=A.repairPayload(prepared,repairLevel);
    const input = { ...scoped, boundedSearch, adaptiveSearch:true, enhancedBlockSearch:true, minimumInput: { ...scoped.minimumInput, scopedBlockRecovery, boundedSearch, criticalBeamWidth:boundedSearch?16:undefined }, monthInputs: scoped.monthInputs.map((month: any) => ({ ...month, scopedBlockRecovery, boundedSearch, criticalBeamWidth:boundedSearch?16:undefined })) };
    checkpoint = checkpoint || core.start(input);
    if(boundedSearch)checkpoint.boundedSearch=true;
    const budget=core.searchBudget(input,checkpoint);
    const reuse=prepared.metadata.continuity?.reusable&&!checkpoint.repairBest&&!checkpoint.skipReuse;
    const run = reuse?null:core.context(input, checkpoint), slice = performance.now();
    preparationMs=Math.round(slice-preparationStarted);computeStarted=slice;
    let audited:any=null;
    // Leave headroom for preparation, JSON, database calls and cold starts. Each
    // saved call can be retried after a lease expires without losing prior work.
    if(reuse){
      const previous=prepared.metadata.continuity.reusable;
      output={version:1,preview:previous.preview,quality:previous.quality,months:prepared.months,metadata:prepared.metadata,repairScope:{level:0,locked:previous.preview.length,reused:true}};
      // Repeat the independent audit after attaching server-confirmed wishes.
      audited=A.assess(prepared,output);
      if(audited.canPreserve){checkpoint.stage='done';checkpoint.proposed=output.preview;checkpoint.quality=output.quality;checkpoint.monthIndex=prepared.months.length;}
      else{output=null;checkpoint.skipReuse=true;}
    }else if(checkpoint.stage==='exchange'){
      // One solver slice per durable invocation. Its bounded synchronous CPU
      // time leaves headroom for cold starts, model checks and serialization.
      try{
        if(boundedSearch&&Date.now()>=budget.deadlineAt-2000)run!.limitExchange();
        else if(checkpoint.exchange.status==='searching'){
          const highs=await loadBlockSolver();
          if(boundedSearch&&Date.now()>=budget.deadlineAt-2000)run!.limitExchange();
          else {
            const exchangeSlice=performance.now();
            run!.exchangeStep(highs);
            // Reuse the compiled neighbourhood for a second bounded pass when
            // there is CPU headroom; save both improvements in this invocation.
            if(checkpoint.stage==='exchange'&&checkpoint.exchange.status==='searching'&&performance.now()-exchangeSlice<850){run!.exchangeStep(highs);steps++;}
          }
        }
        else run!.exchangeStep(null);
      }catch(error){run!.stopExchange((error as Error)?.message||'Zusätzliche Suche nicht verfügbar; bester Vorschlag bleibt erhalten.');}
      steps++;
    }else if(boundedSearch&&(checkpoint.stage==='month'||checkpoint.stage==='minimum')&&budget.expired){
      checkpoint.timeLimited=true;
      run!.finishEarly();steps++;
    }else if(boundedSearch&&(checkpoint.stage==='month'||checkpoint.stage==='minimum')&&budget.allocationExpired&&!['refine','block-recovery'].includes(checkpoint.solver?.phase)){
      if(checkpoint.stage==='month')run!.improvePartial();else run!.finishEarly();
      steps++;
    }else {
      if(checkpoint.solver?.phase==='fill')console.info(JSON.stringify({event:'auto_plan_fill_enter',job_id:id,revision:job.revision,cursor:checkpoint.solver.cursor,records:checkpoint.solver.records?.length||0}));
      do {
      const recovering = checkpoint.solver?.phase === "block-recovery";
      steps++; if (!run!.step()) break;
      // One bounded exchange per invocation keeps CPU use below the Edge limit.
      if (recovering || checkpoint.solver?.phase === "block-recovery" || checkpoint.stage==='exchange') break;
      } while (checkpoint.stage !== "done" && performance.now() - slice < (checkpoint.solver?.phase==='fill'?600:700) && steps < (checkpoint.solver?.phase==='fill'?512:1000));
    }
    progress = core.progress(input,checkpoint);
    if (checkpoint.stage === "done") {
      output=output||run!.result();output.repairScope=output.repairScope||input.metadata.repairScope||null;
      if(prepared.metadata.continuity){
      const candidate={result:output,audit:audited||A.assess(prepared,output)},incumbent:any=prepared.metadata.continuity?.improve&&prepared.metadata.continuity.incumbent?{result:{version:1,preview:prepared.metadata.continuity.incumbent.preview,quality:prepared.metadata.continuity.incumbent.quality,months:prepared.months,metadata:prepared.metadata,repairScope:{level:0,locked:prepared.metadata.continuity.incumbent.preview.length,reused:true}},audit:null}:null;
      if(incumbent){incumbent.audit=A.assess(prepared,incumbent.result);if(!incumbent.audit.canPreserve)incumbent.audit=null;}
      const old=checkpoint.repairBest||incumbent?.audit&&incumbent;
      const best=old&&A.compare(old.audit,candidate.audit,prepared.metadata.continuity?.improve)<=0?old:candidate;
      if(!boundedSearch&&!candidate.audit.canPreserve&&prepared.metadata.continuity?.affectedDates?.length&&repairLevel<2){
        checkpoint={...core.start(A.repairPayload(prepared,repairLevel+1)),repairLevel:repairLevel+1,repairBest:best,skipReuse:checkpoint.skipReuse};output=null;
        progress={percent:1,label:'Reparaturbereich erweitern',detail:'Der kleinere Reparaturversuch bleibt gespeichert. Weitere benachbarte Blöcke werden geprüft.'};
      }else output=best.result;
      }
    }
    if(output&&!output.repairScope?.reused&&input.monthInputs.some((month:any)=>month.solidRules?.teamLeaderShiftBalance?.enabled)&&(!boundedSearch||Date.now()<budget.deadlineAt+3000)){
      try{
        const highs=await loadBlockSolver();
        const candidate={...output,preview:output.preview.slice(),quality:output.quality.map((q:any)=>({...q}))};
        let changed=0;
        for(let i=0;i<input.months.length;i++){
          const month=input.months[i],source=core.unpack(input.monthInputs[i]);
          if(!source.solidRules.teamLeaderShiftBalance?.enabled)continue;
          const own=candidate.preview.filter((a:any)=>a.date.startsWith(month));
          const balanced=TL.balance(source,own,highs,boundedSearch?1:2);
          if(!balanced.changed)continue;
          candidate.preview=candidate.preview.filter((a:any)=>!a.date.startsWith(month)).concat(balanced.preview);
          candidate.quality[i]={...candidate.quality[i],teamLeaderBalance:{status:balanced.status,changed:balanced.changed,counts:balanced.counts}};
          changed+=balanced.changed;
        }
        if(changed){
          const before=A.assess(prepared,output),after=A.assess(prepared,candidate);
          if(after.open<=before.open&&after.critical<=before.critical&&after.errors<=before.errors&&after.spread<=before.spread+.001){output=candidate;checkpoint.proposed=output.preview;checkpoint.quality=output.quality;}
        }
      }catch(error){console.info(JSON.stringify({event:'auto_plan_tl_balance_unavailable',job_id:id,reason:String((error as Error)?.message||error).slice(0,160)}));}
    }
    if(output){
      const assessment=A.assess(prepared,output);
      if(!assessment.canApply){
        const pending=(assessment.hours?.rows||[]).filter((row:any)=>row.missing>(row.tolerance??0)+.001&&!row.approvedDeviation).length;
        progress={percent:100,label:assessment.open||assessment.critical?'Entwurf mit offenen Pflichtdiensten':'Entwurf mit prüfpflichtigen Zielabweichungen',detail:assessment.open||assessment.critical?`${assessment.open} Pflichtpositionen offen · ${pending} SOLL-Abweichungen prüfen`:`Alle Pflichtpositionen besetzt · ${pending} SOLL-Abweichungen und die Verteilung prüfen`};
      }
      if(checkpoint.timeLimited)progress={...progress,label:'Zeitbudget erreicht · Entwurf prüfen',detail:'Zeitbudget erreicht · '+progress.detail};
    }
    computeMs=Math.round(performance.now()-computeStarted);
  } catch (error) {
    if(computeStarted)computeMs=Math.round(performance.now()-computeStarted);else preparationMs=Math.round(performance.now()-started);
    failure = String((error as Error)?.message || "Die Planung konnte nicht abgeschlossen werden.").slice(0, 1000);
    progress = { label: "Planung nicht abgeschlossen", detail: "Bitte den Auftrag prüfen und bei Bedarf neu starten." };
  }
  const saveStarted=performance.now();
  const saved = await admin.rpc("save_background_auto_plan_step", { p_job_id: id, p_lease: job.lease, p_revision: job.revision, p_checkpoint: checkpoint, p_progress: progress, p_result: output, p_error: failure });
  if (saved.error) return json({ error: "CHECKPOINT_NOT_SAVED" }, 503);
  console.info(JSON.stringify({ event:"auto_plan_slice",job_id:id,revision:job.revision,steps,stage_before:stageBefore,stage_after:checkpoint?.stage,phase:checkpoint?.solver?.phase||null,percent:progress?.percent??null,timing_ms:{claim:claimMs,preparation:preparationMs,compute:computeMs,save:Math.round(performance.now()-saveStarted),between_steps:betweenStepsMs,dispatch:dispatchMs,total:Math.round(performance.now()-requestStarted)},region:Deno.env.get("SB_REGION"),committed:saved.data }));
  return json({ committed: saved.data, finished: !!output, failed: !!failure });
});
