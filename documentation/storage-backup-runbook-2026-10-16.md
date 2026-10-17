# SchichtFunk: Dateibackup über Supabase, Stand 17.10.2026

## Status und Umfang

PR #111 ersetzt die vorbereitete Linux-/VPS-Ausführung vollständig durch Supabase Cron, eine private Postgres-Warteschlange und die Edge Function `storage-backup`. Ein VPS wird nicht benötigt. Die Quelldateien bleiben im privaten Supabase-Bucket `personnel-documents`; verschlüsselte Sicherungen gehören in einen **unabhängigen, privaten IONOS Object Storage Bucket in der EU**. Ein weiterer Bucket im selben Supabase-Projekt erfüllt diesen Zweck nicht.

**Noch nicht produktiv aktiviert.** Externer Bucket, S3-Zugang, Schlüsselhinterlegung, externes Monitoring und echter Zieltest fehlen. Im produktiven Quellbucket befinden sich nach lesender Kontrolle weiterhin **0 Dateien**. Es wurde weder eine produktive Datei erzeugt noch die produktive Datenbank durch diese Änderung verändert. Die Migration aktiviert zunächst ausdrücklich nichts.

Gesichert werden Dateiinhalte und ein verschlüsseltes Verzeichnis mit ursprünglichem Bucket/Pfad, Größe, SHA-256 und Snapshot-ID. Datenbanktabellen, Rollen, Auth-Benutzer und die Zuordnung der Dateien zu Personalvorgängen gehören weiterhin zur separaten Datenbanksicherung. Ein Dateirestore ist keine vollständige Plattformwiederherstellung. Auch der physische Datenbankrestore in ein isoliertes Projekt bleibt separat nachzuweisen.

## Ablauf und Schutz

1. Täglich um **02:40 UTC** erfasst Cron das Storage-Inventar. Nur ein Lauf kann aktiv sein. Der zweite Cronjob prüft alle zehn Sekunden, ob ein Workeraufruf nötig ist; im Leerlauf entsteht kein Edge-Aufruf.
2. Pro Aufruf verarbeitet der Worker genau eine Datei oder einen Manifest-/Abschlussschritt. Der Worker liest Quellen nur über die Supabase Storage API. Er schreibt niemals in den Quellbucket und löscht weder Quell- noch Sicherungsdateien.
3. Dateiinhalte werden mit **AES-256-GCM** verschlüsselt, mit zufälligem 96-Bit-Nonce und authentifiziertem Projekt/Bucket/Objektschlüssel. HKDF-SHA-256 trennt Verschlüsselungs- und Adressschlüssel. Ein unabhängig verwahrter, zufälliger 256-Bit-Masterschlüssel ist zwingend. Dateipfade stehen nur im verschlüsselten Manifest; externe Blobnamen verwenden HMAC-SHA-256.
4. Identische Inhalte verwenden innerhalb desselben Projekts/Buckets/Schlüssels dasselbe verschlüsselte Blobobjekt. Unveränderte Dateien werden beim nächsten Lauf nicht erneut hochgeladen. Neue oder geänderte Inhalte und Tagesmanifeste bleiben als Versionen erhalten. Die Quelle wird aktuell trotzdem pro Lauf neu gelesen; daraus entsteht Supabase-Egress.
5. `If-None-Match: *` verhindert Überschreiben bestehender Zielobjekte. Nach der Kopierphase werden alle Dateien aus dem Ziel erneut gelesen, entschlüsselt und anhand von Größe und SHA-256 geprüft. Danach werden Manifest und eine verschlüsselte Abschlussquittung geschrieben und zurückgelesen. Der unabhängige Restore akzeptiert nur Snapshots mit gültiger Quittung. **Die Unterstützung bedingter PUTs muss vor Aktivierung am konkreten IONOS-Ziel geprüft werden.**
6. Ein Lease von 180 Sekunden schützt jeden Arbeitsschritt; Netzwerkoperationen teilen sich ein Zeitbudget von 90 Sekunden, einzelne Transfers höchstens 25 Sekunden. Nach Absturz darf derselbe Schritt erneut ausgeführt werden; bereits vorhandene verschlüsselte Inhalte werden geprüft und wiederverwendet. Alte oder doppelte Commits werden abgewiesen. Höchstens drei Versuche je Schritt, maximal 20 Stunden je Lauf. Änderungen des Quellinventars vor Manifest/Abschluss brechen den Lauf ab. Das ist kein transaktionaler Snapshot aus Datenbank und Storage; der Restore muss mit einem passenden DB-Stand abgeglichen werden.
7. Die öffentlichen RPC-Hüllen sind `SECURITY INVOKER` und ausschließlich für `service_role` ausführbar. Tabellen liegen mit RLS im privaten Schema. Der Edge-Endpunkt prüft vor Datenbankzugriff einen separaten zufälligen Dispatch-Token; `verify_jwt=false` ist dafür beabsichtigt. Tokens und Dateinamen erscheinen nicht in HTTP-Antworten. Dieser Worker hat serverseitig den privilegierten Service-Schlüssel; seine Secrets dürfen niemals im Frontend landen.

Aktuelle, bewusst konservative Grenzen: **10 MiB je Datei, 2.000 Dateien und 1 GiB pro Inventar**, Manifest maximal 2 MiB. Die Dateigröße entspricht dem bestehenden Personalbucket. Bei Überschreiten scheitert der Lauf sichtbar; es werden keine Dateien still übersprungen. Leere Inventare sind standardmäßig gesperrt. Nach einem nichtleeren erfolgreichen Backup wird eine plötzlich leere Quelle auch bei `allow_empty=true` abgewiesen.

## Einrichtung nach Bereitstellung des Zielzugangs

1. Eigenen EU-Bucket mit öffentlichem Zugriff gesperrt anlegen. Einen auf diesen Bucket/Präfix beschränkten Writer mit `GetObject`/`PutObject` und **ohne Delete-Rechte** verwenden. Separaten Restore-Zugang nur mit Leserechten verwahren. Bucket-Versionierung und gegen administrative Löschung geschützte Aufbewahrung, falls verfügbar, passend zum gewünschten Schutz konfigurieren und prüfen. Verschlüsselung allein verhindert keine Löschung oder absichtliches Überschreiben durch kompromittierte S3-Zugangsdaten.
2. Einen zufälligen 32-Byte-Masterschlüssel und einen separaten Dispatch-Token mit mindestens 32 Zeichen außerhalb des Chats erzeugen. Beide in einem Betreiber-Passworttresor ablegen. Den **Masterschlüssel samt Projektkennung, Endpunkt, Region, Bucket, Präfix, Codeversion und Snapshot-IDs unabhängig vom Supabase-Konto** verwahren. Ohne Masterschlüssel sind die Sicherungen unbrauchbar. Schlüsselrotation erzeugt einen neuen Namensraum; frühere Schlüssel bleiben für alte Snapshots erforderlich.
3. Die Werte aus `ops/storage-backup.env.example` als Edge Function Secrets hinterlegen; `BACKUP_PROJECT_REF` wird nur für Restore benötigt. Den Dispatch-Token zusätzlich mit dem Namen `storage_backup_dispatch_token` in Supabase Vault speichern. Keine echten Schlüssel in Migration, SQL-History, Commit, Browsercode oder Logs kopieren. Supabase stellt URL und Service-Role-Key automatisch serverseitig bereit.
4. Migration `20261016190309_serverless_storage_backup.sql` regulär anwenden; sie setzt `enabled=false`. Voraussetzungen `pg_cron`, `pg_net` und Vault sind im bestehenden Projekt lesend bestätigt. Edge Function `storage-backup` mit der Konfiguration in `supabase/config.toml` deployen. Danach Sicherheits-/Performance-Advisors prüfen.
5. Mit ausschließlich fiktiven Dokumenten in einer isolierten Supabase-Testumgebung und dem echten Ziel einen Fähigkeitstest ausführen: signiertes PUT/GET, erneutes PUT derselben Testadresse muss **412** liefern, keine öffentlichen Downloads, Wiederherstellung nach Entfernen der Testquelle, Hashvergleich. Bei fehlender Unterstützung des bedingten PUTs wird **nicht aktiviert**; keine automatische unsichere Ausweichvariante. Temporäre Testobjekte mit einem separaten Betreiberzugang kontrolliert entfernen.
6. Einen externen Monitor einrichten, der fehlende/veraltete Erfolge auch erkennt, wenn Supabase/Cron selbst ausfällt. Der Monitor muss über einen separat geschützten Betreiberweg `private.storage_backup_health()` mindestens stündlich auswerten; diese Funktion ist absichtlich kein öffentliches HTTP-/Mitarbeiter-API. Der konkrete Monitortransport und Alarmempfänger sind noch einzurichten. Keine Erfolgsmeldung ohne erfolgreichen Restore-Test.
7. Im SQL-Editor als Betreiber die richtige Projektkennung konfigurieren. Erst nach bestandenem Zieltest und eingerichtetem Alarm `enabled=true` setzen. Beispiel ohne Zugangsdaten:

```sql
update private.storage_backup_config
set project_ref = '<eigene-20-stellige-projektkennung>', enabled = true
where singleton;
select private.storage_backup_start();
select private.storage_backup_dispatch();
```

Für den derzeit absichtlich leeren Produktionsbucket darf der Betreiber den ersten Leerlauf explizit mit `allow_empty=true` erlauben. Ein leeres Manifest beweist keinen Dateirestore. Nach ersten echten Dokumenten erneut kontrollieren. Deaktivierung jederzeit mit `update private.storage_backup_config set enabled=false where singleton;`; die nächsten Worker beanspruchen dann keine weiteren Schritte. Noch laufende Schritte dürfen ihren begonnenen Commit abschließen.

## Kontrolle und Wiederherstellung

Als Betreiber (keine Ergebnisse mit Dateipfaden veröffentlichen):

```sql
select private.storage_backup_health();
select id, phase, captured_at, completed_at, jsonb_array_length(files) as files, last_error
from private.storage_backup_runs order by captured_at desc limit 10;
```

`healthy` erfordert Aktivierung, einen geprüften Erfolg innerhalb von 26 Stunden und keinen neueren fehlgeschlagenen Lauf. Einen Fehler, ausbleibende Starts und gealterte Erfolge alarmieren. `COMPLETE` belegt die Dateiprüfung des konkreten Laufs, nicht die gesamte Notfallbereitschaft. Die Quittung kann bereits existieren, wenn nur der abschließende Datenbank-Commit verloren ging: sie belegt eine erfolgreich zurückgelesene Sicherung; der SQL-Lauf wird dann noch einmal abgeschlossen.

Unabhängiger Restore auf einem vertrauenswürdigen Rechner mit **Node 24** und einer geprüften Kopie dieses Repositorys (`npm ci`). Nur S3-Lesezugang und der hinterlegte Masterschlüssel werden benötigt, **kein Zugriff auf das ursprüngliche Supabase-Projekt oder dessen Service-Key**. Die ausgewählte Snapshot-ID ist die UUID eines erfolgreich abgeschlossenen Laufs; im Totalausfall sind abgeschlossene IDs über die Objekte unter `<Präfix>/completed/<Key-ID>/` mit einem Betreiber-Lesezugang auffindbar. Kein manuelles Bearbeiten der verschlüsselten Objekte.

Die Backup-Umgebungsvariablen einschließlich `BACKUP_PROJECT_REF` über einen sicheren lokalen Secretmechanismus laden. Danach einen **neuen**, noch nicht vorhandenen Ausgabeordner in einem privaten Verzeichnis angeben:

```sh
npm run backup:restore -- <snapshot-uuid> /privater/pfad/neuer-restore-ordner
```

Manifest, Abschlussquittung und alle Inhalte werden authentifiziert, SHA-256 und Größen geprüft. Vorhandene Ausgabeordner, Dateien oder Symlinks werden abgewiesen, Dateien mit Modus 0600 und Verzeichnisse mit 0700 geschrieben. Unsichere, doppelte und miteinander kollidierende Pfade werden abgelehnt. Bei einem Fehler kann ein unvollständiger Ausgabeordner zurückbleiben; diesen als unvollständig behandeln und nach Klärung in einen neuen Ordner wiederholen.

Zuerst ausschließlich in ein isoliertes Ziel wiederherstellen. Inventar und Zuordnung mit dem passenden Datenbankrestore abgleichen, Dateiöffnen und Rechte beider Unternehmen prüfen. Der CLI-Restore lädt absichtlich nichts automatisch zurück in Produktion. Eine kontrollierte Freigabe der wiederhergestellten Daten ist ein separater Schritt.

## Aufbewahrung und Nachweis

Automatisches Löschen ist noch nicht implementiert. Dadurch überlebt eine versehentliche Quelllöschung die nachfolgenden Tagesläufe; Speicherbedarf wächst um neue Inhalte und Manifeste. Eine pauschale S3-Regel „alle Objekte älter als N Tage löschen“ ist wegen Deduplizierung **ungeeignet**: alte Blobs können weiterhin in aktuellen Snapshots referenziert sein. Ein späterer Ablauf muss erst aufzubewahrende Snapshots festlegen und ausschließlich nachweislich unreferenzierte Blobs löschen. Bis dahin Aufbewahrungsdauer, Speicherwachstum und datenschutzgerechte Löschung als Betriebsaufgabe festlegen; nichts pauschal automatisch entfernen.

`npm run test:storage-drill` verwendet tatsächliche Postgres-Ausführung (PGlite), einen lokalen S3-HTTP-Testserver mit unabhängiger AWS-v4-Signaturprüfung, echte AES-GCM-Verschlüsselung und den unabhängigen Restore. Es löscht die fiktive Quelle und schließt die Quelldatenbank vor dem Restore. Enthalten sind Deduplizierung, Versionsänderung/Löschung, Absturz nach Upload, Lease-Replay, falscher Schlüssel, beschädigte/fehlende/zu große Objekte, leere/geänderte Quelle, Rollenzugriffe, Ausfall und sichere Pfade. Diese Tests ersetzen keinen echten IONOS-Test und keinen Nachweis der Supabase-Edge-Limits unter Produktionslast.

## Quellen

- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/platform/backups
- https://docs.ionos.com/cloud/storage-and-backup/object-storage
- https://github.com/mhart/aws4fetch
