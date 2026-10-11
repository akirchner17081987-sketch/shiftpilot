# Personalakten-MFA und Schutz von Abwesenheitsgründen

Stand: 11. Oktober 2026. Implementiert und lokal geprüft; nicht produktiv aktiviert.
Basis: `codex/ionos-migration`, Commit `91377d6677301e90aa8ef9ab9e2a3076d73e6bd1`.

## Berechtigungen nach Aktivierung

| Zugang | Personalakten/Dateien | Abwesenheiten anderer Mitarbeiter | Bearbeitung/Genehmigung |
|---|---|---|---|
| Inhaber/Administrator, ohne MFA (AAL1) | Gesperrt; MFA erforderlich | Gründe und Freitext gesperrt | Gesperrt |
| Inhaber/Administrator, mit MFA (AAL2) | Freigegeben innerhalb des eigenen Unternehmens | Vollständige Abwesenheitsdetails | Freigegeben |
| Teamleitung/Planung | Gesperrt, auch mit MFA | Nur bestätigte Nichtverfügbarkeit; Grund „Abwesend“, keine Kommentare | Personalverwaltung erforderlich |
| Mitarbeiter | Keine Verwaltungs-Personalakte | Nur die eigenen Abwesenheitsanträge und Rückmeldungen | Eigene Anträge stellen |
| Gesperrter Zugang/fremdes Unternehmen | Gesperrt | Gesperrt | Gesperrt |

Die vorhandenen vertrauenswürdigen Datenbankrollen OWNER/ADMIN bilden die Personalverwaltung. Es wird keine neue Rolle eingeführt. Sollten Administratoren ohne Personalverantwortung existieren, muss deren Rolle vor der Freigabe enger gefasst werden. Benutzer-Metadaten und zusätzliche Planungs-/Zeitrechte erteilen keine Personalberechtigung.

## Implementierte Kontrollen

- Die erstmalige MFA-Einrichtung funktioniert auch vor Abschluss der Anmeldung: geschützte Anfragen warten auf die bestätigte Einrichtung und werden danach einmal fortgesetzt. Abbruch/Abmeldung führt zu keiner Wiederholung; parallele Anfragen teilen dieselbe Einrichtung.
- Alle acht Personalakten-RPCs aus Rollout-Stufe 3 werden aktiviert. Ihre gemeinsame serverseitige Berechtigungsprüfung verlangt zusätzlich AAL2, auch ohne den PostgREST-Vorfilter.
- Der private Dokumentenspeicher prüft Unternehmen, Mitarbeiterzuordnung, aktive Personalberechtigung und AAL2 unabhängig vom Frontend. Bereits ausgestellte signierte Downloadlinks bleiben bis zum Ablauf ihrer bestehenden Gültigkeit von 120 Sekunden nutzbar.
- Restriktive RLS schützt vollständige Abwesenheitsdatensätze, Audit-Details und gespeicherte Monats-Snapshots. Mitarbeiter können weiterhin ihre eigenen Datensätze lesen.
- `manager_absence_overview` prüft die aktive Mitgliedschaft und liefert für Teamleitungen ausschließlich bestätigte, neutrale Verfügbarkeitsdaten. Es gibt keinen Rückfall auf die Rohdatentabelle.
- Frontend-Synchronisierung schreibt und löscht Abwesenheiten nur für OWNER/ADMIN. Dadurch überschreibt eine Teamleitung keine echten Gründe mit redigierten Daten.
- Die serverseitige Schichtprüfung erkennt bestätigte Abwesenheiten weiterhin, ohne deren Grund auszugeben.
- Antragsentscheidungen und Abwesenheitsimporte verlangen Personalrechte und MFA. Gesperrte oder gelöschte Mitarbeiterkonten dürfen keine neuen Anträge erstellen.
- Tages-/Monatsberichte, archivierte Berichte und die ältere v2-Berichts-API werden rollenabhängig redigiert. Monatsabschlüsse/-wiedereröffnungen verlangen MFA.
- Neue Benachrichtigungen und bestehende gespeicherte Vorschautexte enthalten keine Abwesenheitsart oder medizinischen Kommentare. Die Details verbleiben im geschützten Mitarbeiter-/Personalbereich. Bereits zugestellte Push-Nachrichten oder heruntergeladene Dateien lassen sich dadurch nicht zurückholen.

## Prüfnachweise

Die Tests verwenden ausschließlich fiktive Daten in einer isolierten PostgreSQL-Engine (PGlite, Version 0.5.8). Keine produktiven Mitarbeiterdaten wurden für die Tests gelesen oder geändert.

- `npm test`: **703 Tests bestanden**, einschließlich 16 SQL-Tests und drei Prüfungen der Client-Synchronisierung.
- `npm run test:personnel-privacy`: negative und positive Aufrufe aller acht RPCs, AAL1/AAL2, gefälschte Benutzer-Metadaten, fremde Unternehmen, gesperrte Mitgliedschaft, Dokumentenspeicher, RLS, Planungsdaten, Antragsentscheidungen, archivierte Berichte und Benachrichtigungen.
- `npm run test:personnel-privacy:browser`: tatsächlicher Abwesenheitsbereich auf Desktop und Mobilgerät; neutrale Planungssicht, geschützte Details, erhaltene Konflikterkennung und Personalaktionen.
- `node tests/browser/employee-absences-qa.cjs`: Mitarbeiterportal mit Formularen, eigenen Krankmeldungen, Rückmeldungen, Mandanten-/Benutzerwechsel und XSS-Prüfung; sechs Desktop-/Mobilvarianten einschließlich der vollständigen App.
- `node tests/browser/personnel-mfa-enrollment-qa.cjs`: erste Einrichtung während der Anmeldung, ungültiger Code, parallele geschützte Anfragen und Abbruch/Abmeldung mit fiktiven Auth-Antworten.
- `npm run build`, `npm run test:ionos`, `npm run test:login-gate`: statischer Build und bestehende Hosting-/Login-Prüfungen.

Die Datei `personnel-health-privacy-preview.html` zeigt die tatsächliche Abwesenheitsoberfläche mit fiktiven Beispieldaten und einem Rollenwechsel. Sie hat keine Verbindung zur produktiven Datenbank und stellt keine echte MFA-Anmeldung dar.

## Produktivfreigabe und Reihenfolge

Die bestehende Vorgabe „Vorschau prüfen, dann ausdrücklich freigeben“ gilt für die Aktivierung. Ein Entwurf-PR und eine lokale Rollen-Vorschau sind vorbereitet. Der Punkt ist erst nach erfolgreicher Produktivaktivierung als erledigt nachgewiesen.

Nach Freigabe:

1. Sicherstellen, dass verantwortliche OWNER/ADMIN einen verifizierten MFA-Faktor nutzen können. Die vorhandene MFA-Einrichtung/Challenge bleibt zuständig.
2. Migration `20261011214719_personnel_mfa_health_privacy.sql` im Supabase-Projekt SchichtFunk über `apply_migration` anwenden. Das SQL läuft in einer Transaktion; bei Fehlern erfolgt keine Teilaktivierung.
3. Den geprüften Frontend-Stand auf dem IONOS-Produktionszweig und dem Vercel-Backup ausrollen. Alte Frontends können nach der Migration keine Abwesenheitsgründe mehr für Teamleitungen lesen; das passende Frontend ist für die neutrale Planungssicht erforderlich.
4. Live kontrollieren: acht aktivierte Stufe-3-Einträge, Vorfilter-Konfiguration, RLS/Storage und Supabase-Security-Advisors. Danach mit echten eigenen Testkonten die MFA-Challenge und die Rollen prüfen, ohne Mitarbeiterdaten zu exportieren.
5. Migrationseintrag, Commit, Deployment-IDs, Prüfergebnisse und Zeitpunkt als Aktivierungsnachweis archivieren.

Kein Produktiv-Deployment, keine produktive Migration und keine Änderung bestehender Benutzerrollen wurden für diese Vorbereitung ausgeführt. Weitere offene Audit-Punkte bleiben eigenständig zu bearbeiten.
