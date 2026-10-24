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
import {loadBlockSolver} from "../_shared/block-solver-runtime.ts";

const core = (globalThis as any).SFBackgroundAutoPlanCore;
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
    const scopedBlockRecovery = job.payload.metadata.company === "ee0e5c9d-d5ae-48e6-abff-37c179a01929";
    const prepared = core.withShiftDurationLimit(core.withServerWishes(job.payload, job.server_wishes), Number(policy.data.standard_max_shift_hours));
    const input = { ...prepared, enhancedBlockSearch:true, minimumInput: { ...prepared.minimumInput, scopedBlockRecovery }, monthInputs: prepared.monthInputs.map((month: any) => ({ ...month, scopedBlockRecovery })) };
    checkpoint = checkpoint || core.start(input);
    const run = core.context(input, checkpoint), slice = performance.now();
    // Leave headroom for preparation, JSON, database calls and cold starts. Each
    // saved call can be retried after a lease expires without losing prior work.
    if(checkpoint.stage==='exchange'){
      // One solver slice per durable invocation. Its bounded synchronous CPU
      // time leaves headroom for cold starts, model checks and serialization.
      try{if(checkpoint.exchange.status==='searching')run.exchangeStep(await loadBlockSolver());else run.exchangeStep(null);}catch(error){run.stopExchange((error as Error)?.message||'Zusätzliche Suche nicht verfügbar; bester Vorschlag bleibt erhalten.');}
      steps++;
    }else do {
      const recovering = checkpoint.solver?.phase === "block-recovery";
      steps++; if (!run.step()) break;
      // One bounded exchange per invocation keeps CPU use below the Edge limit.
      if (recovering || checkpoint.solver?.phase === "block-recovery" || checkpoint.stage==='exchange') break;
    } while (checkpoint.stage !== "done" && performance.now() - slice < 700 && steps < 1000);
    progress = run.progress();
    if (checkpoint.stage === "done") output = run.result();
  } catch (error) {
    failure = String((error as Error)?.message || "Die Planung konnte nicht abgeschlossen werden.").slice(0, 1000);
    progress = { label: "Planung nicht abgeschlossen", detail: "Bitte den Auftrag prüfen und bei Bedarf neu starten." };
  }
  const saved = await admin.rpc("save_background_auto_plan_step", { p_job_id: id, p_lease: job.lease, p_revision: job.revision, p_checkpoint: checkpoint, p_progress: progress, p_result: output, p_error: failure });
  if (saved.error) return json({ error: "CHECKPOINT_NOT_SAVED" }, 503);
  console.info(JSON.stringify({ job_id: id, revision: job.revision, steps, stage: checkpoint?.stage, elapsed_ms: Math.round(performance.now() - started), region: Deno.env.get("SB_REGION"), committed: saved.data }));
  return json({ committed: saved.data, finished: !!output, failed: !!failure });
});
