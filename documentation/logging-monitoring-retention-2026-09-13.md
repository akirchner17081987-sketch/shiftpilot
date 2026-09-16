# SchichtFunk – Logging-, Monitoring- und Aufbewahrungsmatrix

Stand: 13.09.2026  
Dokumentstatus: Betreiberunterlage, Version 1.0  

## 1. Grundsätze

Protokolle dienen ausschließlich Sicherheit, Fehleranalyse, Nachvollziehbarkeit, Wiederherstellung und vereinbarten fachlichen Nachweisen. Es gilt Datenminimierung: keine Passwörter, Zugangstoken, privaten Schlüssel, vollständigen Personalakten, Diagnosen oder unnötigen Nachrichteninhalte protokollieren. Personenbezug ist nur zu verwenden, wenn Mandanten-, Akteurs- oder Vorgangszurechnung erforderlich ist.

Zeitangaben werden für technische Korrelation in UTC erfasst; Darstellungen dürfen zusätzlich die lokale Zeitzone ausweisen. Zugriff auf Sicherheits- und Betriebsprotokolle wird auf die jeweils notwendige Rolle beschränkt.

## 2. Aktueller Nachweisstand

| Quelle | Inhalt und Schutz | Aktueller Nachweis | Aufbewahrung / offene Grenze |
|---|---|---|---|
| `public.audit_events` | mandantenbezogene fachliche und sicherheitsrelevante Ereignisse; Akteur, Rolle, Entität, Zeitpunkt sowie begrenzte Alt-/Neu-/Metadaten | Migrationen erzwingen RLS, `FORCE ROW LEVEL SECURITY`, entziehen direkte Schreib-/Löschrechte und schützen per Trigger gegen Update/Löschung; Lesen ist auf berechtigte Adminrollen begrenzt | noch keine technisch aktivierte Langfristredaktion; kundenbezogene Frist und zulässige Inhaltsreduktion festlegen |
| Supabase Auth | Anmeldungen, Auth-Fehler, MFA- und Kontenereignisse im Anbieterbereich | TOTP, AAL1-Zeitgrenze und Leaked Password Protection sind dokumentiert | konkrete Logaufbewahrung und Exportmöglichkeit im aktiven Tarif erneut im Dashboard bestätigen |
| Supabase Datenbank/Edge Functions | Datenbank- und Funktionsfehler, Laufzeit- und Plattformereignisse | Edge Functions und Projektstatus wurden geprüft; keine dauerhafte externe Logsenke eingerichtet | Anbieteraufbewahrung, Zugriffsrollen, Suchweg und Alarmierung dokumentieren |
| Supabase Security Advisor | Sicherheitsbefunde zu Datenbank und Auth | Leaked-Password-Warnung beseitigt; 35 RPC-Hinweise allowlist-geprüft | mindestens vor Releases und nach Schema-/Auth-Änderungen erneut prüfen; automatische Benachrichtigung nicht nachgewiesen |
| Supabase Backups | Status täglicher physischer Datenbanksicherungen | sichtbare tägliche Sicherungen bis 13.09.2026; logischer DB- und privater Storage-Test bestanden | fehlende tägliche Sicherung wird noch nicht automatisch an SchichtFunk alarmiert |
| IONOS Deploy Now | Deployment-, Zugriffs-, Sicherheits- und technische Verbindungsdaten | erfolgreiche Vorschau und öffentlicher Livecheck; allgemeine Hostinganlage nennt maximal sieben Tage für Logfiles | Deploy-Now-spezifische Zuordnung und Zugriffsmöglichkeit schriftlich bestätigen |
| GitHub Actions und Git | Build-, Test-, Deployment- und Änderungshistorie ohne Produktivdaten | Regression, IONOS-Suite, Build und versionierte Änderungen vorhanden | Repository-Aufbewahrung für Workflowläufe und Schutzregeln noch nicht als Betreiberbeleg erfasst |
| Demo-Tagesaggregate | zugelassene Ereignis-/Wert-Paare, keine individuellen Demo-Sitzungsprofile | private Aggregation und serverseitige Allowlist vorhanden | fachliche Frist für Aggregate festlegen; Re-Identifizierbarkeit regelmäßig verneinen |
| Endgeräte/PWA | Browserkonsole und lokaler Cache nur zur kurzfristigen Diagnose | Service Worker schließt API/QR aus; App-Shell kontrolliert | keine zentrale Sammlung; Nutzer dürfen keine Echtdaten-Screenshots ungeschützt weitergeben |

## 3. Verbindliche Prüfauslöser

Die folgenden Prüfungen sind auszulösen:

- **vor jeder Produktivfreigabe:** Regression, IONOS-Suite, Buildgröße, Abhängigkeitsprüfung und öffentlicher Header-/Routingcheck;
- **nach Datenbank-, RLS-, RPC-, Storage- oder Auth-Änderungen:** Security Advisor, Allowlist-Drifttest und betroffene Fremdmandanten-Negativtests;
- **nach fehlgeschlagenem Deployment:** GitHub-/IONOS-Lauf prüfen, kein Domainwechsel auf einen ungeprüften Stand;
- **bei unerwartetem Auth-, Mandanten- oder Exportverhalten:** Incident nach `incident-response-runbook-2026-09-13.md` eröffnen;
- **mindestens jährlich:** Restore, Incident-Planspiel, Anbieter-/Unterauftragnehmerprüfung sowie Aktualität von TOM und Nachweisregister;
- **anlassbezogen:** Schlüsselrotation, Mitarbeiter-/Rollenwechsel, Anbieterwarnung oder bekannt gewordene Schwachstelle.

## 4. Ziel-Alarme vor dem ersten kommerziellen Echtbetrieb

| Alarm | Zielreaktion | Status |
|---|---|---|
| IONOS-Vorschau oder produktive Domain nicht erreichbar | prüfen, bekannten Stand wiederherstellen, Kunden bei relevanter Beeinträchtigung informieren | technisch noch nicht eingerichtet |
| fehlgeschlagener Build oder Deploymentlauf | Freigabe blockieren; Fehlerursache dokumentieren | CI blockiert bei Test-/Buildfehlern; aktive Benachrichtigungsroute nicht nachgewiesen |
| fehlende oder fehlerhafte tägliche Datenbanksicherung | Supabase-Status und Support prüfen; RPO-Risiko bewerten | automatische Alarmierung nicht nachgewiesen |
| neue Security-Advisor-Warnung oder Allowlist-Drift | Freigabe stoppen; Berechtigung und Datenwirkung prüfen | reproduzierbare Prüfung vorhanden; Zeitplanung/Alarm offen |
| ungewöhnliche Auth-Fehler, neue MFA-/Kontenänderung oder vermutete Sitzungskompromittierung | Konto/Sitzung sichern und Incident einstufen | Anbieter-/Appdaten vorhanden; Schwellenwert und Benachrichtigung offen |
| Edge-Function-Fehlerhäufung bei Demo, Push oder Lifecycle | Funktionsversion, Geheimnisse und Providerstatus prüfen | Logzugriff vorhanden; Alarmierung offen |
| unerwarteter Fremdmandantenzugriff oder Export | P1, sofort eindämmen und betroffene Verantwortliche informieren | Runbook vorhanden; echter technischer Drill offen |

## 5. Vorläufige Aufbewahrungsentscheidung

Bis kundenspezifische Fristprofile rechtlich freigegeben sind, werden für Beschäftigten- und Anwendungsaudits **keine pauschalen automatischen Löschfristen als produktiv umgesetzt behauptet**. Stattdessen gilt:

1. Anbieterlogs laufen nach den jeweiligen, zu dokumentierenden Anbieterfristen aus.
2. Incident-Unterlagen werden fallbezogen, zugriffsbeschränkt und nur so lange aufbewahrt, wie Untersuchung, Nachweis, Rechtsverteidigung oder gesetzliche Pflichten dies erfordern; die konkrete Frist wird beim Abschluss festgelegt.
3. Fachliche `audit_events` benötigen eine kundenbezogene Frist sowie ein technisch getestetes Redaktions-/Löschverfahren, bevor eine automatische Langfristbereinigung aktiviert wird.
4. Workflow-/Releasebelege dürfen keine Produktivdaten oder Geheimnisse enthalten und werden im Rahmen der Repository-/Anbieteraufbewahrung geführt.
5. Gelöschte Live-Daten können bis zum Ablauf des jeweiligen Backupfensters in Sicherungen verbleiben und dürfen nicht zur gewöhnlichen Recherche wiederhergestellt werden.

## 6. Zugriffs- und Kontrollcheckliste

- ☐ Vertretung für den Betreiber benannt
- ☐ überwachte Alarmadresse und Bereitschaftszeiten festgelegt
- ☐ Supabase-Logquellen, Aufbewahrungszeiten und Rollen im aktiven Pro-Projekt bestätigt
- ☐ IONOS-Deploy-Now-Logzugriff und produktspezifische Frist bestätigt
- ☐ GitHub-Workflow-Aufbewahrung und Branchschutz dokumentiert
- ☐ kundenbezogene Audit-/Incident-Fristen rechtlich freigegeben
- ☐ Alarmtest mit ausschließlich fiktiven Daten protokolliert
- ☐ jährlicher Restore- und Incident-Übungstermin festgelegt

## 7. Quellen und technische Referenzen

- `supabase/migrations/20260901202710_add_secure_audit_logs.sql`
- `supabase/migrations/20260901202920_harden_audit_log_reader.sql`
- `supabase/migrations/20260902112933_restrict_audit_events_to_admins.sql`
- `documentation/security-definer-allowlist-2026-09-13.md`
- `documentation/backup-storage-restore-pruefung-2026-09-13.md`
- `documentation/incident-response-runbook-2026-09-13.md`
- Supabase Security: https://supabase.com/docs/guides/security
- Supabase Backups: https://supabase.com/docs/guides/platform/backups

Status: 🟡 **LOGQUELLEN, PRÜFAUSLÖSER UND ZIEL-ALARME DOKUMENTIERT; AUFBEWAHRUNGSBESTÄTIGUNGEN, ALARMIERUNG UND KUNDENSPEZIFISCHE FRISTEN OFFEN.**

