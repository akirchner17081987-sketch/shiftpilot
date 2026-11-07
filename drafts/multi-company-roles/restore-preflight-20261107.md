# Wiederherstellungsprobe – Vorprüfung 07.11.2026

Status: Sicherungsbestand und Risiken geprüft; eine vollständige Wiederherstellung wurde nicht ausgeführt und ist nicht nachgewiesen.

## Beobachteter Sicherungsstand

Am 07.11.2026 zeigte die Supabase-Dashboard-Übersicht für das SchichtFunk-Produktivprojekt eine abgeschlossene physische Datenbanksicherung vom 07.11.2026 um 01:48:57 UTC (02:48:57 Uhr in Deutschland) sowie weitere ältere tägliche Sicherungen. Die Oberfläche weist darauf hin, dass Datenbank-Backups keine Storage-Dateiinhalte enthalten. Verfügbarkeit im Dashboard ist kein Nachweis, dass der Inhalt bereits separat erfolgreich wiederhergestellt wurde.

Die Produktionsdatenbank wurde ausschließlich lesend geprüft: elf Cron-Aufgaben waren aktiv; mindestens eine davon enthielt einen erkennbaren HTTP-Aufruf. Diese summarische Prüfung schließt weitere indirekte ausgehende Aktionen nicht aus. Laut Supabase können Cron- und andere externe Erweiterungen nach einer physischen Wiederherstellung in ein neues Projekt sofort laufen; sie lassen sich vor diesem Wiederherstellungstyp nicht einzeln ausschließen. Ein unkontrollierter physischer Klon ist daher kein geeigneter Testweg. Ein neues Projekt kann zudem zusätzliche Kosten verursachen.

## Nächste Schritte und Grenzen

Für eine tatsächliche Prüfung sind ein sicheres getrenntes Ziel, ein geeigneter Sicherungs- und Wiederherstellungsweg mit Schutz vor ausgehenden Aktionen, ein gesonderter Nachweis der Storage-Dateiinhalte sowie Prüfungen von Daten, Auth, Berechtigungen und Konfiguration erforderlich. Supabase beschreibt auch einen logischen Restore, bei dem extern wirkende Aufgaben vor ihrer Aktivierung geprüft werden können; bei diesem Weg ist die Handhabung des Verschlüsselungsschlüssels gesondert zu klären. Verfügbarkeit, Kosten, Zugriff und vollständiger Funktionsumfang des konkreten Zielwegs sind noch nicht nachgewiesen.

Die vorhandene Probe `logical-restore-probe-20261107.md` bleibt ein begrenzter fiktiver Teil-Restore. Weder eine physische Produktionssicherung noch eine vollständige Sicherung von Datenbank, Storage und Konfiguration wurde hier wiederhergestellt. Keine Restore-Aktion und keine produktive Änderung wurden durchgeführt.
