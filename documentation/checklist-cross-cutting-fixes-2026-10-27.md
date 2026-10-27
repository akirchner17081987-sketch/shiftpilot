# Abschlussprüfung der übergreifenden Funktionen – 27.10.2026

## Start und PWA

Der Loader prüft den tatsächlichen Abschluss vorhandener Script-Elemente. Neue Module werden parallel vorgeladen und in ihrer Abhängigkeitsreihenfolge ausgeführt. Ein fehlgeschlagenes dynamisches Script wird einmal erneut angefordert. Dauerhafte Fehler und Zeitüberschreitungen stoppen die Initialisierung; ein bereits abgelaufenes Script wird nicht doppelt eingefügt.

Ein früher statischer Ladefehler darf einmal innerhalb von fünf Minuten automatisch neu laden. Im aktiven Arbeitsbereich erfolgt kein automatisches Neuladen. Ein blockierter DOM-Start erhält nach 20 Sekunden eine sichtbare Wiederherstellung im Zugangsbereich. Nach einem unvollständigen Seitenstart beginnt keine Anmeldung.

Nachweise: Unit-Tests in `tests/startup-script-guard.test.cjs`, `tests/performance-loader.test.cjs` und `tests/site-loading.test.cjs`; Browser-Fehlerinjektion in `tests/browser/startup-recovery-qa.cjs` und vollständige Seitenprüfung in `tests/browser/site-loading-qa.cjs`. Die Browserprüfungen verwenden ausschließlich synthetische Anmeldung und Daten.

## Hilfe-Center

Vier neue Artikel erklären 10/15/20 Minuten und unbegrenzte Pause, die Erinnerung etwa zwei Minuten vor dem Ziel, Push-Voraussetzungen und das weiterhin manuelle Pausenende. Der Bestand umfasst 258 Artikel in 22 Kategorien. Die Suchprüfung und Ansichten von 320 bis 1440 Pixeln bestehen.

## Datensicherung: tatsächlich geprüft und weiterhin offen

Am 27.10.2026 zeigt das angemeldete Supabase-Dashboard acht abgeschlossene physische Tagesbackups vom 20.–27.10.2026. Das neueste Backup stammt vom **27.10.2026, 01:49:05 UTC**.

Der vorbereitete Dialog unter **Database → Backups → Restore to new project** übernimmt Organisation und Region `eu-central-1`. Er nennt **9,68 USD zusätzliche monatliche Compute-Kosten**, zusätzliche monatliche Disk-Kosten von **0 USD**. Bis zur ausdrücklichen Kostenfreigabe wurde kein neues Projekt angelegt und kein physisches Backup wiederhergestellt.

Supabase nennt im Dialog die übertragenen Bestandteile: Datenbankschema, sämtliche Daten und Indizes sowie Datenbankrollen, Berechtigungen und Benutzer. Separat zu konfigurieren sind Storage-Objekte und Einstellungen, Edge Functions, Auth-Einstellungen und API-Schlüssel, Erweiterungen/Einstellungen sowie Read Replicas. Ein Datenbank-Restore allein beweist daher keine Wiederherstellung der Storage-Dateien.

Am selben Tag wurde bereits unabhängig vom physischen Restore nachgewiesen:

- Audit-Archiv mit 364 Ereignissen erstellt, Status READY und anschließend verifiziert; 636.711 Byte.
- Wöchentlicher Audit-Archiv-Job aktiv.
- Private Storage-Buckets: `audit-archives` mit 31 Objekten; `personnel-documents` ohne Objekte.
- Keine öffentliche Tabelle ohne aktivierte RLS.

Diese Ergebnisse ersetzen keinen vollständigen Restore. Frühere logische Wiederherstellungs- und Datei-Hash-Tests sind in `backup-storage-restore-pruefung-2026-09-13.md` dokumentiert. Die Anforderungen an ein unabhängiges Storage-Backup bleiben in `storage-backup-target-architecture-2026-09-16.md` bestehen.

### Vorbereiteter Abnahmelauf nach Kostenfreigabe

1. Heutiges physisches Backup ausschließlich in ein neues, separat benanntes Testprojekt zurückspielen; produktive URLs, Auth-Konfiguration und aktive Dienste unverändert lassen.
2. Fertigstellung und Herkunft des Restore im Dashboard protokollieren. Im Testprojekt ausschließlich lesend Migrationen, erwartete Tabellen, Datenmengen, referenzielle Konsistenz und RLS-Status prüfen; keine echten Benachrichtigungen oder produktiven Logins auslösen.
3. Storage separat aus dem vorgesehenen unabhängigen Dateibackup wiederherstellen und mit `scripts/storage-restore-manifest.mjs` Anzahl, Pfad, Größe und SHA-256 vergleichen. Bei weiterhin leerem Personal-Bucket diesen Sachverhalt gesondert festhalten; ein leerer Bucket belegt keine Wiederherstellung realer Personaldateien.
4. Ergebnis und verbleibende Konfigurationslücken dokumentieren. Testressource erst nach Prüfung der normalen Löschbestätigung entfernen. Kostenpflichtige Ressourcen nicht unbeaufsichtigt weiterbetreiben.

**Checklistenstatus:** Hilfe und Startkorrektur sind technisch umgesetzt. Der Punkt Datensicherung bleibt bis zum tatsächlichen Restore und separaten Storage-Nachweis offen. Die Veröffentlichung und abschließende Liveprüfung sind zusätzlich erforderlich, bevor die beiden Codepunkte als live erledigt gelten.
