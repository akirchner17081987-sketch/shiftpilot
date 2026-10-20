# Zusammenführung von Sicherung und Bereinigung – 20.10.2026

## Bereits aktiv
Der vorhandene Zeitplan `schichtfunk-background-planning-retention` (Job 5, unverändert 03:35 UTC) wurde enger gefasst. Er berücksichtigt nur FAILED, CANCELLED und APPLIED nach 30 Tagen seit der jüngsten Erstellung, Fertigstellung oder Änderung. SUCCEEDED-Ergebnisse ohne Übernahme werden nicht mehr nach sieben Tagen gelöscht. Es wurden keine Daten gelöscht und keine zusätzlichen Zeitpläne angelegt.

Die sieben SQL-Prüffälle in `database/tests/planning-retention-policy.sql` wurden direkt gegen PostgreSQL ausgeführt. Danach waren alle 34 Planungsläufe weiterhin vorhanden; drei ältere SUCCEEDED-Ergebnisse sind vor der bisherigen Sieben-Tage-Regel geschützt. Die Gesamtzahl der Cron-Zeitpläne blieb sieben.

## Noch nicht umgesetzt
- Die vollständige Datenbanksicherung einschließlich Wiederherstellungsprobe muss als Voraussetzung für zusätzliche Bereinigungen verifiziert werden.
- Die vorhandenen Audit-Wochenarchive liegen weiterhin in privaten Datenbanktabellen. Auslagerung in einen privaten Dateispeicher, Rücklesen/Prüfsummenprüfung und anschließendes Entfernen der Datenbank-Archivkopie stehen noch aus.
- Das Ziel bleibt ein Wochenarchiv je Unternehmen und Kalenderwoche. Ein Download eines vorhandenen Archivs darf keine weitere serverseitige Sicherung erzeugen.
- Die aktive Audit-Tabelle soll nach bestätigter Auslagerung 30 Tage enthalten. Erfolgreiche Systemlaufprotokolle sollen sieben Tage, Fehlerprotokolle 30 Tage behalten werden.
- Beim Prüflauf waren 59.177 erfolgreiche Systemlaufprotokolle älter als sieben Tage. Sie wurden nicht gelöscht.
- Der vorhandene Audit-Wochenzeitplan und der vorhandene Bereinigungszeitplan sollen weiterverwendet werden.

## Aktuelle Grenze
Die lokale Ausführungs-/Testumgebung ist nicht verfügbar. Datenbankverbindung und GitHub-Zugriff funktionieren. Die weitergehende Codeumstellung und der vollständige Sicherungs-/Wiederherstellungstest wurden daher nicht als abgeschlossen markiert. Der bereits veröffentlichte Audit-Export/Import bleibt unverändert verfügbar.
