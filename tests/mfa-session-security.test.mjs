import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const auth=read('assets/supabase-auth-v1.js');
const mfa=read('assets/supabase-mfa-v1.js');
const settings=read('assets/settings-management-v2.js');
const live=read('scripts/verify-supabase-mfa-live.mjs');

test('account UI exposes a confirmed global session revocation path',()=>{
  assert.match(settings,/Alle Sitzungen beenden/);
  assert.match(settings,/confirmGlobalSignOut/);
  assert.match(auth,/signOut\(\{scope:'global'\}\)/);
  assert.match(auth,/Bereits ausgestellte kurzlebige Zugriffstoken können bis zu ihrem Ablauf gültig bleiben/);
  assert.match(auth,/Sitzungswiderruf fehlgeschlagen/);
});

test('live MFA verifier is restricted to a disposable non-production project',()=>{
  assert.match(live,/!url\.includes\('zbvloohfjleadjnqhbbh'\)/);
  assert.match(live,/@example\\\.invalid\$/);
  assert.doesNotMatch(live,/sb_(publishable|secret)_/i);
  assert.doesNotMatch(live,/console\.log\([^\n]*(password|secret|token)/i);
});

test('live MFA verifier covers two accounts, backup recovery and revocation',()=>{
  for(const marker of ['SF_MFA_OWNER_EMAIL','SF_MFA_EMPLOYEE_EMAIL','Primärfaktor Test','Ersatzfaktor Test',"signOut\\(primary,'others'\\)","signOut\\(recovery,'global'\\)",'wrongCodeRejected','backupRecovery'])assert.match(live,new RegExp(marker));
  assert.match(live,/assurance\(primary\),'aal1'/);
  assert.match(live,/assurance\(primary\),'aal2'/);
  assert.match(live,/assurance\(recovery\),'aal1'/);
  assert.match(live,/assurance\(recovery\),'aal2'/);
  assert.match(live,/widerrufene Refresh-Sitzung wurde akzeptiert/);
});

test('privileged accounts must enroll and cannot remove their final verified factor in the UI',()=>{
  assert.match(mfa,/\['OWNER','ADMIN'\]\.includes\(B\.role\)/);
  assert.match(mfa,/B\.enforcePrivilegedMfaEnrollment=async function/);
  assert.match(mfa,/B\.openMfaSettings\(\{mandatory:true\}\)/);
  assert.match(mfa,/if\(mandatory\)await signOut\(\)/);
  assert.match(mfa,/Mindestens ein bestätigter Authenticator ist für dieses privilegierte Konto erforderlich/);
  assert.match(mfa,/lastRequired\?'Erforderlich':'Entfernen'/);
});

test('an MFA_REQUIRED RPC response triggers one challenge and one controlled retry',()=>{
  assert.match(mfa,/B\.installMfaRpcRetry=function/);
  assert.match(mfa,/MFA_REQUIRED/i);
  assert.match(mfa,/await B\.requireMfaChallenge\(\)/);
  assert.match(mfa,/result=await base\(\.\.\.args\)/);
  assert.match(mfa,/Für diese Aktion muss zuerst ein Authenticator eingerichtet werden/);
});
