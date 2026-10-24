import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
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
import {loadBlockSolver} from "../_shared/block-solver-runtime.ts";

const core = (globalThis as any).SFBackgroundAutoPlanCore;
const A=(globalThis as any).SFAutonomousPlanningCore;
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
  const claimed = await admin.rpc("claim_background_auto_plan", { p_job_id: id, p_worker_token: token });
  if (claimed.error) return json({ error: "UNAUTHENTICATED" }, 401);
  const job = claimed.data;
  if (!job) return json({ status: "NOT_CLAIMED" });
  const started = performance.now();
  let checkpoint = job.checkpoint, output = null, failure = null, progress = null, steps = 0;
  try {
    const policy = await admin.from("company_compliance_policy").select("standard_max_shift_hours").eq("company_id", job.payload.metadata.company).single();
    if (policy.error || !policy.data) throw new Error("Die Schichtdauer des Unternehmens konnte nicht geladen werden.");
    // Shared search capability; eligibility and hard rules come from this job's company.
    const scopedBlockRecovery = true;
    const prepared = core.withShiftDurationLimit(core.withServerWishes(job.payload, job.server_wishes), Number(policy.data.standard_max_shift_hours));
    const repairLevel=checkpoint?.repairLevel||0;
    const scoped=A.repairPayload(prepared,repairLevel);
    const input = { ...scoped, enhancedBlockSearch:true, minimumInput: { ...scoped.minimumInput, scopedBlockRecovery }, monthInputs: scoped.monthInputs.map((month: any) => ({ ...month, scopedBlockRecovery })) };
    checkpoint = checkpoint || core.start(input);
    const reuse=prepared.metadata.continuity?.reusable&&!checkpoint.repairBest&&!checkpoint.skipReuse;
    const run = reuse?null:core.context(input, checkpoint), slice = performance.now();
    let audited:any=null;
    // Leave headroom for preparation, JSON, database calls and cold starts. Each
    // saved call can be retried after a lease expires without losing prior work.
    if(reuse){
      const previous=prepared.metadata.continuity.reusable;
      output={version:1,preview:previous.preview,quality:previous.quality,months:prepared.months,metadata:prepared.metadata,repairScope:{level:0,locked:previous.preview.length,reused:true}};
      // Repeat the independent audit after attaching server-confirmed wishes.
      audited=A.assess(prepared,output);
      if(audited.canApply){checkpoint.stage='done';checkpoint.proposed=output.preview;checkpoint.quality=output.quality;checkpoint.monthIndex=prepared.months.length;}
      else{output=null;checkpoint.skipReuse=true;}
    }else if(checkpoint.stage==='exchange'){
      // One solver slice per durable invocation. Its bounded synchronous CPU
      // time leaves headroom for cold starts, model checks and serialization.
      try{if(checkpoint.exchange.status==='searching')run!.exchangeStep(await loadBlockSolver());else run!.exchangeStep(null);}catch(error){run!.stopExchange((error as Error)?.message||'Zusätzliche Suche nicht verfügbar; bester Vorschlag bleibt erhalten.');}
      steps++;
    }else do {
      const recovering = checkpoint.solver?.phase === "block-recovery";
      steps++; if (!run!.step()) break;
      // One bounded exchange per invocation keeps CPU use below the Edge limit.
      if (recovering || checkpoint.solver?.phase === "block-recovery" || checkpoint.stage==='exchange') break;
    } while (checkpoint.stage !== "done" && performance.now() - slice < 700 && steps < 1000);
    progress = core.progress(input,checkpoint);
    if (checkpoint.stage === "done") {
      output=output||run!.result();output.repairScope=output.repairScope||input.metadata.repairScope||null;
      if(prepared.metadata.continuity){
      const candidate={result:output,audit:audited||A.assess(prepared,output)},incumbent:any=prepared.metadata.continuity?.improve&&prepared.metadata.continuity.incumbent?{result:{version:1,preview:prepared.metadata.continuity.incumbent.preview,quality:prepared.metadata.continuity.incumbent.quality,months:prepared.months,metadata:prepared.metadata,repairScope:{level:0,locked:prepared.metadata.continuity.incumbent.preview.length,reused:true}},audit:null}:null;
      if(incumbent){incumbent.audit=A.assess(prepared,incumbent.result);if(!incumbent.audit.canApply)incumbent.audit=null;}
      const old=checkpoint.repairBest||incumbent?.audit&&incumbent;
      const best=old&&A.compare(old.audit,candidate.audit,prepared.metadata.continuity?.improve)<=0?old:candidate;
      if(!candidate.audit.canApply&&prepared.metadata.continuity?.affectedDates?.length&&repairLevel<2){
        checkpoint={...core.start(A.repairPayload(prepared,repairLevel+1)),repairLevel:repairLevel+1,repairBest:best,skipReuse:checkpoint.skipReuse};output=null;
        progress={percent:1,label:'Reparaturbereich erweitern',detail:'Der kleinere Reparaturversuch bleibt gespeichert. Weitere benachbarte Blöcke werden geprüft.'};
      }else output=best.result;
      }
    }
  } catch (error) {
    failure = String((error as Error)?.message || "Die Planung konnte nicht abgeschlossen werden.").slice(0, 1000);
    progress = { label: "Planung nicht abgeschlossen", detail: "Bitte den Auftrag prüfen und bei Bedarf neu starten." };
  }
  const saved = await admin.rpc("save_background_auto_plan_step", { p_job_id: id, p_lease: job.lease, p_revision: job.revision, p_checkpoint: checkpoint, p_progress: progress, p_result: output, p_error: failure });
  if (saved.error) return json({ error: "CHECKPOINT_NOT_SAVED" }, 503);
  console.info(JSON.stringify({ job_id: id, revision: job.revision, steps, stage: checkpoint?.stage, elapsed_ms: Math.round(performance.now() - started), region: Deno.env.get("SB_REGION"), committed: saved.data }));
  return json({ committed: saved.data, finished: !!output, failed: !!failure });
});
