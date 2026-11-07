# Mehrunternehmen: Vorbereitung für IONOS

Status: Arbeits- und Prüfstand, keine Ausführungsvorlage und keine Produktionsfreigabe.

## Nachgewiesen am 07.11.2026

- Der IONOS-Zweig `codex/ionos-migration` war beim GitHub-Abgleich Vorfahr des Migrationsarbeitszweigs. Vor der Veröffentlichung erneut den tatsächlich bereitgestellten Quellstand und die aktuellen Zweigspitzen vergleichen.
- Im Supabase-Dashboard waren am 07.11.2026 tägliche Produktionssicherungen sichtbar, zuletzt vom 06.11.2026 02:49 Uhr Europe/Berlin. Point-in-Time-Recovery war nicht aktiviert; Speicherobjekte sind laut Dashboard nicht Bestandteil der Datenbanksicherungen. Dies belegt weder einen unmittelbar aktuellen Sicherungspunkt noch eine getestete Wiederherstellung.
- `production-preflight-readonly.sql` liefert in einer einzelnen schreibfreien Abfrage aggregierte Konten-/Profilzahlen, Indexdefinitionen, die letzten Migrationsversionen und ausgewählte Funktionsfingerabdrücke. Die Vergleichswerte stehen in `production-preflight-baseline-20261107.json`; sie ersetzen nicht den vollständigen Schema- und Sicherheitsabgleich.
- Produktion hat den globalen eindeutigen Index `employees_auth_user_id_uidx`; im isolierten Testzweig ist stattdessen der unternehmensbezogene Index aktiv. Ein Lesecheck in Produktion fand keine doppelten `(company_id, auth_user_id)`-Paare, auch nicht bei gelöschten Profilen. Diese Momentaufnahme muss unmittelbar vor der Migration wiederholt werden.
- Echte Testeinladung, E-Mail-Bestätigung, 2FA und Wechsel zwischen zwei Mitarbeiterprofilen und Teamleiterrolle wurden auf dem isolierten Zweig und Testportal ausgeführt.
- Ersatzangebote und tatsächliche Übernahme wurden in beiden Unternehmen unter `authenticated` in einer zurückgerollten Transaktion geprüft; auch die Portalannahme wurde in beiden Unternehmen mit fiktiven Angeboten ausgelöst und die korrekte Zuordnung in der Testdatenbank bestätigt. Der Rückrolltest mit erforderlicher Betriebsratsfreigabe prüfte in beiden Unternehmen das Warten auf Freigabe. Details: `productionlike-test-status.md`.

## Vor Freigabe offen

1. Die Kandidaten in einer finalen, versionierten Migration mit festgelegter Reihenfolge und eindeutiger letzter Definition je Funktion zusammenführen. Sie auf einer sauberen, nach aktuellem Produktivstand eingerichteten Testdatenbank in einem Durchlauf ausführen; Testmigrationen und manuelle Zwischenschritte sind keine Produktionsmigration.
2. Bestehende Einzelprofile, Einladungen erneuern/zurückziehen, Widerruf, parallele Sitzungen, Ist-Zeiten, Abwesenheit, Diensttausch und Marktplatz sowie QR gemeinsam mit dem endgültigen Paket prüfen. Nicht bereits erfolgreich geprüfte Einzelszenarien mit einer vollständigen Gesamtprüfung gleichsetzen.
3. Produktivdefinitionen, Rechte, Indizes, doppelte Zuordnungen und Migrationen unmittelbar vor der Freigabe erneut prüfen. Eine geprüfte Datenbanksicherung und eine realistische Wiederherstellung der betroffenen Funktionen und der IONOS-Dateien bereitstellen.
4. Rückfallstrategie für bereits angelegte Mehrfachprofile festlegen: Der alte globale Index kann nicht wieder erstellt werden, solange mehrere Profile dasselbe Konto verwenden. Keine automatische Löschung oder Entkoppelung von Mitarbeiterdaten.
5. Den finalen IONOS-Build und die passende Einladungsfunktion gemeinsam kontrolliert bereitstellen. Nach Übernahme Anmeldung, alte Konten, einzelne und gemeinsame Testeinladung sowie Unternehmens- und Rollenwechsel prüfen. Feature-Schalter erst nach vollständiger Abhängigkeiten- und Freigabeprüfung aktivieren.

Ein produktiver Schreibvorgang, ein Versand an echte Mitarbeitende und eine Bereitstellung sind hiermit nicht dokumentiert.
