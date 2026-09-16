# SchichtFunk – Architektur für den separaten Personalakten-Storage-Backupweg

Stand: 16.09.2026
Dokumentstatus: Betreiberunterlage, Version 1.0

## 1. Ausgangslage

Der produktive private Supabase-Bucket `personnel-documents` enthält zum Prüfzeitpunkt 0 Objekte und 0 Byte; auch `public.employee_personnel_documents` enthält 0 Dokument-Metadatensätze. Es liegen damit aktuell keine produktiven Personalakten-Dateien ohne separaten Backupweg vor.

Supabase-Datenbankbackups sichern Storage-Metadaten, aber nicht die Objektdateien selbst. Vor der ersten echten Personalakten-Datei ist deshalb ein vom Produktivprojekt unabhängiger Storage-Backupweg erforderlich oder die Dokumentablage muss organisatorisch deaktiviert bleiben.

## 2. Zielarchitektur

Der Backupweg besteht aus vier getrennten Schritten:

1. **Nur-lesender Export aus Supabase Storage**
   - Zugriff ausschließlich mit einem eng begrenzten Backup-/Service-Credential zur Laufzeit;
   - keine Schlüssel im Git-Repository, Workflow-Artefakt oder Exportprotokoll;
   - Export ausschließlich des festgelegten Buckets bzw. freigegebener Objektpräfixe.

2. **Integritätsmanifest**
   - für jedes Objekt: Bucket, Objektpfad, Größe und SHA-256;
   - Erstellung/Prüfung über `scripts/storage-restore-manifest.mjs`;
   - Manifest getrennt von den Objektdateien speichern, damit es beim Restore als unabhängiger Soll-Nachweis dient.

3. **Unabhängiges Backupziel**
   - andere administrative Fehlerdomäne als das produktive Supabase-Projekt;
   - EU/EWR-Speicherort bzw. vertraglich freigegebene Datenübermittlung;
   - AVV/DPA und Unterauftragnehmer vor Echtdatenbetrieb prüfen;
   - Verschlüsselung bei Übertragung und Speicherung;
   - separate Zugangsdaten, Versionierung/Objektschutz und nachvollziehbare Löschung.

4. **Wiederherstellungsprüfung**
   - Export in isolierten Restore-Pfad zurückspielen;
   - Manifest neu erzeugen und exakt vergleichen;
   - Abweichung bei Anzahl, Pfad, Größe oder SHA-256 führt zum Fehlschlag;
   - Restore niemals ungeprüft in das produktive Projekt zurückschreiben.

## 3. Betriebsziel

- Storage-RPO: höchstens 24 Stunden.
- Regelbetrieb: täglicher Export, sobald echte Personalakten-Dateien gespeichert werden.
- Aufbewahrung: nicht pauschal in der Technik fest verdrahten; sie folgt dem freigegebenen Kunden-Fristprofil und vertraglichen Anforderungen.
- Restore-Drill: mindestens jährlich sowie nach wesentlicher Änderung von Provider, Verschlüsselung oder Backupverfahren.
- Alarm: fehlgeschlagener Export oder Integritätsvergleich muss als Betriebsabweichung behandelt werden.

## 4. Ausschlüsse

Folgende Ziele gelten **nicht** als ausreichender separater Backupweg:

- zweiter Bucket im selben Supabase-Projekt;
- GitHub-Repository oder GitHub-Actions-Artefakte für Personalakten-Dateien;
- unverschlüsselter lokaler Download auf Betreiber-Endgeräte als alleinige Sicherung;
- Browsercache/PWA-Cache;
- ausschließliches Vertrauen auf Datenbankbackups.

## 5. Anbieterentscheidung

Der konkrete Backupanbieter wird erst gewählt, wenn folgende Angaben belastbar vorliegen:

- Speicherregion;
- AVV/DPA und Unterauftragnehmer;
- Verschlüsselung;
- Versionierung oder Object Lock/vergleichbarer Schutz;
- Zugriffskontrolle/MFA;
- Preis und Abrechnungsmodell;
- Export-/Restore-Schnittstelle;
- Lösch- und Aufbewahrungsfunktionen.

Es wird bewusst kein kostenpflichtiger Anbieter angelegt, solange der produktive Bucket leer ist und kein Echtdokumentbetrieb freigegeben wurde.

## 6. Einführungs-Gate

Vor der ersten echten Dokumentablage sind zwingend:

1. Backupziel ausgewählt und vertraglich/datenschutzrechtlich geprüft;
2. separate Backup-Zugangsdaten eingerichtet;
3. erster Export mit ausschließlich fiktiver Datei bestanden;
4. Manifest-/Hashprüfung bestanden;
5. Wiederherstellung auf isolierten Pfad bestanden;
6. täglicher Zeitplan und Fehleralarm aktiviert;
7. Verantwortlichkeit für Fehlalarme und Restore festgelegt.

Bis dahin lautet der Betriebsstatus der Personalakten-Dateiablage: **technisch vorhanden, aber für echte Dokumente noch nicht als vollständig backup-abgenommen**.

Status: 🟡 **ZIELARCHITEKTUR UND FREIGABEGATE FESTGELEGT; PRODUKTIVER STORAGE LEER; KONKRETES UNABHÄNGIGES BACKUPZIEL UND DER AUTOMATISIERTE TÄGLICHE EXPORT BLEIBEN VOR ERSTER ECHTER DOKUMENTABLAGE OFFEN.**
