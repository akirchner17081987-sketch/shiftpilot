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

### Warum der Direktklon noch nicht freigegeben ist

Die aktuelle [Supabase-Dokumentation](https://supabase.com/docs/guides/platform/clone-project) erklärt, dass ein binärer Restore auch externe Erweiterungen und Cron-Jobs übernimmt. Diese starten unmittelbar nach Abschluss; ein Ausschließen oder vorab Pausieren ist im Restore-Dialog nicht möglich. Die reine Auswahl eines neuen Projekts stellt daher noch keine Isolation sicher.

Die lesende Live-Abfrage am 27.10.2026 bestätigt zehn aktive SchichtFunk-Cron-Jobs, darunter Dispatches alle zehn Sekunden. Die versionierten Definitionen von `private.sf_dispatch_background_plans` und `private.sf_autonomy_tick` beziehungsweise ihren Helfern rufen die produktiven Edge Functions auf. Ein ungeprüfter physischer Klon könnte damit produktive Dienste auslösen.

### Sicherer nächster Abnahmelauf

1. Einen logischen Datenbankexport nach dem [offiziellen Backup-/Restore-Verfahren](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) über einen berechtigten Datenbankzugang erstellen. Der bestehende Connector und die Dashboard-Anmeldung liefern hier weder eine herunterladbare physische Sicherung noch die für diesen CLI-Export nötige Datenbankverbindung. Keine Zugangsdaten oder Exporte im öffentlichen Repository speichern.
2. Vor dem Einspielen externe Cron-Jobs, Webhooks und Wrapper im Export prüfen und deaktivieren beziehungsweise ausschließen. Die Zielumgebung muss vor dem ersten Ausführen produktive Aufrufe verhindern. Dafür keine produktiven Jobs pausieren oder produktive Tokens ändern.
3. Schema, Rollen und Daten in die geprüfte isolierte Zielumgebung zurückspielen. Vollständigkeit des Exports, Datenmengen, referenzielle Konsistenz, Migrationen und RLS prüfen. Fehler dürfen nicht als erfolgreiche Teilwiederherstellung übergangen werden. Unterschiede des logischen Verfahrens, etwa bei Vault-Schlüsseln, gesondert dokumentieren.
4. Storage separat aus dem vorgesehenen unabhängigen Dateibackup wiederherstellen und mit `scripts/storage-restore-manifest.mjs` Anzahl, Pfad, Größe und SHA-256 vergleichen. Ein weiterhin leerer Personal-Bucket belegt keine Wiederherstellung realer Personaldateien.
5. Ergebnis und verbleibende Konfigurationslücken dokumentieren. Kostenpflichtige Zielressourcen nur nach konkreter Kostenfreigabe anlegen und ihre spätere Stilllegung vereinbaren.

Ein erfolgreicher logischer Test wäre als solcher zu kennzeichnen. Der physische Tagesbackup-Restore darf erst als nachgewiesen gelten, wenn auch dafür eine geprüfte Isolation vorhanden ist.

**Checklistenstatus:** Hilfe und Startkorrektur sind technisch umgesetzt. Der Punkt Datensicherung bleibt bis zum tatsächlichen Restore und separaten Storage-Nachweis offen. Die Veröffentlichung und abschließende Liveprüfung sind zusätzlich erforderlich, bevor die beiden Codepunkte als live erledigt gelten.
