# SchichtFunk – Backup- und Storage-Restore-Prüfung

Stand: 13.09.2026
Produktivprojekt: `zbvloohfjleadjnqhbbh`, Frankfurt, PRODUCTION

## Heute verifiziert

Die Supabase-Backupseite wurde ausschließlich lesend geprüft. Sichtbar waren täglich erzeugte physische Datenbanksicherungen vom 06.09.2026 bis einschließlich 13.09.2026, jeweils ungefähr zwischen 01:44 und 01:51 UTC. Die jüngste sichtbare Sicherung trägt den Zeitstempel 13.09.2026 01:50:21 UTC.

Damit ist die laufende Erzeugung täglicher Datenbankbackups belegt. Supabase weist auf derselben Seite ausdrücklich darauf hin, dass Storage-Objekte nicht im Datenbankbackup enthalten sind. Ein Datenbank-Restore würde nur die Storage-Metadaten, nicht eine zwischenzeitlich gelöschte Personalakten-Datei wiederherstellen.

## Auf dem Wegwerf-Testbranch ausgeführt

Der nicht persistente Branch `privacy-restore-test-2026-09-13` wurde ohne Produktionsdaten angelegt. Ein logischer Export-/Lösch-/Restorezyklus für einen fiktiven Mitarbeiterdatensatz bestand 4 von 4 Prüfungen und wurde vollständig zurückgerollt.

Zusätzlich wurde über die echte private Supabase-Storage-API eine 47 Byte große fiktive Datei hochgeladen, heruntergeladen, gelöscht, aus dem Export wiederhergestellt und erneut heruntergeladen. Größe und SHA-256 (`42b7a4667d9e167edf8b114bad417fd651d0bc683ad8815bb58e7c09fdc6039b`) waren identisch. Die Testdatei wurde danach über die Storage-API entfernt; die Kontrollabfrage ergab 0 verbleibende Objekte.

## Nicht ausgeführt

Es wurde **kein physischer Restore eines Supabase-Tagesbackups** angeklickt oder gestartet. Ein Restore des Produktivprojekts verursacht Nichtverfügbarkeit und überschreibt den aktuellen Datenbankstand. Auch der bestandene logische Branch-Test beweist deshalb noch keinen vollständigen physischen Backup-Restore.

Für den späteren Storage-Test liegt nun ein lokales Manifestwerkzeug vor. Es inventarisiert einen Exportordner rekursiv, berechnet für jede Datei Bucket, Objektpfad, Dateigröße und SHA-256-Prüfsumme und meldet beim Restore fehlende, unerwartete oder inhaltlich abweichende Dateien. Symbolische Verknüpfungen werden nicht verfolgt; die Manifestdatei muss außerhalb des geprüften Objektordners liegen und wird nicht überschrieben. Der Test mit ausschließlich fiktiven Dateien besteht; er ersetzt noch nicht den echten Export und Restore des privaten Buckets.

Beispiel für die spätere Wegwerf-Umgebung:

```text
node scripts/storage-restore-manifest.mjs create personnel-documents <Exportordner> <Manifest-außerhalb-des-Exportordners.json>
node scripts/storage-restore-manifest.mjs verify personnel-documents <Restoreordner> <dieselbe-Manifestdatei.json>
```

`verify` endet nur dann erfolgreich, wenn Anzahl, Pfade, Größen und Prüfsummen exakt übereinstimmen. Der Export selbst muss separat über eine freigegebene Storage-Sicherung erfolgen; das Werkzeug lädt keine Produktionsobjekte herunter und besitzt keine Supabase-Schlüssel.

## Abnahmeplan auf Wegwerf-Testumgebung

1. fiktiven Testmandanten mit zwei Testkonten, Dienstplan, Zeitbuchung, Abwesenheit und einer harmlosen Testdatei anlegen;
2. Datenbankbackup bzw. logischen Export erstellen und die Testdatei zusätzlich separat exportieren;
3. Prüfsummen und erwartete Datensätze protokollieren;
4. Testdaten gezielt verändern bzw. entfernen;
5. Datenbank in eine neue Wegwerf-Umgebung wiederherstellen;
6. Tabellen, Auth-Verknüpfungen, RLS, RPCs und Edge-Function-Konfiguration prüfen;
7. Storage-Datei aus dem separaten Storage-Backup wiederherstellen und Hash vergleichen;
8. sicherstellen, dass gelöschte Daten nicht versehentlich wieder in Produktion gelangen;
9. RPO, RTO, Abweichungen und Verantwortliche dokumentieren;
10. Wegwerf-Umgebung erst nach ausdrücklicher Bestätigung löschen.

## Zielwerte

| Größe | vorläufiger Zielwert |
|---|---|
| Datenbank-RPO ohne kostenpflichtiges PITR | höchstens 24 Stunden |
| Storage-RPO | höchstens 24 Stunden nach eingerichtetem separatem Export |
| Wiederanlaufziel RTO | 8 Stunden, im Test zu messen |
| Backup-Aufbewahrung Supabase Pro | 7 Tage laut Anbieterangabe |

Status: 🟢 **TÄGLICHE DB-BACKUPS LIVE NACHGEWIESEN; LOGISCHER DB-RESTORE UND ECHTER PRIVATER STORAGE-RESTORE AUF WEGWERF-BRANCH BESTANDEN**, 🔴 **PHYSISCHER TAGESBACKUP-RESTORE UND DAUERHAFTER SEPARATER STORAGE-EXPORT NOCH OFFEN**.

Quelle: https://supabase.com/docs/guides/platform/backups
