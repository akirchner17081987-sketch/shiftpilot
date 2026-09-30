# Unternehmensauswahl und autorisierte Unternehmenskopie

Stand: 30.09.2026. Unternehmenskopie ausgeführt; Auswahl auf main für die Rückfallseite und auf codex/ionos-migration für IONOS veröffentlicht.

Der Pfeil neben dem Unternehmensnamen öffnet die aktiven Teamzugehörigkeiten des angemeldeten Kontos. Die Auswahl zeigt Name, Rolle und das aktuell geöffnete Unternehmen. Ohne ausdrückliche Auswahl wird die älteste aktive Zugehörigkeit geöffnet. Die Auswahl wird pro Benutzer und Browser-Tab gespeichert und bei jedem Wechsel gegen die Datenbank geprüft.

Der Wechsel schließt ausstehende Synchronisierung ab und lädt anschließend alle Module neu. Laufende Synchronisierung oder ein Speicherfehler verhindert den Wechsel. Unternehmensbezogene lokale Einstellungen werden getrennt gespeichert; historische unzugeordnete Browserdaten werden bei mehreren Mitgliedschaften nicht in ein anderes Unternehmen importiert.

## Kopie

Auf ausdrücklichen Betreiberwunsch wurde „SchichtFunk – Unternehmen 2“ aus „SchichtFunk“ erstellt. Beide Unternehmen haben eigene Datensatz-IDs. Die vorhandenen aktiven Unternehmenszugehörigkeiten und Rollen wurden übernommen. Eine Transaktion kopiert und prüft die Werte jedes eingefügten Datensatzes sowie die Tabellenanzahlen und interne Zuordnung. Zwei vollständige Probeläufe wurden zurückgerollt, anschließend wurde die Kopie dauerhaft gespeichert. Quelle und fiktiver Abnahmemandant wurden nicht verändert.

Kopiert wurden 28 Mitarbeiter, 566 Schichten, 417 Zeiteinträge, 22 Abwesenheiten, 12 Schichtarten, SOLL-Werte, Veröffentlichungen, Änderungsanträge und Freigaben, Tauschanträge, Qualifikationen, DATEV-Regeln und Einstellungen, Zeitkontoeinstellungen und Monatsabschluss, Aufbewahrungsprofile und historische Läufe, unabhängige QR-Schichten mit Pausen/Ereignissen sowie die Audit-Historie.

Die drei QR-Terminals besitzen neue, getrennte Tokens und Vault-Einträge. Die sieben vorhandenen Mitarbeiter-Login-Verknüpfungen bleiben beim Original; die Anwendung erlaubt aktuell nur einen Mitarbeiterdatensatz pro Login. Mitarbeiterzugänge müssen in der Kopie neu eingerichtet werden. Historische Einladungen wurden mit unbrauchbaren neuen Tokens und abgelaufenem Ablaufdatum übernommen. Es wurden keine Einladungen oder Push-Nachrichten versendet. Browser-Pushregistrierungen und laufende QR-Anmeldesitzungen wurden nicht kopiert.

52 historische Benachrichtigungen und vier historische authentifizierte QR-Stempel wurden vollständig als Audit-Archivdatensätze übernommen, damit keine neuen Benachrichtigungen entstehen und keine QR-Identitätsprüfung umgangen wird. Ein alter bereits angewandter Änderungsantrag ohne tatsächliche Änderung wird von der aktuellen Einfügeprüfung abgelehnt: seine vollständigen ursprünglichen Snapshots liegen im Audit-Archiv; beim kopierten angewandten Antrag ist old_snapshot leer. Neue Änderungsanträge unterliegen unverändert der heutigen Prüfung.

Unternehmensname und Zeitzone können unter Einstellungen → Unternehmen geändert werden. Rein lokale Browserpräferenzen gehören nicht zur Datenbankkopie.

## Validierung

- 301 automatisierte Prüfungen erfolgreich, darunter neun Prüfungen für Auswahl, Benutzerbindung, Rollen, gesperrte Zugänge, älteste Zugehörigkeit, Legacy-Import und Wechsel nach Synchronisierung.
- Statischer Build, IONOS-Checks, JavaScript-Syntax und Git-Diff geprüft.
- Nach der Kopie RLS-Zugriff als bestehender Inhaber geprüft: beide Unternehmen sichtbar; alle 28 Mitarbeiter, 566 Schichten und 417 Zeiteinträge im zweiten Unternehmen verfügbar.
- Eingeschränkten Zeiterfassungszugang geprüft: beide aktiven Zugehörigkeiten und Unternehmensname über time_access_context verfügbar.
- Lokaler Browser-Praxistest blockiert: Browserprozesse dürfen in der Ausführungsumgebung keine erforderlichen Sockets öffnen. Ein vollständiger angemeldeter Browserwechsel wurde deshalb nicht bestätigt.

Das beigefügte SQL dokumentiert die einmalige Kopieroperation und ist standardmäßig ein Probelauf mit ROLLBACK. Vor erneuter Nutzung müssen Quell- und Inhaber-UUID eingesetzt und der gesamte aktuelle Datenumfang erneut geprüft werden. Es ist keine automatisch ausführbare Datenbankmigration.

Der IONOS-Produktionszweig ist codex/ionos-migration; main ist bei IONOS bewusst nicht für Deployments aktiviert. Die vorhandenen unterschiedlichen Zeitraum-Auswahlen in index.html wurden beim Übertragen erhalten. Der alte Einbindungsworkflow erkennt jetzt auch versionierte Script-URLs und prüft die Syntax des aktuellen Modul-Loaders anstelle entfernter historischer Bezeichner.
