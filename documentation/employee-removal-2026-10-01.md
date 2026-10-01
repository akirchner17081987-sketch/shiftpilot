# Mitarbeiter aus der Verwaltung löschen

Im Mitarbeiterprofil unter „Übersicht“ öffnet „Mitarbeiter löschen“ eine unternehmensbezogene Vorschau. Der vollständige Name und ein separates Bestätigungshäkchen sind erforderlich. Abbrechen verändert keine Daten. Die Funktion gilt für aktive und inaktive Mitarbeiter beider Unternehmen; OWNER, ADMIN, PLANNER und DISPATCHER mit aktiver Unternehmensmitgliedschaft dürfen sie ausführen.

Die Vorschau zählt künftige Dienste ohne erfasste Zeiten und ohne abgeschlossenen Monat sowie künftig beginnende Abwesenheiten außerhalb abgeschlossener Monate. Bestätigtes Löschen storniert diese Dienste, entfernt diese Abwesenheiten und storniert offene Änderungsanträge des Mitarbeiters. Vergangene, laufende, bereits zeitlich erfasste oder durch einen Monatsabschluss geschützte Daten bleiben erhalten. Das Profil wird aus der Mitarbeiterverwaltung und dem Planungspool ausgeblendet, deaktiviert und vom Mitarbeiterzugang getrennt. Die historische Datenbankzeile bleibt für Zeitberichte, Abrechnung und referenzierte Nachweise bestehen. Der globale Benutzeraccount und dessen sonstige Unternehmensrollen werden nicht gelöscht.

Die Verarbeitung läuft atomar unter den Rechten des aufrufenden Benutzers. Namensbestätigung, Häkchen, Unternehmensrechte und ein Fingerabdruck der Vorschau werden auch serverseitig geprüft. Änderungen seit der Vorschau erfordern ein erneutes Öffnen. Während der Bestätigung verhindert die Oberfläche einen Unternehmenswechsel. Datenbankregeln verhindern neue Einplanungen, neue Abwesenheiten und eine Reaktivierung durch alte Browserstände; historische Daten können weiter nachvollzogen werden.

## Prüfung

- 315 automatisierte Node-Prüfungen und statischer Produktionsbuild erfolgreich.
- Datenbanktest mit ausschließlich fiktiven Mitarbeitern und vollständigem ROLLBACK in beiden Unternehmen: veröffentlichte und unveröffentlichte künftige Dienste, Abwesenheiten, offene Änderungsanträge, Namensbestätigung, Bestätigungshäkchen, veraltete Vorschau, fremdes Unternehmen, Zeitdaten, abgeschlossener Monat und Schutz gegen Reaktivierung.
- Nach dem ROLLBACK weiterhin je 28 tatsächliche Mitarbeiter; keine Mitarbeiter gelöscht und keine Testprofile vorhanden.
- Gezielte Browserprüfung der tatsächlichen Löschdialog-Komponente für Desktop und Mobilgeräte, beide Unternehmen, helles und dunkles Design, Abbrechen und veraltete Daten: `.github/workflows/employee-removal-checks.yml`.

Migrationen: `20260930235002_confirmed_employee_removal_v1.sql` und `20261001000225_removed_employee_history_guard.sql`. SQL-Prüfung: `tests/sql/employee-removal-rollback.sql` (nur für diese Testumgebung; privilegierte Einrichtung eines fiktiven Monatsabschlusses, alle eigentlichen Prüfungen als authenticated).
