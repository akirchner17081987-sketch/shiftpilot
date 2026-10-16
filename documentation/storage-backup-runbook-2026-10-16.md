# SchichtFunk – Betrieb des verschlüsselten Dateibackups

Stand: 16.10.2026. **Implementiert und lokal mit fiktiven Dateien getestet; noch nicht produktiv aktiviert.**

Diese Anleitung ergänzt die historische Backupprüfung vom September. Der aktuelle lesende Bestandscheck ergab weiterhin einen privaten Personalakten-Bucket mit 0 Objekten und 0 Dokumentmetadatensätzen. Die heute verfügbaren Schnittstellen lieferten keinen aktuellen Katalog der täglichen Datenbankbackups; dessen Zeitstempel werden deshalb nicht als erneut geprüft ausgegeben.

## Umfang und Grenzen

Supabase-Datenbankbackups enthalten Storage-Metadaten, aber keine Dateiobjekte. Der neue Runner sichert ausschließlich den ausdrücklich konfigurierten Dateibucket. Er ersetzt weder ein Datenbankbackup noch den physischen Restore eines Supabase-Tagesbackups. Website, Quellcode, Auth-/Function-Konfiguration und externe Secrets sind gesonderte Wiederanlaufbestandteile.

Ein separater Linux-Runner mit Node >=22, restic und rclone kopiert den Bucket lesend über die S3-Schnittstelle in ein privates Arbeitsverzeichnis. restic verschlüsselt Inhalt, Pfade und Manifest vor Übertragung an ein unabhängiges, freigegebenes S3-Ziel. Der Runner verwendet niemals `sync`, löscht nichts im Quellbucket und bietet keine Rückschreibung nach Supabase an.

Für jeden Lauf:

1. Objektinventar mit Pfad, Größe, Änderungszeit und verfügbaren Hashes lesen; Pfadtraversal, doppelte Pfade und Größenüberschreitung abweisen.
2. Vollständig in ein neues Verzeichnis kopieren; Pfade und Größen gegen das Inventar prüfen.
3. Inventar erneut lesen. Gleichzeitige erkannte Änderungen brechen den Lauf ab.
4. SHA-256-Manifest, Herkunft und Erfassungszeit zusammen mit den Objekten verschlüsselt sichern.
5. Die lokale Ausgangskopie entfernen; genau den neu angelegten Snapshot in ein neues lokales Verzeichnis zurücksichern.
6. Herkunft, Dateianzahl, Pfade, Größen und SHA-256 prüfen, zusätzlich gegen das vor der Sicherung im Speicher gehaltene Manifest.
7. Erst danach `last-success.json` aktualisieren. Fehler schreiben nur einen minimierten Status in `last-run.json`; Rohlogs, Objektpfade und Zugangsdaten werden nicht ausgegeben.
8. Export-/Prüfverzeichnisse entfernen. Ein vorhandenes Restoreziel wird niemals überschrieben.

Die zweimalige Inventur ist kein atomarer Datenbank-/Dateisnapshot. Für eine konsistente gemeinsame Wiederherstellung sind der passende Datenbankstand, Dokumentmetadaten und der Storage-Erfassungszeitraum abzugleichen. Während einer späteren vollständigen Restore-Abnahme Dokumentänderungen kontrolliert anhalten oder eine nachweislich konsistente, versionierte Auswahl verwenden.

## Noch benötigte Betriebsmittel

- Unabhängiges privates S3-Ziel in einer freigegebenen EU/EWR-Region, mit AVV/DPA und separater Zugriffsverwaltung. IONOS Object Storage ist eine mögliche Auswahl; ein bestehendes Webhosting-/Deploy-Now-Projekt weist keinen solchen Speicher und keinen geeigneten Linux-Runner nach.
- Runner außerhalb der öffentlichen Website und des GitHub-CI-Betriebs für Echtdaten. Verschlüsselter Datenträger oder passend dimensioniertes tmpfs für die vorübergehende Klartextkopie; genügend Platz für Export und Rücksicherung. Sichere Geräte-/Serveradministration bleibt erforderlich.
- Eigenes starkes restic-Passwort in einem privaten Secret-File und unabhängig davon im Betreiber-Passworttresor, damit ein Runnerverlust die Wiederherstellung nicht verhindert.
- Supabase-S3-Zugangsdaten: Die generierten serverseitigen S3-Schlüssel umgehen RLS und sind **nicht** allein durch diesen Runner auf Lesen beschränkt. Sicher verwahren und separat rotieren; der Runner selbst führt nur Listen/Kopieren aus. Kein Benutzerpasswort und kein TOTP werden für den Job verwendet.
- Separater Backup-Writer und kontrollierter Restore-/Aufbewahrungszugang am Ziel. Versionierung/Objektschutz mit den benötigten restic-Lockoperationen abstimmen; ein schreibbarer verschlüsselter Speicher ist allein noch kein Schutz gegen administrative Löschung.
- Ziel, Zugang, Aufbewahrung und Alarmempfänger vor Echtdatenbetrieb festlegen. Keine kostenpflichtige Ressource wurde hierfür angelegt und keine Echtdatenübertragung gestartet.

## Einmalige Einrichtung auf dem freigegebenen Runner

Die ausführbaren Dateien werden versioniert und kontrolliert aus offiziellen Quellen installiert. Lokal geprüft: restic 0.19.1, rclone 1.75.2. Die isolierte CI-Prüfung verwendet restic und rclone aus dem signierten Ubuntu-Paketrepository und benötigt keine produktiven Secrets.

1. Systemkonto `schichtfunk-backup` ohne interaktive Anmeldung anlegen. Den geprüften Code schreibgeschützt unter `/opt/schichtfunk` installieren; benötigt werden nur die beiden Skripte `storage-backup.mjs` und `storage-restore-manifest.mjs`.
2. `ops/storage-backup.env.example` nach `/etc/schichtfunk/storage-backup.env` kopieren und mit den freigegebenen Ziel-/Quellwerten befüllen. Beispielwerte sind keine betriebsbereite Konfiguration. Die Datei und das Passwortfile gehören dem Betriebsadministrator beziehungsweise Backupkonto, sind nur für dieses Konto lesbar (0600) und liegen außerhalb von Git/Website.
3. Arbeits- und Statusverzeichnis privat (0700) erstellen. Die systemd-Dienste stellen standardmäßig `/run/schichtfunk-backup` und `/var/lib/schichtfunk-backup` bereit. Falls `/run` zu klein ist, einen freigegebenen verschlüsselten Arbeitsbereich verwenden und `ReadWritePaths` entsprechend anpassen.
4. Die Umgebung über den Secret-/Service-Manager laden. Sie nie über Chat, öffentliche Befehlszeilen oder `set -x` ausgeben. Dann unter demselben Dienstkonto ausführen:

```text
node /opt/schichtfunk/scripts/storage-backup.mjs check-config
node /opt/schichtfunk/scripts/storage-backup.mjs init
node /opt/schichtfunk/scripts/storage-backup.mjs backup
node /opt/schichtfunk/scripts/storage-backup.mjs health
```

`init` legt das verschlüsselte Repository an und ist ein expliziter einmaliger Einrichtungsschritt. `check-config` prüft Format und Passwortdatei, nicht die Erreichbarkeit oder Berechtigungen. Ein leeres Quellbucket ist standardmäßig ein Fehler. Für den bewusst leeren Anfangsbestand kann `SF_BACKUP_ALLOW_EMPTY=true` gesetzt werden. Nach einem erfolgreichen nichtleeren Stand führt eine plötzlich leere Quelle trotzdem zum Abbruch und muss untersucht werden.

5. Zuerst eine ausschließlich fiktive Datei am vorgesehenen Quell-/Zielpfad sichern und die echte S3-Übertragung sowie Rücksicherung abnehmen. Ohne diesen Test gilt der externe Weg nicht als nachgewiesen. Keine echten Personaldateien als Testmaterial verwenden.
6. Die vier Dateien `ops/schichtfunk-storage-backup*.service`/`*.timer` installieren. Nach bestandenem Erstlauf beide Timer aktivieren:

```text
systemctl enable --now schichtfunk-storage-backup.timer
systemctl enable --now schichtfunk-storage-backup-health.timer
```

Täglicher Start: 02:40 UTC. Stündliche Frischekontrolle: Fehler bei fehlendem Erfolg, fehlgeschlagenem letzten Lauf, falschem Projekt/Bucket oder Alter über 26 Stunden. Der Timerplan ist vorbereitet, hier jedoch nicht auf einem Betriebsserver aktiviert.

7. Fehlgeschlagene Dienstzustände und ausbleibende Heartbeats an das freigegebene bestehende Monitoring anbinden und mit fiktivem Fehler testen. Die gelieferten Units protokollieren Fehler/Exitcodes; sie versenden keine E-Mails und beweisen ohne angeschlossenen Empfänger noch keine Alarmzustellung. Ein externer Watchdog muss auch einen ausgefallenen Runner erkennen.
8. Aufbewahrung und Löschregeln separat freigeben und testen. Der Runner führt **kein automatisches `forget`/`prune`** aus. Unbegrenzte Aufbewahrung ist weder als datenschutzrechtlich freigegeben noch als kostenfrei anzusehen. Erst nach festgelegtem Fristprofil und getestetem Repositoryschutz eine passende Wartung aktivieren.

## Wiederherstellung eines bestimmten Sicherungsstands

Unter dem freigegebenen Restorekonto, mit Zielzugang und separat gesichertem Repositorypasswort:

```text
# SF_BACKUP_RESTORE_DIR auf einen neuen privaten Pfad setzen.
node /opt/schichtfunk/scripts/storage-backup.mjs restore <explizite-Snapshot-ID>
```

Der Befehl verlangt eine eindeutige hexadezimale ID statt `latest`, ein noch nicht vorhandenes Ziel und die erwartete Herkunft. Nach Entschlüsselung wird erneut das Manifest geprüft. Quelldatenbank und Supabase-Zugangsdaten werden dafür nicht benötigt. Bei Fehlern wird der angelegte Restorepfad zur kontrollierten Diagnose belassen; er ist private Klartextablage und nach Abschluss gemäß Betriebsprozess zu entfernen. Es gibt keinen automatischen produktiven Import.

Bei einem abgestürzten Lauf kann `running.lock` verbleiben. Erst prüfen, dass kein Sicherungsprozess mehr läuft, dann den verwaisten Lock und gegebenenfalls zurückgebliebene private Arbeitsdateien kontrolliert entfernen. Ein neuer Lauf überschreibt diesen Schutz nicht automatisch.

## Datenbank-Restore: noch separat abzunehmen

- Aktuellen Backupkatalog über Supabase Dashboard oder autorisierten Management-API-Zugang lesen und Sicherungszeitpunkt protokollieren. Der verbundene Datenbank-Connector stellt diesen Katalog derzeit nicht bereit.
- Wiederherstellung ausschließlich in ein isoliertes neues Projekt; das Produktivprojekt nicht zurücksetzen. Neue Ressourcen können Kosten verursachen und werden erst nach konkreter Kostenfreigabe angelegt.
- Tabellen, Auth-Verknüpfungen, RLS, Grants, Funktionen und aktuelle sensible Rechte prüfen. Edge Functions, API-Schlüssel/Auth-Konfiguration und externe Secrets separat wiederherstellen/konfigurieren.
- Die zum Datenbankstand passenden Dateien aus dem unabhängigen Dateibackup ergänzen und Hashes prüfen. Ausgehende Benachrichtigungen/Worker im Testziel isolieren.
- Gemessene vollständige Wiederanlaufzeit und möglichen Datenverlust festhalten. Zielwerte bleiben RPO 24 Stunden und RTO 8 Stunden; ein schneller lokaler Dateitest beweist diese Werte für Produktion nicht.

## Nachweisstand

Technisch vorbereitet: verschlüsselter S3-Export, SHA-256-Manifest, Prüfung nach tatsächlicher Rücksicherung, exakte Restoreauswahl, Fehler-/Frischezustand, private Arbeitsverzeichnisse und systemd-Zeitpläne. Lokal wurden ausschließlich fiktive Dateien verwendet. Noch offen: Ziel-/Runnerbereitstellung, Zugänge, externe S3-Abnahme, tägliche Aktivierung, Alarmzustellung, Aufbewahrungsfreigabe, aktueller Datenbankbackupkatalog und physischer Datenbank-Restore.

Offizielle Grundlagen:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/clone-project
- https://supabase.com/docs/guides/storage/s3/authentication
- https://rclone.org/commands/rclone_copy/
- https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html
- https://restic.readthedocs.io/en/stable/040_backup.html
- https://restic.readthedocs.io/en/stable/050_restore.html
