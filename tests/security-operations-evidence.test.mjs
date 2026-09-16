import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const incident=read('documentation/incident-response-runbook-2026-09-13.md');
const evidence=read('documentation/security-operations-evidence-2026-09-13.md');
const crossTenant=read('documentation/security-definer-cross-tenant-test-2026-09-13.md');
const monitoring=read('documentation/logging-monitoring-retention-2026-09-13.md');
const tom=read('documentation/tom-2026-09-12.md');
const apache=read('.htaccess');
const worker=read('schichtfunk-sw.js');
const build=read('scripts/build-static.mjs');
const workflow=read('.github/workflows/regression-tests.yml');
const healthWorkflow=read('.github/workflows/operational-health-watch.yml');
const healthScript=read('scripts/operational-healthcheck.mjs');

test('incident runbook preserves processor duties and the 72-hour decision path',()=>{
  assert.match(incident,/Auftragsverarbeiter[\s\S]*unverzüglich/i);
  assert.match(incident,/72 Stunden/i);
  assert.match(incident,/Artikel 34 DSGVO/i);
  assert.match(incident,/SF-INC-YYYYMMDD-NNN/);
  assert.match(incident,/keine 24\/7-Reaktionsbereitschaft behauptet/i);
  assert.match(incident,/keine Produktionskonten verwendet/i);
  assert.match(incident,/Vertretung[\s\S]*noch zu benennen/i);
});

test('evidence register is explicit about proof levels and unresolved controls',()=>{
  for(const level of ['Live-Nachweis','technischer Nachweis','Prozessnachweis','Anbieternachweis','offen']){
    assert.match(evidence,new RegExp(level,'i'));
  }
  assert.match(evidence,/2\.159\.480 Byte/);
  assert.match(evidence,/physischer Tagesbackup-Restore/i);
  assert.match(evidence,/35\/35 Fremdmandantenprüfungen/i);
  assert.match(crossTenant,/35\/35 bestanden, 0 fehlgeschlagen/i);
  assert.match(crossTenant,/ROLLBACK/i);
  assert.match(crossTenant,/Branch-Löschung bestätigt/i);
  assert.match(evidence,/keine 24\/7-Verfügbarkeitsmessung/i);
  assert.match(evidence,/keine Zugangsdaten enthalten/i);
});

test('monitoring matrix distinguishes active controls from unresolved operational dependencies',()=>{
  assert.match(monitoring,/public\.audit_events/);
  assert.match(monitoring,/FORCE ROW LEVEL SECURITY/);
  assert.match(monitoring,/Langfristredaktion technisch aktiv/i);
  assert.match(monitoring,/genehmigtes kundenspezifisches Fristprofil/i);
  assert.match(monitoring,/automatische projektbezogene Backup-Alarmierung nicht nachgewiesen/i);
  assert.match(monitoring,/IONOS-Deploy-Now-Logzugriff/i);
  assert.match(monitoring,/Alarm-Negativtest mit ausschließlich fiktivem Fehlerzustand/i);
  assert.match(monitoring,/5\/5 Prüfungen bestanden/i);
});

test('synthetic operational health watch is read-only, scheduled and retains evidence',()=>{
  assert.match(healthWorkflow,/cron:\s*'17,47 \* \* \* \*'/);
  assert.match(healthWorkflow,/permissions:\s*\n\s*contents:\s*read/);
  assert.match(healthWorkflow,/Verify failure detection without touching production/i);
  assert.match(healthWorkflow,/127\.0\.0\.1:9/);
  assert.match(healthWorkflow,/actions\/upload-artifact@v4/);
  assert.match(healthWorkflow,/retention-days:\s*30/);
  assert.match(healthWorkflow,/HEALTHCHECK_REPORT_PATH:\s*artifacts\/operational-health\.json/);
  assert.match(healthScript,/site\.webmanifest/);
  assert.match(healthScript,/schichtfunk-sw\.js/);
  assert.match(healthScript,/datenschutz\.html/);
  assert.match(healthScript,/auth\/v1\/health/);
  assert.match(healthScript,/content-security-policy/);
  assert.match(healthScript,/strict-transport-security/);
  assert.match(healthScript,/HEALTHCHECK_REPORT_PATH/);
  assert.match(healthScript,/mode:0o600/);
  assert.match(healthScript,/process\.exit\(1\)/);
});

test('IONOS security headers and PWA cache exclusions remain fail-safe',()=>{
  for(const header of [
    'Content-Security-Policy','Strict-Transport-Security','X-Content-Type-Options',
    'X-Frame-Options','Referrer-Policy','Permissions-Policy'
  ])assert.match(apache,new RegExp(header));
  assert.match(apache,/schichtfunk-sw\\\.js\|site\\\.webmanifest\|\.\*\\\.html/);
  assert.match(apache,/no-cache, no-store, must-revalidate/);
  assert.match(worker,/url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker,/url\.pathname==='\/qr-time'/);
  assert.match(worker,/!cc\.includes\('no-store'\)&&!cc\.includes\('private'\)/);
});

test('release path keeps dependency, regression and size gates reproducible',()=>{
  assert.match(workflow,/npm ci/);
  assert.match(workflow,/npm test/);
  assert.match(build,/50 \* 1024 \* 1024/);
  assert.match(build,/Required static output is missing or empty/);
  assert.match(tom,/Sicherheits- und Betriebsnachweisregister/i);
});
