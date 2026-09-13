# SchichtFunk – Backup- und Storage-Restore-Prüfung

Stand: 13.09.2026
Produktivprojekt: `zbvloohfjleadjnqhbbh`, Frankfurt, PRODUCTION

## Heute verifiziert

Die Supabase-Backupseite wurde ausschließlich lesend geprüft. Sichtbar waren täglich erzeugte physische Datenbanksicherungen vom 06.09.2026 bis einschließlich 13.09.2026, jeweils ungefähr zwischen 01:44 und 01:51 UTC. Die jüngste sichtbare Sicherung trägt den Zeitstempel 13.09.2026 01:50:21 UTC.

Damit ist die laufende Erzeugung täglicher Datenbankbackups belegt. Supabase weist auf derselben Seite ausdrücklich darauf hin, dass Storage-Objekte nicht im Datenbankbackup enthalten sind. Ein Datenbank-Restore würde nur die Storage-Metadaten, nicht eine zwischenzeitlich gelöschte Personalakten-Datei wiederherstellen.

## Nicht ausgeführt

Es wurde **kein Restore** angeklickt oder gestartet. Ein Restore des Produktivprojekts verursacht Nichtverfügbarkeit und überschreibt den aktuellen Datenbankstand. „Restore to new project“ bzw. eine Supabase-Branch kann zusätzliche Kosten oder Ressourcen erzeugen. Dafür fehlt noch die ausdrückliche Bestätigung.

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

Status: 🟢 **TÄGLICHE DB-BACKUPS LIVE NACHGEWIESEN UND LOKALER STORAGE-MANIFEST-/RESTORE-ABGLEICH BESTANDEN**, 🔴 **ECHTER RESTORE UND SEPARATER STORAGE-EXPORT AUF WEGWERF-UMGEBUNG NOCH OFFEN**.

Quelle: https://supabase.com/docs/guides/platform/backups
