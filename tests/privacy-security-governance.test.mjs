import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { authorizeLifecycleRequest, parseLifecycleRequest, readJwtSessionId } from '../supabase/functions/_shared/privacy-lifecycle.js';
import {
  buildStorageManifest, compareStorageManifests, resolveManifestPath, verifyStorageDirectory
} from '../scripts/storage-restore-manifest.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const allowlist=JSON.parse(fs.readFileSync(path.join(root,'supabase','security-definer-allowlist.json'),'utf8'));
const verifier=fs.readFileSync(path.join(root,'supabase','tests','security_definer_allowlist.sql'),'utf8');
const lifecycle=fs.readFileSync(path.join(root,'supabase','migrations','20260913083032_privacy_lifecycle_v1.sql'),'utf8');
const approvalSql=fs.readFileSync(path.join(root,'supabase','migrations','20260913084344_privacy_lifecycle_approval_v2.sql'),'utf8');
const offboardingPlanSql=fs.readFileSync(path.join(root,'supabase','migrations','20260913091023_privacy_offboarding_plan_v3.sql'),'utf8');
const mfaGuardSql=fs.readFileSync(path.join(root,'supabase','migrations','20260914053039_mfa_sensitive_action_guard_v1.sql'),'utf8');
const overdueFixSql=fs.readFileSync(path.join(root,'supabase','migrations','20260913095100_privacy_lifecycle_overdue_fix_v4.sql'),'utf8');
const executionSql=fs.readFileSync(path.join(root,'supabase','migrations','20260913101500_privacy_offboarding_execution_v5.sql'),'utf8');
const soleOwnerSql=fs.readFileSync(path.join(root,'supabase','migrations','20260914055344_privacy_sole_owner_delayed_approval_v6.sql'),'utf8');
const privacyWorkerSql=fs.readFileSync(path.join(root,'supabase','migrations','20260914062506_privacy_lifecycle_worker_v7.sql'),'utf8');
const privacyScheduleSql=fs.readFileSync(path.join(root,'supabase','migrations','20260914062509_privacy_lifecycle_schedule_v8.sql'),'utf8');
const privacyRoleCompatSql=fs.readFileSync(path.join(root,'supabase','migrations','20260914063206_privacy_service_role_claim_compat_v9.sql'),'utf8');
const retentionReplacementSql=fs.readFileSync(path.join(root,'supabase','migrations','20260918000550_privacy_retention_profile_draft_replacement_v12.sql'),'utf8');
const lifecycleDbTest=fs.readFileSync(path.join(root,'supabase','tests','privacy_lifecycle_test.sql'),'utf8');
const soleOwnerDbTest=fs.readFileSync(path.join(root,'supabase','tests','privacy_sole_owner_delayed_test.sql'),'utf8');
const logicalRestoreDbTest=fs.readFileSync(path.join(root,'supabase','tests','privacy_logical_restore_test.sql'),'utf8');
const lifecycleEdge=fs.readFileSync(path.join(root,'supabase','functions','privacy-lifecycle','index.ts'),'utf8');
const privacyWorkerEdge=fs.readFileSync(path.join(root,'supabase','functions','privacy-worker','index.ts'),'utf8');
const mfaClient=fs.readFileSync(path.join(root,'assets','supabase-mfa-v1.js'),'utf8');
const moduleLoader=fs.readFileSync(path.join(root,'assets','conflict-plausibility-v1.js'),'utf8');
const settingsClient=fs.readFileSync(path.join(root,'assets','settings-management-v2.js'),'utf8');
const storageManifestSource=fs.readFileSync(path.join(root,'scripts','storage-restore-manifest.mjs'),'utf8');
const storageBranchSmokeSource=fs.readFileSync(path.join(root,'scripts','storage-branch-restore-smoke.mjs'),'utf8');
const authErrorsSource=fs.readFileSync(path.join(root,'assets','supabase-auth-errors-v1.js'),'utf8');
const soleOwnerDeletionPolicy=fs.readFileSync(path.join(root,'documentation','ein-owner-loeschfreigabe-2026-09-14.md'),'utf8');
const soleOwnerBranchProtocol=fs.readFileSync(path.join(root,'documentation','privacy-sole-owner-testbranch-protocol-2026-09-14.md'),'utf8');
const privacyProductionProtocol=fs.readFileSync(path.join(root,'documentation','privacy-lifecycle-production-activation-2026-09-14.md'),'utf8');

test('SECURITY DEFINER allowlist is exact and reviewable',()=>{
  assert.equal(allowlist.functions.length,35);
  assert.equal(new Set(allowlist.functions.map(x=>`${x.name}(${x.arguments})`)).size,35);
  for(const fn of allowlist.functions){
    assert.ok(fn.boundary.length>=8,`${fn.name} needs an authorization boundary`);
    assert.match(verifier,new RegExp(`'${fn.name}'`));
  }
  assert.match(verifier,/ANON_EXECUTE/);
  assert.match(verifier,/USER_METADATA_AUTHORIZATION/);
  assert.match(verifier,/DYNAMIC_SQL/);
});

test('privacy lifecycle remains private, idempotent and non-destructive in v1',()=>{
  assert.match(lifecycle,/idempotency_key uuid not null unique/i);
  assert.match(lifecycle,/on conflict \(idempotency_key\) do nothing/i);
  assert.match(lifecycle,/Idempotency key belongs to another request/i);
  assert.match(lifecycle,/PENDING_APPROVAL/);
  assert.match(lifecycle,/legal_hold_until/);
  assert.match(lifecycle,/execution_enabled', false/);
  assert.match(lifecycle,/revoke all on table private\.privacy_lifecycle_requests from public, anon, authenticated/i);
  assert.match(lifecycle,/alter table private\.privacy_lifecycle_requests enable row level security/i);
  assert.match(lifecycle,/request\.jwt\.claim\.role/i);
  assert.match(lifecycle,/Service role required/i);
  assert.doesNotMatch(lifecycle,/\bdelete\s+from\s+public\./i);
  assert.doesNotMatch(lifecycle,/\bupdate\s+public\./i);
  assert.doesNotMatch(lifecycle,/cron\.schedule/i);
});

test('privacy approval enforces two-person control, legal holds and safe queue claims',()=>{
  assert.match(approvalSql,/requested_by = p_approved_by/i);
  assert.match(approvalSql,/Approved retention profile required/i);
  assert.match(approvalSql,/privacy_legal_holds/i);
  assert.match(approvalSql,/enable row level security/i);
  assert.match(approvalSql,/for update skip locked/i);
  assert.match(approvalSql,/status = 'APPROVED'/i);
  assert.match(approvalSql,/Worker does not own executing request/i);
  assert.match(approvalSql,/sf_assert_service_role/i);
  assert.doesNotMatch(approvalSql,/\bdelete\s+from\s+public\./i);
  assert.doesNotMatch(approvalSql,/\bupdate\s+public\./i);
  assert.doesNotMatch(approvalSql,/cron\.schedule/i);
});

test('sole-owner deletion policy requires delayed independent-session confirmation and hard blocks',()=>{
  assert.match(soleOwnerDeletionPolicy,/SOLE_OWNER_DELAYED/);
  assert.match(soleOwnerDeletionPolicy,/keine Vier-Augen-Kontrolle/i);
  assert.match(soleOwnerDeletionPolicy,/24 Stunden/);
  assert.match(soleOwnerDeletionPolicy,/7 Tage/);
  assert.match(soleOwnerDeletionPolicy,/aal2/);
  assert.match(soleOwnerDeletionPolicy,/session_id/);
  assert.match(soleOwnerDeletionPolicy,/SHA-256/);
  assert.match(soleOwnerDeletionPolicy,/einzige aktive OWNER-Konto darf niemals/i);
  assert.match(soleOwnerDeletionPolicy,/Mandantenlöschung ist im Ein-OWNER-Modus nicht zulässig/i);
  assert.match(soleOwnerDeletionPolicy,/technische V6-Erweiterung/i);
  assert.match(soleOwnerDeletionPolicy,/produktiv aktiviert/i);
  assert.match(soleOwnerDeletionPolicy,/15-Minuten-Zeitplan/i);
});

test('sole-owner v6 is private, delayed, session-separated and non-destructive',()=>{
  assert.match(soleOwnerSql,/approval_mode in \('TWO_PERSON','SOLE_OWNER_DELAYED'\)/i);
  assert.match(soleOwnerSql,/interval '24 hours'/i);
  assert.match(soleOwnerSql,/interval '7 days'/i);
  assert.match(soleOwnerSql,/confirmed_session_fingerprint <> first_session_fingerprint/i);
  assert.match(soleOwnerSql,/extensions\.digest\(p_session_id::text, 'sha256'\)/i);
  assert.match(soleOwnerSql,/SOLE_OWNER_TARGET_BLOCKED/i);
  assert.match(soleOwnerSql,/SOLE_OWNER_MODE_NOT_AVAILABLE/i);
  assert.match(soleOwnerSql,/NEW_AUTH_SESSION_REQUIRED/i);
  assert.match(soleOwnerSql,/OFFBOARDING_PREVIEW_CHANGED/i);
  assert.match(soleOwnerSql,/RETENTION_PROFILE_CHANGED/i);
  assert.match(soleOwnerSql,/greatest\([\s\S]*r\.access_revoke_after[\s\S]*r\.requested_at/i);
  assert.match(soleOwnerSql,/for update/i);
  assert.match(soleOwnerSql,/privacy_lifecycle_sole_owner_pending_idx/i);
  assert.match(soleOwnerSql,/where approval_mode = 'SOLE_OWNER_DELAYED' and status = 'PENDING_APPROVAL'/i);
  assert.doesNotMatch(soleOwnerSql,/cron\.schedule/i);
  assert.doesNotMatch(soleOwnerSql,/\bdelete\s+from\s+(public|auth|storage)\./i);
  assert.doesNotMatch(soleOwnerSql,/\bupdate\s+public\./i);
});

test('sole-owner Edge API requires owner AAL2 and a signed session claim',()=>{
  const company='33333333-3333-4333-8333-333333333333';
  const owner='11111111-1111-4111-8111-111111111111';
  const employee='44444444-4444-4444-8444-444444444444';
  const request=parseLifecycleRequest({
    action:'stage-sole-owner',companyId:company,employeeId:employee,
    idempotencyKey:'55555555-5555-4555-8555-555555555555',reason:'Fiktiver Ein-OWNER-Test'
  });
  const membership={company_id:company,user_id:owner,role:'OWNER',status:'ACTIVE'};
  assert.throws(()=>authorizeLifecycleRequest({membership,userId:owner,aal:'aal1',request}),/MFA_REQUIRED/);
  assert.equal(authorizeLifecycleRequest({membership,userId:owner,aal:'aal2',request}),true);
  assert.throws(()=>authorizeLifecycleRequest({membership:{...membership,role:'ADMIN'},userId:owner,aal:'aal2',request}),/SOLE_OWNER_REQUIRED/);

  const payload=Buffer.from(JSON.stringify({
    aal:'aal2',session_id:'88888888-8888-4888-8888-888888888888'
  })).toString('base64url');
  assert.equal(readJwtSessionId(`header.${payload}.signature`),'88888888-8888-4888-8888-888888888888');
  const missing=Buffer.from(JSON.stringify({aal:'aal2'})).toString('base64url');
  assert.throws(()=>readJwtSessionId(`header.${missing}.signature`),/SESSION_REQUIRED/);
});

test('obsolete retention drafts can only be atomically replaced by the sole owner',()=>{
  const company='33333333-3333-4333-8333-333333333333';
  const owner='11111111-1111-4111-8111-111111111111';
  const request=parseLifecycleRequest({
    action:'replace-retention-profile',companyId:company,
    retentionProfileId:'99999999-9999-4999-8999-999999999999',version:2,
    rules:{timeEvidenceYears:6},approvalReference:'Fristprofil V2 Arbeitszeit/DATEV'
  });
  const membership={company_id:company,user_id:owner,role:'OWNER',status:'ACTIVE'};
  assert.throws(()=>authorizeLifecycleRequest({membership,userId:owner,aal:'aal1',request}),/MFA_REQUIRED/);
  assert.equal(authorizeLifecycleRequest({membership,userId:owner,aal:'aal2',request}),true);
  assert.match(retentionReplacementSql,/for update/i);
  assert.match(retentionReplacementSql,/status = 'REVOKED', revoked_at = now\(\)/i);
  assert.match(retentionReplacementSql,/server_stage_sole_owner_retention_profile/i);
  assert.match(retentionReplacementSql,/Replacement version must be newer/i);
  assert.match(retentionReplacementSql,/revoke all on function public\.server_replace_sole_owner_retention_profile_draft[\s\S]*from public, anon, authenticated/i);
  assert.match(retentionReplacementSql,/grant execute on function public\.server_replace_sole_owner_retention_profile_draft[\s\S]*to service_role/i);
});

test('expanded offboarding preview inventories all linked domains without mutating them',()=>{
  for(const table of [
    'employee_access_invites','shift_assignment_confirmations','time_entries','time_account_openings',
    'shift_change_requests','shift_change_approvals','shift_swap_requests','disruption_incidents',
    'disruption_offers','employee_personnel_details','employee_personnel_documents',
    'notifications','push_subscriptions','audit_events','time_month_closures'
  ])assert.match(offboardingPlanSql,new RegExp(`public\\.${table}\\b`));
  assert.match(offboardingPlanSql,/'execution_enabled', false/i);
  assert.match(offboardingPlanSql,/delete_eligible_after_session_revoke/i);
  assert.match(offboardingPlanSql,/owned_companies/i);
  assert.match(offboardingPlanSql,/cascading_auth_references/i);
  assert.match(offboardingPlanSql,/set_null_auth_references/i);
  assert.match(offboardingPlanSql,/'auth_reference_counts'/i);
  for(const table of [
    'datev_lodas_rules','datev_lodas_settings','plan_publications','time_account_settings',
    'time_qr_terminals'
  ])assert.match(offboardingPlanSql,new RegExp(`public\\.${table}\\b`));
  assert.match(offboardingPlanSql,/CONTROLLED_REDACTION_REQUIRED/i);
  assert.match(offboardingPlanSql,/sf_assert_service_role/i);
  assert.doesNotMatch(offboardingPlanSql,/\bdelete\s+from\s+public\./i);
  assert.doesNotMatch(offboardingPlanSql,/\bupdate\s+public\./i);
  assert.doesNotMatch(offboardingPlanSql,/cron\.schedule/i);
});

test('offboarding execution separates immediate access from held erasure',()=>{
  assert.match(overdueFixSql,/greatest\(now\(\), v_as_of::timestamptz \+ interval '30 days'\)/i);
  assert.match(executionSql,/'ACCESS_REVOKED'/);
  assert.match(executionSql,/execution_phase in \('ACCESS','ERASURE'\)/i);
  assert.match(executionSql,/case when r\.status = 'APPROVED' then 'ACCESS' else 'ERASURE' end/i);
  assert.match(executionSql,/r\.status = 'APPROVED'[\s\S]*r\.access_revoke_after <= now\(\)/i);
  assert.match(executionSql,/r\.status = 'ACCESS_REVOKED'[\s\S]*r\.erase_after <= now\(\)/i);
  assert.match(executionSql,/Management membership requires separate offboarding approval/i);
  assert.match(executionSql,/delete from public\.employee_access_invites/i);
  assert.match(executionSql,/delete from public\.push_subscriptions/i);
  assert.match(executionSql,/email=null, phone=null, address=null, zip=null, city=null, note=''/i);
  assert.match(executionSql,/emergency_contact_name='', emergency_contact_phone='', private_note=''/i);
  assert.doesNotMatch(executionSql,/cron\.schedule/i);
  assert.doesNotMatch(executionSql,/delete from auth\./i);
});

test('privacy Edge Function pins its Supabase client dependency',()=>{
  assert.match(lifecycleEdge,/npm:@supabase\/supabase-js@\d+\.\d+\.\d+/);
  assert.doesNotMatch(lifecycleEdge,/npm:@supabase\/supabase-js@2["']/);
});

test('shared MFA guard fails closed and remains disconnected from existing RPCs',()=>{
  assert.match(mfaGuardSql,/auth\.jwt\(\)->>'aal'/i);
  assert.match(mfaGuardSql,/v_role = 'service_role'/i);
  assert.match(mfaGuardSql,/v_role <> 'authenticated' or v_aal <> 'aal2'/i);
  assert.match(mfaGuardSql,/message = 'MFA_REQUIRED'/i);
  assert.match(mfaGuardSql,/revoke all on function private\.sf_assert_aal2\(text\) from public, anon, authenticated/i);
  assert.match(mfaGuardSql,/grant execute on function private\.sf_assert_aal2\(text\) to authenticated, service_role/i);
  assert.doesNotMatch(mfaGuardSql,/create or replace function public\./i);
  assert.doesNotMatch(mfaGuardSql,/\b(delete|update|insert)\b\s+(from|into)?\s*public\./i);
});

test('browser MFA flow supports enrollment, login challenge and factor removal',()=>{
  for(const api of ['getAuthenticatorAssuranceLevel','listFactors','enroll','challenge','verify','unenroll']){
    assert.match(mfaClient,new RegExp(`auth\\.mfa\\.${api}\\(`));
  }
  assert.match(mfaClient,/currentLevel!=='aal1'\|\|level\?\.nextLevel!=='aal2'/);
  assert.match(mfaClient,/sixDigits\.test\(code\)/);
  assert.match(mfaClient,/signOut\(\{scope:'local'\}\)/);
  assert.doesNotMatch(mfaClient,/service[_-]?role/i);
  assert.ok(moduleLoader.indexOf("'assets/supabase-mfa-v1.js'")>moduleLoader.indexOf("'assets/supabase-data-v1.js'"));
  assert.match(settingsClient,/Authenticator verwalten/);
});

test('leaked-password readiness maps auth failures without exposing raw provider errors',()=>{
  const context={window:{}};
  vm.runInNewContext(authErrorsSource,context);
  const friendly=context.window.SFBackend.friendlyAuthError;
  assert.match(friendly({code:'weak_password'}),/Datenleck/);
  assert.match(friendly({message:'Password has been pwned'}),/Datenleck/);
  assert.match(friendly({code:'over_email_send_rate_limit'}),/zu viele Versuche/i);
  assert.equal(friendly({message:'internal provider detail'},'Sicherer Standardtext'),'Sicherer Standardtext');
  assert.ok(moduleLoader.indexOf("'assets/supabase-auth-errors-v1.js'")<moduleLoader.indexOf("'assets/supabase-auth-v1.js'"));
  for(const file of [
    'supabase-auth-v1.js','supabase-password-reset-v1.js','team-admin-v1.js',
    'supabase-employee-access-v1.js'
  ]){
    assert.match(fs.readFileSync(path.join(root,'assets',file),'utf8'),/friendlyAuthError/);
  }
});

test('disposable database fixture is fictitious and always rolled back',()=>{
  assert.match(lifecycleDbTest,/example\.invalid/i);
  assert.match(lifecycleDbTest,/DSFA Wegwerf-Testmandant/i);
  assert.match(lifecycleDbTest,/create extension if not exists pgtap with schema extensions/i);
  assert.match(lifecycleDbTest,/set local search_path = public, extensions/i);
  assert.match(lifecycleDbTest,/select plan\(41\)/i);
  assert.match(lifecycleDbTest,/aal1 cannot pass the shared sensitive-action guard/i);
  assert.match(lifecycleDbTest,/aal2 passes the shared sensitive-action guard/i);
  assert.match(lifecycleDbTest,/expanded preview inventories every offboarding data domain/i);
  assert.match(lifecycleDbTest,/another company membership blocks auth account deletion/i);
  assert.match(lifecycleDbTest,/access revocation is claimable immediately/i);
  assert.match(lifecycleDbTest,/active legal hold blocks erasure but not prior access revocation/i);
  assert.match(lifecycleDbTest,/membership in another company is preserved/i);
  assert.match(lifecycleDbTest,/due employee contact fields are redacted/i);
  assert.match(lifecycleDbTest,/expired inline legal hold makes erasure claimable automatically/i);
  assert.match(lifecycleDbTest,/select \* from finish\(\)/i);
  assert.match(lifecycleDbTest,/rollback\s*;/i);
  assert.doesNotMatch(lifecycleDbTest,/schichtfunk\.de/i);
});

test('sole-owner database fixture covers delayed approval and always rolls back',()=>{
  assert.match(soleOwnerDbTest,/example\.invalid/i);
  assert.match(soleOwnerDbTest,/Ein-OWNER Wegwerf-Testmandant/i);
  assert.match(soleOwnerDbTest,/select plan\(22\)/i);
  assert.match(soleOwnerDbTest,/SOLE_OWNER_MODE_NOT_AVAILABLE/i);
  assert.match(soleOwnerDbTest,/SOLE_OWNER_TARGET_BLOCKED/i);
  assert.match(soleOwnerDbTest,/SOLE_OWNER_COOLING_OFF_ACTIVE/i);
  assert.match(soleOwnerDbTest,/NEW_AUTH_SESSION_REQUIRED/i);
  assert.match(soleOwnerDbTest,/OFFBOARDING_PREVIEW_CHANGED/i);
  assert.match(soleOwnerDbTest,/active legal hold blocks confirmation/i);
  assert.match(soleOwnerDbTest,/SOLE_OWNER_CONFIRMATION_EXPIRED/i);
  assert.match(soleOwnerDbTest,/select \* from finish\(\)/i);
  assert.match(soleOwnerDbTest,/rollback\s*;/i);
  assert.doesNotMatch(soleOwnerDbTest,/schichtfunk\.de/i);
});

test('sole-owner branch protocol records tests, rollback, isolation and deletion',()=>{
  assert.match(soleOwnerBranchProtocol,/with_data=false/);
  assert.match(soleOwnerBranchProtocol,/22 geplant, 22 ausgeführt, 0 fehlgeschlagen/i);
  assert.match(soleOwnerBranchProtocol,/41 geplant, 41 ausgeführt, 0 fehlgeschlagen/i);
  assert.match(soleOwnerBranchProtocol,/anon=false.*authenticated=false.*service_role=true/i);
  assert.match(soleOwnerBranchProtocol,/0 fiktive Auth-Benutzer/i);
  assert.match(soleOwnerBranchProtocol,/Lösch-Zeitpläne \| 0/i);
  assert.match(soleOwnerBranchProtocol,/Branch gelöscht/i);
  assert.match(soleOwnerBranchProtocol,/0,01344 USD/);
});

test('privacy worker is token-protected, bounded, idempotent and fail-closed',()=>{
  assert.match(privacyWorkerEdge,/x-privacy-worker-token/);
  assert.match(privacyWorkerEdge,/safeEqual\(supplied,expected\)/);
  assert.match(privacyWorkerEdge,/Math\.max\(1,Math\.min\(requested,10\)\)/);
  assert.match(privacyWorkerEdge,/server_execute_privacy_access/);
  assert.match(privacyWorkerEdge,/server_privacy_erasure_external_plan/);
  assert.match(privacyWorkerEdge,/STORAGE_DELETE_NOT_CONFIRMED/);
  assert.match(privacyWorkerEdge,/auth\.admin\.deleteUser/);
  assert.match(privacyWorkerEdge,/server_fail_privacy_request/);
  assert.doesNotMatch(privacyWorkerEdge,/console\.(log|error).*serviceKey/);

  assert.match(privacyWorkerSql,/delete from auth\.sessions/i);
  assert.match(privacyWorkerSql,/Management membership requires separate offboarding approval/i);
  assert.match(privacyWorkerSql,/STORAGE_MANIFEST_CHANGED/);
  assert.match(privacyWorkerSql,/AUTH_ACCOUNT_DELETE_BLOCKED/);
  assert.match(privacyWorkerSql,/deletePersonnelDocuments/);
  assert.match(privacyWorkerSql,/deleteAuthAccount/);
  assert.match(privacyWorkerSql,/greatest\([\s\S]*new\.access_revoke_after[\s\S]*new\.requested_at/i);
  assert.match(privacyWorkerSql,/from public,anon,authenticated/i);
});

test('privacy schedule uses Vault secrets and one bounded 15-minute job',()=>{
  assert.match(privacyScheduleSql,/privacy_worker_url/);
  assert.match(privacyScheduleSql,/privacy_worker_token/);
  assert.match(privacyScheduleSql,/cron\.unschedule/);
  assert.match(privacyScheduleSql,/cron\.schedule/);
  assert.match(privacyScheduleSql,/'\*\/15 \* \* \* \*'/);
  assert.match(privacyScheduleSql,/timeout_milliseconds := 10000/);
  assert.doesNotMatch(privacyScheduleSql,/service[_-]?role/i);
});

test('privacy service-role boundary supports current claims JSON and remains fail-closed',()=>{
  assert.match(privacyRoleCompatSql,/request\.jwt\.claim\.role/);
  assert.match(privacyRoleCompatSql,/request\.jwt\.claims/);
  assert.match(privacyRoleCompatSql,/v_claims->>'role'/);
  assert.match(privacyRoleCompatSql,/Service role required/);
  assert.match(privacyRoleCompatSql,/perform private\.sf_assert_service_role\(\)/);
  assert.match(privacyRoleCompatSql,/from public,anon,authenticated/i);
});

test('production protocol proves scheduler path without touching a deletion request',()=>{
  assert.match(privacyProductionProtocol,/V1 bis V9/);
  assert.match(privacyProductionProtocol,/HTTP 200/);
  assert.match(privacyProductionProtocol,/0 Aufträge/);
  assert.match(privacyProductionProtocol,/0 Nutzdatenänderungen/);
  assert.match(privacyProductionProtocol,/anon=false.*authenticated=false.*service_role=true/i);
  assert.match(privacyProductionProtocol,/\*\/15 \* \* \* \*/);
  assert.match(privacyProductionProtocol,/35 allowlist-geprüften Bestandswarnungen/i);
});

test('logical restore fixture proves exact row recovery and rollback',()=>{
  assert.match(logicalRestoreDbTest,/example\.invalid/i);
  assert.match(logicalRestoreDbTest,/Restore Wegwerf-Testmandant/i);
  assert.match(logicalRestoreDbTest,/create temporary table restore_employee_snapshot/i);
  assert.match(logicalRestoreDbTest,/delete from public\.employees/i);
  assert.match(logicalRestoreDbTest,/insert into public\.employees select \* from restore_employee_snapshot/i);
  assert.match(logicalRestoreDbTest,/md5\(row_to_json\(e\)::text\)/i);
  assert.match(logicalRestoreDbTest,/select plan\(4\)/i);
  assert.match(logicalRestoreDbTest,/rollback\s*;/i);
});

test('branch Storage smoke test uses an authenticated REST cycle and cleans up',()=>{
  assert.match(storageBranchSmokeSource,/SUPABASE_TEST_URL/);
  assert.match(storageBranchSmokeSource,/SUPABASE_TEST_ANON_KEY/);
  assert.match(storageBranchSmokeSource,/\/storage\/v1/);
  assert.match(storageBranchSmokeSource,/method:'DELETE'/);
  assert.match(storageBranchSmokeSource,/sha256/);
  assert.match(storageBranchSmokeSource,/cleanupVerified:true/);
  assert.doesNotMatch(storageBranchSmokeSource,/service[_-]?role/i);
  assert.doesNotMatch(storageBranchSmokeSource,/zbvloohfjleadjnqhbbh|hltqgxdhnpueweoyazea/);
});

test('fictitious tenant can preview but staging requires owner/admin with MFA',()=>{
  const owner='11111111-1111-4111-8111-111111111111';
  const other='22222222-2222-4222-8222-222222222222';
  const company='33333333-3333-4333-8333-333333333333';
  const employee='44444444-4444-4444-8444-444444444444';
  const membership={company_id:company,user_id:owner,role:'OWNER',status:'ACTIVE'};
  const preview=parseLifecycleRequest({action:'preview',companyId:company,employeeId:employee});
  assert.equal(authorizeLifecycleRequest({membership,userId:owner,aal:'aal1',request:preview}),true);

  const stage=parseLifecycleRequest({action:'stage',companyId:company,employeeId:employee,
    idempotencyKey:'55555555-5555-4555-8555-555555555555',reason:'Fiktiver Offboarding-Test'});
  assert.throws(()=>authorizeLifecycleRequest({membership,userId:owner,aal:'aal1',request:stage}),/MFA_REQUIRED/);
  assert.equal(authorizeLifecycleRequest({membership,userId:owner,aal:'aal2',request:stage}),true);
  assert.throws(()=>authorizeLifecycleRequest({membership,userId:other,aal:'aal2',request:stage}),/FORBIDDEN/);
  assert.throws(()=>authorizeLifecycleRequest({membership:{...membership,role:'EMPLOYEE'},userId:owner,aal:'aal2',request:stage}),/FORBIDDEN/);

  const approval=parseLifecycleRequest({action:'approve',companyId:company,
    requestId:'66666666-6666-4666-8666-666666666666',
    retentionProfileId:'77777777-7777-4777-8777-777777777777'});
  assert.throws(()=>authorizeLifecycleRequest({membership,userId:owner,aal:'aal1',request:approval}),/MFA_REQUIRED/);
  assert.equal(authorizeLifecycleRequest({membership,userId:owner,aal:'aal2',request:approval}),true);
});

test('fictitious Storage restore requires exact object hashes',()=>{
  const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
  const expected=[
    {bucket:'personnel-documents',path:'tenant/employee/a.pdf',size:120,sha256:a},
    {bucket:'personnel-documents',path:'tenant/employee/b.png',size:240,sha256:b}
  ];
  assert.deepEqual(compareStorageManifests(expected,[...expected]),{
    ok:true,expectedCount:2,restoredCount:2,missing:[],unexpected:[],mismatched:[]
  });
  const bad=compareStorageManifests(expected,[
    {bucket:'personnel-documents',path:'tenant/employee/a.pdf',size:120,sha256:c},
    {bucket:'personnel-documents',path:'tenant/employee/c.txt',size:1,sha256:c}
  ]);
  assert.equal(bad.ok,false);
  assert.deepEqual(bad.missing,['personnel-documents/tenant/employee/b.png']);
  assert.deepEqual(bad.mismatched,['personnel-documents/tenant/employee/a.pdf']);
  assert.deepEqual(bad.unexpected,['personnel-documents/tenant/employee/c.txt']);
});

test('fictitious Storage export and restore are hashed from disk and detect modification',async()=>{
  assert.match(storageManifestSource,/entry\.isSymbolicLink\(\).*SYMLINK_NOT_ALLOWED/);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'schichtfunk-storage-'));
  const resolvedTemp=path.resolve(temp);
  const resolvedSystemTemp=`${path.resolve(os.tmpdir())}${path.sep}`;
  assert.ok(resolvedTemp.startsWith(resolvedSystemTemp));
  try{
    const exported=path.join(temp,'exported');
    const restored=path.join(temp,'restored');
    fs.mkdirSync(path.join(exported,'tenant','employee'),{recursive:true});
    fs.mkdirSync(path.join(restored,'tenant','employee'),{recursive:true});
    assert.throws(
      ()=>resolveManifestPath(path.join(exported,'..manifest.json'),exported),
      /MANIFEST_MUST_BE_OUTSIDE_STORAGE_ROOT/
    );
    assert.equal(resolveManifestPath(path.join(temp,'manifest.json'),exported),path.join(temp,'manifest.json'));
    fs.writeFileSync(path.join(exported,'tenant','employee','test.pdf'),'fictitious-pdf-content');
    fs.copyFileSync(
      path.join(exported,'tenant','employee','test.pdf'),
      path.join(restored,'tenant','employee','test.pdf')
    );
    const manifest=await buildStorageManifest(exported,'personnel-documents');
    assert.equal(manifest.length,1);
    assert.deepEqual(await verifyStorageDirectory(manifest,restored,'personnel-documents'),{
      ok:true,expectedCount:1,restoredCount:1,missing:[],unexpected:[],mismatched:[]
    });
    fs.appendFileSync(path.join(restored,'tenant','employee','test.pdf'),'-changed');
    const changed=await verifyStorageDirectory(manifest,restored,'personnel-documents');
    assert.equal(changed.ok,false);
    assert.deepEqual(changed.mismatched,['personnel-documents/tenant/employee/test.pdf']);
  }finally{
    fs.rmSync(resolvedTemp,{recursive:true,force:true});
  }
});
