import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const governance=fs.readFileSync(path.join(root,'supabase','migrations','20260916012530_privacy_retention_profile_governance_v10.sql'),'utf8');
const redaction=fs.readFileSync(path.join(root,'supabase','migrations','20260916020719_privacy_longterm_redaction_v11.sql'),'utf8');
const worker=fs.readFileSync(path.join(root,'supabase','functions','privacy-worker','index.ts'),'utf8');
const evidence=fs.readFileSync(path.join(root,'documentation','privacy-retention-longterm-abschluss-2026-09-16.md'),'utf8');

test('retention profile governance validates all long-term categories and stays service-role only',()=>{
  for(const key of ['contactDays','planningYears','absenceYears','timeEvidenceYears','personnelYears','auditYears','monthSnapshotYears','datevAuditYears','deletePersonnelDocuments','deleteAuthAccount']){
    assert.match(governance,new RegExp(key));
  }
  assert.match(governance,/server_privacy_retention_status/i);
  assert.match(governance,/revoke all on function public\.server_privacy_retention_status\(uuid\) from public,anon,authenticated/i);
  assert.match(governance,/grant execute on function public\.server_privacy_retention_status\(uuid\) to service_role/i);
});

test('long-term redaction has dry-run, legal-hold, approved-profile and immutable-audit guards',()=>{
  assert.match(redaction,/server_privacy_longterm_redaction_preview/i);
  assert.match(redaction,/'mode','DRY_RUN'/i);
  assert.match(redaction,/'execution_enabled',false/i);
  assert.match(redaction,/Approved retention profile required/i);
  assert.match(redaction,/RETENTION_PROFILE_CHANGED/i);
  assert.match(redaction,/BLOCKED_LEGAL_HOLD/i);
  assert.match(redaction,/privacy_redaction_runs/i);
  assert.match(redaction,/privacy_redacted/i);
  assert.match(redaction,/Audit redaction may not change immutable event identity/i);
  assert.match(redaction,/datev_audit_cutoff/i);
  assert.match(redaction,/month_snapshot_cutoff/i);
  assert.match(redaction,/revoke all on function public\.server_execute_privacy_longterm_redaction\(uuid,date\) from public, anon, authenticated/i);
  assert.match(redaction,/grant execute on function public\.server_execute_privacy_longterm_redaction\(uuid,date\) to service_role/i);
});

test('privacy worker invokes long-term retention batch after lifecycle processing',()=>{
  assert.match(worker,/server_run_due_privacy_longterm_redactions/);
  assert.match(worker,/Europe\/Berlin/);
  assert.match(worker,/RETENTION_REDACTION_FAILED/);
  assert.match(worker,/x-privacy-worker-token/);
});

test('9.3 evidence records dry-run and unchanged production hashes',()=>{
  assert.match(evidence,/fällige Audit-Redaktionen: 0/);
  assert.match(evidence,/fällige Monats-Snapshot-Redaktionen: 0/);
  assert.match(evidence,/12\.135/);
  assert.match(evidence,/a882926769e5c8102adbbbcb7e9dbc6944aa3e7b63636904d93415328fd2d1fe/);
  assert.match(evidence,/f34928133241c355c6213d69368ee41550fd3200d3e02d1656747f2278111d9c/);
  assert.match(evidence,/Technische Umsetzung 9\.3: 🟢 abgeschlossen/);
});
