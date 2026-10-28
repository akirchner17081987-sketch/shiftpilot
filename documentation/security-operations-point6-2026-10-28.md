# Punkt 6 – Sicherheit, Datenschutz und Betrieb

Prüftag: 28.10.2026. Produktion: IONOS `https://schichtfunk.de`, Supabase-Projekt `zbvloohfjleadjnqhbbh`, `eu-central-1`, Status `ACTIVE_HEALTHY`, PostgreSQL 17.6.

## Checkliste und belastbarer Status

| Anforderung | Stand | Nachweis / verbleibende Grenze |
|---|---|---|
| Rollen und Mandantentrennung prüfen | Erledigt im beschriebenen Prüfumfang | 40/40 öffentliche SECURITY-DEFINER-RPCs gegen Fremdmandant; aktueller Rollen-/MFA-Test und direkte Tabellenpfade; zusätzlicher Live-Test mit 13 Audit-/Zugriffskontrollen |
| Änderungen an Diensten, Arbeitszeiten und Regeln dokumentieren | Erledigt im beschriebenen Prüfumfang | Live: Dienständerung, Zeitkorrektur mit Grund und Regeländerung jeweils mit Bearbeiter und Vorher-/Nachher-Werten; Audit-Manipulation abgewehrt |
| Datensicherung und Wiederherstellung testen | Teilweise, vollständige Abnahme offen | 4/4 synthetische logische Restore-Prüfungen heute bestanden; aktuelle Liste mit acht COMPLETED-Backups nach Anmeldung geprüft; echter physischer Backup-Restore und unabhängige Storage-Sicherung fehlen |
| Datenschutzunterlagen, Hosting und AVV prüfen/dokumentieren | Technisch und dokumentarisch nachgeprüft | Primäranbieterquellen aktualisiert, neue Supabase-Unterauftragsverarbeiterliste berücksichtigt, IONOS-Rohlogfrist geklärt; keine neue vertragliche Zustimmung oder Kundenunterschrift behauptet |
| Datenexport und Vertragsende festlegen | Ablauf vorbereitet | Kunden-Betriebspaket definiert Umfang, sichere Übergabe, Abruffrist, Weisung, Löschfreigaben und verbleibende Backupfristen; vollständiger Betreiberexport muss beim konkreten Vertragsende praktisch abgenommen werden |
| Einführung, Hilfe und Support vorbereiten | Vorbereitet und Hilfe geprüft | Kundenblatt, Einführungsabnahme, Prioritäten und sichere Supportaufnahme; 258 Hilfeartikel/22 Kategorien auf vier Browseransichten geprüft; Vertretung/Servicezeiten noch zu benennen |

**Punkt 6 insgesamt bleibt offen**, bis die unten genannten Betriebsabnahmen vorliegen. Erfolgreiche technische Tests sind keine vollständige DSGVO-Zertifizierung und keine Zusage einer lückenlosen Prüfung aller Datenpfade.

## Durchgeführte Prüfungen

- Alle öffentlichen Tabellen haben RLS aktiviert. Beide Storage-Buckets sind privat.
- Der Security Advisor meldet 40 Warnungen für bewusst authentifiziert ausführbare SECURITY-DEFINER-RPCs und 30 Hinweise für RLS-Tabellen ohne Policies. Die RPCs stimmen mit der aktualisierten Allowlist überein; der Live-Verifier liefert keine Abweichung. Kein direkter Lesegrant für `anon`/`authenticated` auf den privaten Tabellen ohne Policies. Die drei öffentlichen QR-Internaltabellen ohne Policies bleiben durch RLS standardmäßig gesperrt. Die Meldungen werden nicht durch Abschalten von Schutzmaßnahmen versteckt.
- Der ältere Fremdmandantentest musste für neue Dienstregeltrigger einen berechtigten synthetischen Fixture-Akteur setzen. Außerdem werden `request.jwt.claim.sub` und `request.jwt.claims` bei jedem Akteurwechsel konsistent gesetzt. Ergänzt: `manager_central_time_entries`; nun 40/40 bestanden. Bei fehlgeschlagenem pgTAP-Test wird zusätzlich ein SQL-Fehler ausgelöst.
- `supabase/tests/security_operations_acceptance.sql`: 13 Live-Prüfungen bestanden; Änderungen an Dienst, Zeit und Regeln erzeugen Belege; Auditänderung/-löschung, Mitarbeiter-/Fremdmandantenzugriff und sensibler Bericht ohne MFA abgewehrt. Ausschließlich generierte `.invalid`-Konten und fiktive Mandanten; gesamte Transaktion zurückgerollt.
- `supabase/tests/privacy_logical_restore_test.sql`: 4/4 bestanden, synthetischer Datensatz exportiert, entfernt und identisch zurückgeschrieben, gesamte Transaktion zurückgerollt. Das ist ein logischer Datensatztest innerhalb derselben Datenbank, kein vollständiger Katastrophen-/Tagesbackup-Restore.
- Gezielte aktuelle Sicherheitssuite: **111 Tests bestanden, 0 fehlgeschlagen**. IONOS-Prüfung: 5/5 bestanden. Statischer Build erfolgreich, 11.996.536 Bytes. Überschneidende frühere Gruppen werden nicht addiert. Vollständige Regression: **1.470/1.470 Tests bestanden**, 0 fehlgeschlagen.
- Hilfe-Browserprüfung: Desktop dunkel/hell, Mobil 390 Pixel, Mobil 320 Pixel mit großer Schrift; Kategorien, Suche, Anleitungen, Tastatur und Seitenbreite bestanden.
- Live-Healthcheck auf der Produktionsadresse: 5/5 HTTP-200-Prüfungen für Startseite samt Sicherheitsheadern, Manifest, Service Worker, Datenschutzseite und Supabase-Auth-Health. Das ist eine Stichprobe, keine Verfügbarkeitsgarantie. Der isolierte Negativtest gegen einen nicht erreichbaren lokalen Endpunkt erkannte den Ausfall und lieferte den erwarteten Fehlerstatus.
- 11 aktive Datenbankzeitpläne; in den letzten 24 Stunden zum Prüfabfragezeitpunkt keine fehlgeschlagenen Cronläufe. Hintergrund- und Benachrichtigungsprozesse wurden nicht künstlich ausgelöst.

## Tatsächlicher Sicherungsbestand und Restoregrenzen

Der produktive Bucket `personnel-documents` und die zugehörigen Dokumentmetadaten sind leer. `audit-archives` enthält **31 Objekte / 5.919.293 Bytes**. Acht Archivübertragungen sind READY, vier historische Löschübertragungen DELETED. Die Storage-Ablage im Produktionsprojekt ist kein unabhängiges Vollbackup.

Nach der vom Betreiber durchgeführten Anmeldung wurde die aktuelle Backupverwaltung am 28.10.2026 lesend geprüft. Das Dashboard identifiziert `Security_Plattform PRO`, `SchichtFunk`, `main PRODUCTION`. Die Ansicht „Restore to new project“ zeigt alle folgenden acht physischen Sicherungen als **COMPLETED**. Das neueste Backup vom 28.10.2026 um 01:48:59 UTC entspricht **02:48:59 Uhr Europe/Berlin**. Damit ist der bisher fehlende aktuelle kontobezogene Backupnachweis erbracht; ein Restore wurde nicht gestartet.

| Sicherungszeit UTC | Status |
|---|---|
| 28.10.2026 01:48:59 | COMPLETED |
| 27.10.2026 01:49:05 | COMPLETED |
| 26.10.2026 01:50:08 | COMPLETED |
| 25.10.2026 01:50:01 | COMPLETED |
| 24.10.2026 01:50:33 | COMPLETED |
| 23.10.2026 01:48:24 | COMPLETED |
| 22.10.2026 03:43:36 | COMPLETED |
| 21.10.2026 01:59:20 | COMPLETED |

Das ist eine Bestandsaufnahme, keine Garantie künftiger Sicherungen oder einer gemessenen Wiederherstellbarkeit. Datenbankbackups enthalten laut derselben Dashboardansicht keine Storage-Dateiinhalte. Physischer Restore und unabhängige Dateisicherung bleiben offen.

Die frühere pauschale Einstufung von „Restore to a New Project“ als isoliert wurde korrigiert: Ein physischer Klon übernimmt auch die Vault-Verschlüsselungswurzel und kann kopierte Cron-/Netzwerkjobs sofort ausführen. Vorheriges Ausschließen/Anhalten im Klon bietet dieser Weg nicht. Ein Zielprojekt erst nach seiner Erstellung zu pausieren reicht daher nicht als Schutz vor Doppelversand oder Zugriffen auf Produktionsdienste.

Vor einer physischen Übung sind ein bestätigter Anbieterweg mit Ausführungssperre oder ein kontrolliertes Wartungsfenster mit bereits vor dem Snapshot stillgelegten Integrationen, ein aktuelles Kostenangebot und die erforderlichen Zugänge festzulegen. Kein Restore überschreibt zu Testzwecken die Produktion. Zunächst kann eine logische Gesamtrücksicherung ohne Jobs/Secrets in eine Umgebung ohne ausgehenden Netzwerkzugriff geprüft werden; auch sie muss tatsächlich durchgeführt und gemessen werden und ersetzt keinen physischen Nachweis.

Abnahmeprotokoll: Backupzeit und -ID, Start/Ende, gemessene RPO/RTO, isoliertes Ziel, Schema/Grants/RLS/Auth-Verknüpfungen, Datenzählung/Stichproben, separate Datei-Hashes, nachgezogene Löschweisungen, Erreichbarkeit der Quelle und bestätigte Bereinigung der Testumgebung. Zielwerte RPO 24 Stunden und RTO 8 Stunden bleiben Ziele bis zur Messung.

## Hosting-/Datenschutz-Nachprüfung

- IONOS Deploy Now ist die aktive statische Produktionsauslieferung. Die Produktdokumentation bestätigt einen lesenden Deployment Viewer und Rohlogs im `logs`-Verzeichnis mit **höchstens 30 Tagen** Aufbewahrung. Die vorherige Prüflücke ist damit für Verfügbarkeit/Zugang/Frist geklärt; IP-Kürzung und automatischer Logexport sind dort nicht bestätigt. Die öffentliche Datenschutzerklärung ergänzt die dokumentierte Frist. Kein Rohlog mit Besucherdaten wurde heruntergeladen.
- Die IONOS-Hilfe bestätigt weiterhin AVV-Einbeziehung in die AGB seit 19.07.2022. Der historische Vertragsnachweis für den Vertrag von September 2026 bleibt im Nachweisregister; der Kontovertrag wurde heute nicht erneut eingesehen.
- Supabase-DPA weiterhin Version 1 vom 01.08.2026. Die aktuelle Unterauftragsverarbeiterliste ist **12.10.2026**, die alte Juni-Liste ist historisch. Die neue Liste enthält unter anderem Hosting-, Support-, Monitoring- und weitere Plattformdienste. Ihre Aufnahme bedeutet nicht, dass SchichtFunk Beschäftigtendaten direkt an jeden gelisteten Dienst übermittelt. Frankfurt beschreibt die primären Projektdaten; Support-/Betriebsverarbeitung und Drittlandgarantien sind gesondert zu berücksichtigen. Ein Abonnement für Änderungsmitteilungen wurde nicht ohne Betreiberauftrag eingerichtet.
- Vercel-DPA umfasst Pro/Enterprise; Hobby ist laut aktuellen Nutzungsbedingungen auf persönliche/nicht kommerzielle Nutzung begrenzt. Der historische Hobby-Rückfall ist weiterhin nicht als kommerzieller Produktivweg freigegeben; kein Tarifwechsel wurde vorgenommen.
- Kunden-AVV, TOM, VVT, Löschkonzept und DSFA-Vorlage sind vorhanden. Konkrete Kundenangaben, verantwortliche Kontakte, Fristen und erforderliche Vereinbarungen müssen vor dem jeweiligen Kundenstart vervollständigt werden.

## Umsetzung und Reproduktion

Der Healthcheck prüfte bisher die IONOS-Vorschauadresse. Skriptstandard und Workflow werden auf `https://schichtfunk.de` korrigiert. Die Workflowkorrektur muss auch nach `main`, weil GitHub Zeitpläne auf dem Standardzweig ausführt. Ein grüner manueller Lauf alleine beweist keine personell überwachte Alarmbereitschaft.

Gezielte lokale Prüfung: `npm run test:security`. Die drei oben genannten SQL-Dateien sind zusätzlich gegen das aktuelle Supabase-Schema ausgeführt worden. Sie enthalten ausschließlich synthetische Transaktionen und enden mit ROLLBACK. Release-Prüfung: Gesamtsuite, IONOS-Prüfung und statischer Build.

Einführung/Support/Rückgabe: `customer-operations-pack-2026-10-28.md`. Die historischen Betriebsunterlagen verweisen auf diesen aktuellen Stand, damit alte offene Angaben oder alte Bestandszahlen nicht als heutige Tatsachen verwendet werden.

## Noch für die vollständige Abnahme erforderlich

1. Den vollständigen isolierten Wiederherstellungsweg mit gemessenen Zeiten durchführen. Die Dashboard-Anmeldung und die aktuelle Backup-Liste sind inzwischen erfolgreich geprüft. Offen bleibt ein vorab sicher isolierter Restoreweg; gegebenenfalls ist ein aktuelles Kostenangebot zu bestätigen.
2. Unabhängiges Backupziel für **alle** Storage-Dateien auswählen/freigeben, AVV/Region/Aufbewahrung/Zugang festhalten; täglichen Export, Fehleralarm und echte Rücksicherung einrichten/abnehmen. Kein vorhandenes Ziel oder Konto wurde erfunden; GitHub ist kein Personaldatei-Backupziel.
3. Erreichbare Betriebs-/Datenschutzvertretung und tatsächlich betreute Supportzeiten festlegen. Vor externem Echtkundenstart zusätzlich das konkrete Kundenblatt und die Vereinbarungen ausfüllen.

## Primärquellen, nachgeprüft 28.10.2026

- IONOS Deploy-Now-Logs: https://docs.ionos.space/docs/deployment-viewer/
- IONOS AVV-Einbeziehung: https://www.ionos.de/hilfe/datenschutz/allgemeine-informationen-zur-datenschutz-grundverordnung-dsgvo/vereinbarung-zur-auftragsverarbeitung-avv-mit-ionos-abschliessen/
- Supabase DPA: https://supabase.com/legal/customer-resources/data-processing-addendum
- Aktuelle Unterauftragsverarbeiter: https://supabase.com/legal/subprocessor-list/October-12-2026.pdf
- Datenresidenz/Transfers: https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq
- Backupumfang/Fristen: https://supabase.com/docs/guides/platform/backups
- Physischer Klon und sofort startende Integrationen: https://supabase.com/docs/guides/platform/clone-project
- Vercel DPA/Tarifgrenzen: https://vercel.com/legal/dpa und https://vercel.com/legal/terms
- DSGVO Art. 28/32/33: https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679

## Veröffentlichungsnachweis

Die Implementierung wurde mit PR #207 in `codex/ionos-migration` zusammengeführt, Commit `3e4e2191e4c72e83ef2bec4939c906cf24eee359`. Der IONOS-Buildlauf `40770917745` einschließlich Browser-/Exportprüfung und Deployment-Auslösung ist erfolgreich abgeschlossen. Die Monitoring-Korrektur auf `main` ist über PR #206 integriert; der produktive Healthcheck-Lauf `40770917595` ist erfolgreich.
