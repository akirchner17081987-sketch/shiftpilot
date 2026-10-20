# Audit-Wochenarchive und Wiederherstellung

Die Audit-Ansicht bietet unter **Wochenarchive & Wiederherstellung** getrennte vollständige Sicherungen je Unternehmen. Der aktive Datenbankzeitplan `schichtfunk-weekly-audit-archives` sichert die abgeschlossene Berliner Kalenderwoche am Montag um 03:00 Uhr. Zwei UTC-Kandidaten und eine lokale Zeitprüfung berücksichtigen Sommer-/Winterzeit; ein eindeutiger Wochenindex verhindert doppelte Archive. Der erste reguläre Lauf ist am 26.10.2026. Eine Anfangssicherung für die drei Secontec-Unternehmen wurde am 20.10. angelegt.

**Herunterladen** speichert ein vorhandenes Archiv als JSON-Datei. **Zeitraum als Sicherung exportieren** erstellt ein vollständiges Archiv aller Aktionen im gewählten Zeitraum; die feineren Such-/Bereichs-/Bearbeiterfilter bleiben ausschließlich Prüfberichten (CSV/PDF) vorbehalten. Der Download lädt alle Archivpakete vor dem Speichern.

**Sicherung importieren** prüft die gesamte Datei paketweise. Erst die anschließende Schaltfläche stellt fehlende Einträge wieder her. Unveränderte Original-IDs, Zeitpunkte, Rollen, Vorher-/Nachher-Daten und Metadaten bleiben erhalten. Identische IDs werden übersprungen; unterschiedliche Inhalte derselben ID sowie gelöschte Auth-Benutzer sperren das betreffende Paket. Vorhandene Audit-Einträge werden nie überschrieben. Die unveränderbaren Originaldaten werden nach der normalen Metadatenanreicherung aus einem privaten Transaktionskontext übernommen, der anschließend entfernt wird. Jeder erfolgreiche Importteil wird separat protokolliert.

Ein Import erfolgt in Transaktionen von maximal 250 Ereignissen. Nach einem Verbindungsabbruch können bereits abgeschlossene Pakete vorhanden sein; die Oberfläche meldet dies und erlaubt das Fortsetzen durch erneutes Auswählen derselben Datei. Vorprüfung und Ausführung prüfen beide die serverseitige HMAC-Signatur des Manifests, die SHA-256-Prüfsumme jedes Pakets, die Unternehmenszugehörigkeit sowie die aktuelle Administrator-/Inhaberberechtigung mit AAL2. Paketdaten werden als opaker JSON-Text transportiert, damit JavaScript keine großen Ganzzahlen oder Zeitstempel verändert.

Die Sicherungen liegen in privaten, mit RLS und explizitem Rechteentzug geschützten Datenbanktabellen, getrennt vom interaktiven Audit-Verlauf. Direkter Tabellenzugriff und interne Erstellungs-/Importhelfer sind für Anwendungsrollen gesperrt. Nur die autorisierte API vermittelt den Zugriff. Die öffentliche RPC ist `SECURITY INVOKER`; die privilegierte Implementierung liegt im nicht exponierten privaten Schema. Der Security Advisor meldet für diese absichtlich ausschließlich intern verwalteten Tabellen nur den bekannten Informationshinweis „RLS Enabled No Policy“.

Personallöschungen und Audit-Anonymisierungen ändern eine unternehmensbezogene Wiederherstellungsgeneration. Lokale Dateien aus einer älteren Generation dürfen keine gelöschten Personaldaten zurückbringen; der Wiederimport wird deshalb vorsorglich vollständig gesperrt. Bestehende Datenschutzbereinigungen können auch gespeicherte Archivpakete bereinigen; beschädigte Prüfsummen werden beim Download abgewiesen.

## Grenzen

- Die automatische Sicherung verschiebt oder löscht keine Live-Logs und reduziert daher deren Anzahl nicht. Die getrennten Archive werden nur bei geöffneter Archivfunktion geladen.
- Archive in derselben Datenbank sind kein unabhängiger vollständiger Datenbank-/Storage-Backup. Dafür dient die zusätzliche lokale JSON-Kopie nur für Audit-Ereignisse.
- Der Import unterstützt dieses signierte JSON-Format aus demselben SchichtFunk-System. CSV/PDF und die frühere vollständige Datenbanksicherung sind keine Importdateien dieses Moduls.
- Bei einem vollständigen Neuaufbau des Datenbankprojekts wird auch der private Signaturschlüssel aus dem Datenbankbackup benötigt. Er wird nicht an den Browser ausgegeben.
- Der Archivindex zeigt die neuesten 100 Archive; der Dateiimport ist auf 100 MB begrenzt. Größere Zeiträume getrennt sichern. Eine automatische Aufbewahrungs-/Löschregel für Archive wurde nicht aktiviert.
- Ein ausgefallener Wochenlauf ist im Supabase-Cron-Laufprotokoll erkennbar; dieses Modul enthält keine zusätzliche externe Alarmierung.

## Prüfung

- 13 neue SQL-/DOM-Prüfungen: 601 Ereignisse über drei Pakete, vollständiger Export, Präzision großer Ganzzahlen, Wiederherstellung fehlender Originale, Wiederholungsimport, Manipulation, Konflikte, Mandantenwechsel, MFA/Rollen, Datenschutzgeneration und beide Zeitumstellungen.
- Bestehende Audit-SQL-, Berechtigungs-, CSV-/PDF-Formatierungs- und Hilfeprüfungen sowie statischer IONOS-Build.
- Echte Datenbank: isolierte Testtransaktion mit synthetischem Unternehmen, Export, Vorprüfung und Duplikatimport; vollständig zurückgerollt, keine Testmandanten zurückgelassen.
- Browser-Screenshots konnten in dieser Ausführungsumgebung wegen gesperrter Prozess-Sockets nicht erstellt werden. Die DOM-Tests prüfen die echten Ereignisbehandlungen; sie ersetzen keine visuelle Browserabnahme.
