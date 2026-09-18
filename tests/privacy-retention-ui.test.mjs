import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ui=fs.readFileSync(path.join(root,'assets','privacy-retention-ui-v1.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'assets','conflict-plausibility-v1.js'),'utf8');

test('privacy retention UI is loaded after MFA support and inside admin compliance settings',()=>{
  assert.match(loader,/assets\/supabase-mfa-v1\.js[\s\S]*assets\/privacy-retention-ui-v1\.js/);
  assert.match(ui,/renderComplianceSettings/);
  assert.match(ui,/Datenschutz & Löschung/);
  assert.match(ui,/\['OWNER','ADMIN'\]/);
});

test('retention profile first and second approvals require AAL2 and use the protected edge function',()=>{
  assert.match(ui,/requireMfaChallenge/);
  assert.match(ui,/currentLevel!=='aal2'/);
  assert.match(ui,/privacy-lifecycle/);
  assert.match(ui,/stage-retention-profile/);
  assert.match(ui,/confirm-retention-profile/);
  assert.match(ui,/replace-retention-profile/);
  assert.match(ui,/fachlich überholt und gesperrt/);
  assert.match(ui,/Zweite Freigabe/);
  assert.match(ui,/neuen Anmeldung/);
});

test('default retention profile remains conservative for destructive external deletion',()=>{
  assert.match(ui,/contactDays:30/);
  assert.match(ui,/auditYears:3/);
  assert.match(ui,/timeEvidenceYears:6/);
  assert.match(ui,/monthSnapshotYears:6/);
  assert.match(ui,/datevAuditYears:6/);
  assert.match(ui,/deletePersonnelDocuments:false/);
  assert.match(ui,/deleteAuthAccount:false/);
  assert.match(ui,/vertraglich\/rechtlich/);
});
