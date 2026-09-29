# SchichtFunk – Backup- und Storage-Restore-Prüfung

Stand: 16.09.2026
Produktivprojekt: `zbvloohfjleadjnqhbbh`, Frankfurt, PRODUCTION

## 1. Live-Nachweis der Sicherungen

Die Supabase-Backupseite wurde ausschließlich lesend geprüft. Sichtbar waren täglich erzeugte physische Datenbanksicherungen vom 06.09.2026 bis einschließlich 13.09.2026, jeweils ungefähr zwischen 01:44 und 01:51 UTC. Die jüngste in dieser Prüfung sichtbare Sicherung trug den Zeitstempel 13.09.2026 01:50:21 UTC.

Damit ist die laufende Erzeugung täglicher Datenbankbackups belegt. Für Supabase Pro dokumentiert der Anbieter sieben Tage Aufbewahrung der täglichen Datenbanksicherungen. Storage-Objekte sind nicht Bestandteil des Datenbankbackups: Ein Datenbank-Restore stellt Storage-Metadaten, aber nicht eine zwischenzeitlich gelöschte Personalakten-Datei wieder her.

## 2. Bereits ausgeführte Restore-Prüfungen

Der nicht persistente Branch `privacy-restore-test-2026-09-13` wurde ohne Produktionsdaten angelegt. Ein logischer Export-/Lösch-/Restorezyklus für einen fiktiven Mitarbeiterdatensatz bestand 4 von 4 Prüfungen und wurde vollständig zurückgerollt.

Zusätzlich wurde über die echte private Supabase-Storage-API eine 47 Byte große fiktive Datei hochgeladen, heruntergeladen, gelöscht, aus dem Export wiederhergestellt und erneut heruntergeladen. Größe und SHA-256 (`42b7a4667d9e167edf8b114bad417fd651d0bc683ad8815bb58e7c09fdc6039b`) waren identisch. Die Testdatei wurde danach über die Storage-API entfernt; die Kontrollabfrage ergab 0 verbleibende Objekte.

Vor der Bereinigung enthielt der Wegwerf-Branch weder Lifecycle-Anträge, Fristprofile, Legal Holds, fiktive Auth-Nutzer, fiktive Unternehmen noch Storage-Objekte. Der Branch wurde danach gelöscht; die Kontrollabfrage vom 13.09.2026 um 10:09:34 UTC zeigte ausschließlich den Produktivbranch `main`.

Damit sind der logische Datenbank-Wiederherstellungsweg, die private Storage-API und die Hash-basierte Inhaltskontrolle technisch nachgewiesen. Dies ersetzt nicht den Restore eines echten physischen Tagesbackups.

### Aktueller produktiver Storage-Zustand

Eine rein lesende Bestandsprüfung am 16.09.2026 ergab für den privaten Bucket `personnel-documents` **0 Objekte und 0 Byte**. Auch `public.employee_personnel_documents` enthält aktuell **0 Dokument-Metadatensätze**.

Damit liegen derzeit keine produktiven Personalakten-Dateien ohne separaten Storage-Backupweg vor. Dieser Befund beseitigt die künftige Backup-Anforderung nicht: Vor der ersten echten Personalakten-Datei muss entweder der getrennte Storage-Export betriebsbereit sein oder die Nutzung der Dokumentablage organisatorisch zurückgestellt bleiben.

## 3. Physischer Restore – sichere Zielmethode festgelegt

Es wurde **kein physischer Restore des Produktivprojekts** angeklickt oder gestartet. Ein In-place-Restore kann Nichtverfügbarkeit verursachen und den aktuellen Datenbankstand ersetzen. Dieser Weg wird für die reguläre Abnahme deshalb nicht verwendet.

Supabase stellt für Backups die Funktion **Restore to a New Project** bereit. Sie erstellt aus einer Sicherung ein separates Projekt und lässt das Quellprojekt unverändert. Für SchichtFunk ist dies der vorgesehene Abnahmeweg für den noch offenen physischen Restore, weil dadurch das Produktivprojekt nicht überschrieben wird.

Die aktuelle Kostenabfrage für ein zusätzliches Projekt in der Organisation `Security_Plattform` ergab **10 USD pro Monat**. Der Betreiber hat am 16.09.2026 festgelegt: Der physische Restore-Test wird durchgeführt, wenn er für die belastbare Abnahme tatsächlich notwendig ist und kein gleichwertiger, kostenfreier Nachweis möglich ist. Bis zu dieser Entscheidung wird kein zusätzliches Projekt angelegt und keine kostenpflichtige Ressource erzeugt.

Diese Entscheidung ist bewusst risikobasiert: Die tägliche Backup-Erzeugung, ein logischer Datenbank-Restore und ein privater Storage-Restore mit Hashvergleich sind bereits technisch nachgewiesen. Der physische Restore bleibt deshalb ein separater letzter Abnahmenachweis und kein Grund, vorsorglich sofort Kosten auszulösen.

### Abnahmekriterien für `Restore to a New Project`

1. Restore aus einem eindeutig protokollierten Tagesbackup in ein neues, isoliertes Projekt;
2. Produktivprojekt bleibt während des gesamten Tests unverändert und erreichbar;
3. Tabellen-/Datensatzstichproben, Auth-Verknüpfungen, RLS, Grants und zentrale RPC-Definitionen stimmen mit dem Sicherungszeitpunkt überein;
4. Edge-Function- und externe Secret-Konfiguration wird nicht automatisch als wiederhergestellt vorausgesetzt, sondern separat geprüft;
5. Storage-Dateien werden separat aus dem freigegebenen Storage-Backup wiederhergestellt;
6. Hashvergleich des Storage-Manifests besteht ohne fehlende oder unerwartete Dateien;
7. RPO und gemessene RTO werden dokumentiert;
8. Restore-Projekt wird erst nach dokumentierter Abnahme und ausdrücklicher Freigabe wieder entfernt.

## 4. Separater Storage-Backupweg

Für Storage liegt `scripts/storage-restore-manifest.mjs` vor. Das Werkzeug inventarisiert einen Exportordner rekursiv, berechnet für jede Datei Bucket, Objektpfad, Dateigröße und SHA-256-Prüfsumme und meldet beim Restore fehlende, unerwartete oder inhaltlich abweichende Dateien. Symbolische Verknüpfungen werden nicht verfolgt; die Manifestdatei muss außerhalb des geprüften Objektordners liegen und wird nicht überschrieben.

Beispiel:

```text
node scripts/storage-restore-manifest.mjs create personnel-documents <Exportordner> <Manifest-außerhalb-des-Exportordners.json>
node scripts/storage-restore-manifest.mjs verify personnel-documents <Restoreordner> <dieselbe-Manifestdatei.json>
```

`verify` endet nur dann erfolgreich, wenn Anzahl, Pfade, Größen und Prüfsummen exakt übereinstimmen. Das Werkzeug besitzt keine Supabase-Schlüssel und lädt keine Produktionsobjekte selbst herunter.

Der dauerhafte separate Storage-Export ist **noch nicht eingerichtet**. Dafür muss ein vom Produktivprojekt unabhängiges, für Beschäftigten-/Personalaktendaten freigegebenes Backupziel gewählt werden. Ein zweiter Bucket im selben Supabase-Projekt würde Projektverlust oder Fehlkonfiguration nicht ausreichend isolieren und gilt daher nicht als vollständiger separater Backupweg. Repository/GitHub ist wegen der personenbezogenen Dokumente ausdrücklich kein zulässiges Backupziel.

### Anforderungen an das spätere Backupziel

- getrennte Zugangsdaten und möglichst getrennte administrative Fehlerdomäne;
- Verschlüsselung bei Übertragung und Speicherung;
- Zugriff nur für den eng begrenzten Backup-/Restore-Prozess;
- täglicher Export oder mindestens Storage-RPO von 24 Stunden;
- versionierte bzw. überschreibgeschützte Sicherungsstände, soweit vom Ziel unterstützt;
- dokumentierte Lösch-/Aufbewahrungsfrist im Einklang mit dem Kunden-Fristprofil;
- Restore über Manifest/Hash verifizierbar;
- keine Speicherung von Service-Role-Schlüsseln im Repository.

## 5. Abnahmeplan auf isolierter Restore-Umgebung

1. fiktiven Testmandanten mit zwei Testkonten, Dienstplan, Zeitbuchung, Abwesenheit und einer harmlosen Testdatei verwenden;
2. protokolliertes Tagesbackup auswählen und ein isoliertes Restore-Projekt erstellen;
3. Prüfsummen und erwartete Datensätze festhalten;
4. Datenbankstand des Restore-Projekts gegen den erwarteten Sicherungszeitpunkt prüfen;
5. RLS, Grants, Auth-Verknüpfungen und kritische RPC-Grenzen prüfen;
6. Storage-Datei aus dem separaten Storage-Backup wiederherstellen und Hash vergleichen;
7. sicherstellen, dass keine Restore-Daten zurück in Produktion geschrieben werden;
8. RPO, RTO, Abweichungen und Verantwortliche dokumentieren;
9. Produktivprojekt auf unveränderten Status kontrollieren;
10. isoliertes Restore-Projekt erst nach ausdrücklicher Bestätigung entfernen.

## 6. Zielwerte

| Größe | Zielwert |
|---|---|
| Datenbank-RPO ohne PITR | höchstens 24 Stunden |
| Storage-RPO | höchstens 24 Stunden nach eingerichtetem separatem Export |
| Wiederanlaufziel RTO | 8 Stunden; im physischen Restore-Test zu messen |
| Backup-Aufbewahrung Supabase Pro | 7 Tage tägliche Backups laut Anbieterangabe |
| Restore-Isolation | Produktivprojekt wird für Abnahmetests nicht überschrieben |

## 7. Offene Freigabegrenzen

1. **Physischer Tagesbackup-Restore:** technisch sicherer Weg `Restore to a New Project` festgelegt; bedingte Betreiberfreigabe liegt vor. Durchführung nur, wenn kein gleichwertiger kostenfreier Nachweis möglich ist und der physische Abnahmenachweis für den Echtbetrieb benötigt wird.
2. **Dauerhafter separater Storage-Export:** aktuell 0 produktive Objekte/Metadatensätze; Zielarchitektur und Manifestprüfung definiert, unabhängiges Backupziel/Vertrag/Zugang aber noch festzulegen, bevor echte Personalakten-Dateien produktiv genutzt werden.
3. **Wiederkehrende Übung:** nach erster physischer Abnahme mindestens jährlich und nach wesentlichen Backup-/Provideränderungen wiederholen.

Status: 🟡 **TÄGLICHE DB-BACKUPS LIVE NACHGEWIESEN; LOGISCHER DB-RESTORE UND PRIVATER STORAGE-RESTORE MIT HASH BESTANDEN; SICHERE PHYSISCHE RESTORE-METHODE FESTGELEGT; BEDINGTE BETREIBERFREIGABE FÜR DEN KOSTENPFLICHTIGEN TEST DOKUMENTIERT; PRODUKTIVER PERSONALAKTEN-STORAGE AKTUELL LEER. OFFEN SIND DIE BEI BEDARF AUSZUFÜHRENDE PHYSISCHE RESTORE-ABNAHME UND EIN DAUERHAFTER, VOM PRODUKTIONSPROJEKT GETRENNTER STORAGE-EXPORT VOR ERSTER ECHTER DOKUMENTABLAGE.**

Quellen:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/backups#restore-to-a-new-project
