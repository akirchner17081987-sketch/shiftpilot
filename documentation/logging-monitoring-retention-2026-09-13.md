# SchichtFunk – Logging-, Monitoring- und Aufbewahrungsmatrix

Stand: 16.09.2026  
Dokumentstatus: Betreiberunterlage, Version 1.1

## 1. Grundsätze

Protokolle dienen ausschließlich Sicherheit, Fehleranalyse, Nachvollziehbarkeit, Wiederherstellung und vereinbarten fachlichen Nachweisen. Es gilt Datenminimierung: keine Passwörter, Zugangstoken, privaten Schlüssel, vollständigen Personalakten, Diagnosen oder unnötigen Nachrichteninhalte protokollieren. Personenbezug ist nur zu verwenden, wenn Mandanten-, Akteurs- oder Vorgangszurechnung erforderlich ist.

Zeitangaben werden für technische Korrelation in UTC erfasst; Darstellungen dürfen zusätzlich die lokale Zeitzone ausweisen. Zugriff auf Sicherheits- und Betriebsprotokolle wird auf die jeweils notwendige Rolle beschränkt.

## 2. Aktueller Nachweisstand

| Quelle | Inhalt und Schutz | Aktueller Nachweis | Aufbewahrung / offene Grenze |
|---|---|---|---|
| `public.audit_events` | mandantenbezogene fachliche und sicherheitsrelevante Ereignisse; Akteur, Rolle, Entität, Zeitpunkt sowie begrenzte Alt-/Neu-/Metadaten | RLS, `FORCE ROW LEVEL SECURITY`, unveränderliche Ereignisidentität und V11-Langfristredaktion technisch aktiv; Ausführung nur über freigegebenes Fristprofil | Fristprofil V1 ist vorbereitet und wartet auf die zweite OWNER-Sicherheitsbestätigung nach 24 Stunden |
| Supabase Auth | Anmeldungen, Auth-Fehler, MFA- und Kontenereignisse im Anbieterbereich | TOTP, AAL1-Zeitgrenze, Leaked Password Protection und Auth-Healthcheck dokumentiert | Pro-Plan: 7 Tage direkt zugängliche Logs laut aktueller Supabase-Dokumentation |
| Supabase Datenbank/Edge Functions | Datenbank-, Auth-, Storage-, Realtime- und Funktionsereignisse | Logs Explorer verfügbar; Pro-Projekt aktiv; Log Drains sind auf Pro verfügbar | noch keine externe Logsenke eingerichtet; für längere Aufbewahrung kann ein Log Drain an ein freigegebenes Ziel angeschlossen werden |
| Supabase Security Advisor | Sicherheitsbefunde zu Datenbank und Auth | Leaked-Password-Warnung beseitigt; verbleibende RLS-/SECURITY-DEFINER-Hinweise am 16.09.2026 erneut geprüft und dokumentiert | vor Releases und nach Schema-/Auth-Änderungen erneut prüfen; automatische Advisor-Alarmierung noch nicht eingerichtet |
| Supabase Backups | tägliche physische Datenbanksicherungen | tägliche Sicherungen im Pro-Projekt nachgewiesen; logischer DB- und privater Storage-Restore auf Wegwerf-Umgebung bestanden | Pro: 7 Tage tägliche Backups; physischer Restore in ein neues Projekt und dauerhafter separater Storage-Export noch offen |
| IONOS Deploy Now | Deployment- und Laufzeitverfügbarkeit der statischen PWA | IONOS-Vorschau produktionsnah bereitgestellt; synthetischer Check prüft Startseite, Security Header, PWA-Manifest, Service Worker und Datenschutzseite | Deploy-Now-spezifische Logaufbewahrung/Zugriffsmöglichkeit noch nicht belastbar bestätigt; allgemeine Webhosting-Logdokumentation wird nicht als Deploy-Now-Nachweis verwendet |
| GitHub Actions und Git | Build-, Test-, Deployment- und Änderungshistorie ohne Produktivdaten | Regression, IONOS-Suite, Build und versionierte Änderungen vorhanden; `operational-health-watch.yml` mit synthetischem IONOS-/Supabase-Check ergänzt | Zeitplan läuft nach Übernahme auf den Default-Branch alle 30 Minuten; GitHub-Benachrichtigungsweg des Betreibers muss organisatorisch bestätigt bleiben |
| Demo-Tagesaggregate | zugelassene Ereignis-/Wert-Paare, keine individuellen Demo-Sitzungsprofile | private Aggregation und serverseitige Allowlist vorhanden | fachliche Frist für Aggregate festlegen; Re-Identifizierbarkeit regelmäßig verneinen |
| Endgeräte/PWA | Browserkonsole und lokaler Cache nur zur kurzfristigen Diagnose | Service Worker schließt API/QR aus; App-Shell kontrolliert | keine zentrale Sammlung; Nutzer dürfen keine Echtdaten-Screenshots ungeschützt weitergeben |

## 3. Synthetisches Verfügbarkeitsmonitoring

Am 16.09.2026 wurde `scripts/operational-healthcheck.mjs` zusammen mit `.github/workflows/operational-health-watch.yml` ergänzt. Der Check verarbeitet keine Beschäftigten- oder Kundendaten und führt ausschließlich lesende technische Prüfungen aus.

Geprüft werden:

1. IONOS-Startseite: HTTP 200, SchichtFunk-Marker und zentrale Security Header;
2. PWA-Manifest: HTTP 200 und gültiger SchichtFunk-Name;
3. Service Worker: HTTP 200 und plausibler Inhalt;
4. Datenschutzseite: HTTP 200 und Inhaltsmarker;
5. Supabase Auth Health: offizieller `/auth/v1/health`-Endpunkt mit Publishable Key, erwartetes GoTrue-Health-Payload.

Fehlgeschlagene Einzelprüfungen werden nach kurzer Wartezeit einmal wiederholt. Danach schlägt der Workflow fehl und liefert eine GitHub-Step-Summary. Der Workflow besitzt nur `contents: read` und verändert keine Produktivdaten.

Erstlauf auf Commit `4a123ea1f20ac5d853888ddaffafa8017832a144` am 16.09.2026 um 02:54 UTC: **5/5 Prüfungen bestanden**. Startseite, Manifest, Service Worker, Datenschutzseite und Supabase Auth Health lieferten jeweils HTTP 200.

Der geplante 30-Minuten-Cron wird von GitHub nur auf dem Default-Branch ausgeführt. Auf `codex/ionos-migration` sind Push- und manuelle Prüfungen bereits aktiv; die wiederkehrende Zeitplanung wird mit der späteren sicheren Integration in `main` wirksam.

## 4. Verbindliche Prüfauslöser

Die folgenden Prüfungen sind auszulösen:

- **vor jeder Produktivfreigabe:** Regression, IONOS-Suite, Buildgröße, Abhängigkeitsprüfung und öffentlicher Header-/Routingcheck;
- **nach Datenbank-, RLS-, RPC-, Storage- oder Auth-Änderungen:** Security Advisor, Allowlist-Drifttest und betroffene Fremdmandanten-Negativtests;
- **nach fehlgeschlagenem Deployment oder Healthcheck:** GitHub-/IONOS-Lauf prüfen, Incident-Schweregrad bestimmen und keinen Domainwechsel auf einen ungeprüften Stand durchführen;
- **bei unerwartetem Auth-, Mandanten- oder Exportverhalten:** Incident nach `incident-response-runbook-2026-09-13.md` eröffnen;
- **mindestens jährlich:** Restore, Incident-Planspiel, Anbieter-/Unterauftragnehmerprüfung sowie Aktualität von TOM und Nachweisregister;
- **anlassbezogen:** Schlüsselrotation, Mitarbeiter-/Rollenwechsel, Anbieterwarnung oder bekannt gewordene Schwachstelle.

## 5. Ziel-Alarme vor dem ersten kommerziellen Echtbetrieb

| Alarm | Zielreaktion | Status |
|---|---|---|
| IONOS-Vorschau bzw. später produktive Domain oder Supabase Auth Health nicht erreichbar | prüfen, bekannten Stand wiederherstellen, Kunden bei relevanter Beeinträchtigung informieren | 🟢 technischer synthetischer Check vorhanden; Zeitplan nach Default-Branch-Integration aktiv |
| fehlgeschlagener Build oder Deploymentlauf | Freigabe blockieren; Fehlerursache dokumentieren | 🟢 CI blockiert bei Test-/Buildfehlern; GitHub-Lauf ist nachvollziehbar |
| fehlende oder fehlerhafte tägliche Datenbanksicherung | Supabase-Status und Support prüfen; RPO-Risiko bewerten | 🟡 automatische projektbezogene Backup-Alarmierung nicht nachgewiesen |
| neue Security-Advisor-Warnung oder Allowlist-Drift | Freigabe stoppen; Berechtigung und Datenwirkung prüfen | 🟡 reproduzierbare Prüfung vorhanden; Zeitplanung/Alarm noch offen |
| ungewöhnliche Auth-Fehler, neue MFA-/Kontenänderung oder vermutete Sitzungskompromittierung | Konto/Sitzung sichern und Incident einstufen | 🟡 Anbieter-/Appdaten vorhanden; Schwellenwert und Benachrichtigung offen |
| Edge-Function-Fehlerhäufung bei Demo, Push oder Lifecycle | Funktionsversion, Geheimnisse und Providerstatus prüfen | 🟡 Logzugriff vorhanden; externe Alarmierung offen |
| unerwarteter Fremdmandantenzugriff oder Export | P1, sofort eindämmen und betroffene Verantwortliche informieren | 🟡 Runbook und Negativtests vorhanden; echter technischer Incident-Drill offen |

## 6. Aufbewahrungsentscheidung

1. Supabase-Projektlogs sind im aktiven Pro-Tarif laut Anbieter für 7 Tage direkt zugänglich. Für längere technische Aufbewahrung sind Log Drains auf Pro verfügbar, aber noch nicht konfiguriert.
2. Incident-Unterlagen werden fallbezogen, zugriffsbeschränkt und nur so lange aufbewahrt, wie Untersuchung, Nachweis, Rechtsverteidigung oder gesetzliche Pflichten dies erfordern; die konkrete Frist wird beim Abschluss festgelegt.
3. Fachliche `audit_events` besitzen jetzt ein technisch getestetes Langfristredaktionsverfahren. Die produktive Ausführung bleibt an ein genehmigtes kundenspezifisches Fristprofil gebunden.
4. Workflow-/Releasebelege dürfen keine Produktivdaten oder Geheimnisse enthalten und werden im Rahmen der Repository-/Anbieteraufbewahrung geführt.
5. Gelöschte Live-Daten können bis zum Ablauf des jeweiligen Backupfensters in Sicherungen verbleiben und dürfen nicht zur gewöhnlichen Recherche wiederhergestellt werden.
6. Für IONOS Deploy Now wird keine Aufbewahrungsdauer aus einer allgemeinen Webhosting-Dokumentation übernommen. Die produktspezifische Bestätigung bleibt offen.

## 7. Zugriffs- und Kontrollcheckliste

- ☐ Vertretung für den Betreiber benannt
- ☐ überwachte Alarmadresse und Bereitschaftszeiten organisatorisch festgelegt
- ☑ Supabase-Logquellen und Pro-Aufbewahrungsfenster dokumentiert
- ☑ synthetischer IONOS-/Supabase-Healthcheck implementiert und erfolgreich ausgeführt
- ☐ IONOS-Deploy-Now-Logzugriff und produktspezifische Frist bestätigt
- ☐ GitHub-Workflow-Aufbewahrung und Branchschutz als Betreiberbeleg final dokumentiert
- ☐ kundenspezifische Audit-/Incident-Fristen rechtlich freigegeben
- ☐ Alarm-Negativtest mit ausschließlich fiktivem Fehlerzustand protokolliert
- ☐ jährlicher Restore- und Incident-Übungstermin festgelegt

## 8. Quellen und technische Referenzen

- `scripts/operational-healthcheck.mjs`
- `.github/workflows/operational-health-watch.yml`
- `documentation/security-advisor-review-2026-09-16.md`
- `documentation/security-definer-allowlist-2026-09-13.md`
- `documentation/backup-storage-restore-pruefung-2026-09-13.md`
- `documentation/incident-response-runbook-2026-09-13.md`
- Supabase Logs: https://supabase.com/docs/guides/observability/logs
- Supabase Log Drains: https://supabase.com/docs/guides/observability/log-drains
- Supabase Backups: https://supabase.com/docs/guides/platform/backups
- Supabase Auth Health: https://supabase.com/docs/guides/troubleshooting/how-do-i-check-gotrueapi-version-of-a-supabase-project-lQAnOR

Status: 🟡 **SYNTHETISCHES IONOS-/SUPABASE-MONITORING IMPLEMENTIERT UND 5/5 BESTANDEN; SUPABASE-PRO-LOGFENSTER DOKUMENTIERT. OFFEN SIND NOCH DEFAULT-BRANCH-ZEITPLAN, BACKUP-ALARM, IONOS-DEPLOY-NOW-LOGBESTÄTIGUNG, VERTRETUNG/ALARMIERUNG UND NEGATIV-ALARMTEST.**
