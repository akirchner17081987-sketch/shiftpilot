# Mitarbeiterlöschung: große Planungsdaten und Protokolle

Der gemeldete Timeout trat in `server_commit_employee_erasure` beim bisherigen
gesamten Spaltenupdate von `private.background_auto_plan_jobs.payload` auf.
Der betroffene Auftrag war bereits in Datenbankphase 1; seine bisherigen
Checkpoints bleiben verwendbar. Diese Migration führt keine Mitarbeiterlöschung aus.

## Änderung

- JSON-Objekte werden einmal aggregiert, statt das wachsende Objekt für jeden
  Schlüssel erneut zu kopieren. Die Bereinigungsregeln bleiben identisch.
- JSON-Spalten mit UUID-Zeilenschlüssel werden zeilenweise verarbeitet. Nach
  höchstens 100 Zeilen bzw. ungefähr einer Sekunde wird der Fortschritt gespeichert.
  Ein einzelner Datensatz und seine Trigger müssen vor dem Checkpoint fertig werden.
- Der Index `(company_id,id)` unterstützt die fortsetzbaren Protokollscans.
  Auditfenster enthalten bis zu 2.000 Einträge, ebenfalls mit Zeitbudget.
- Die unabhängige Abschlussprüfung bekommt eigene Tabellen-, Zeilen- und
  Protokollcursor. Ein Verarbeitungscheckpoint gilt weiterhin nicht als Löschbeleg.
- Referenzen und Namen können während der gesamten Prüfung nicht erneut in
  bereits geprüfte Unternehmenstabellen geschrieben werden. Andere Mitarbeiter
  bleiben bearbeitbar. Die Freigabe ist an den bestehenden privaten
  Transaktionskontext gebunden; es werden keine Trigger abgeschaltet.
- Die Edge Function bündelt bis zu sechs Prüfschritte pro Antwort. Das Portal
  setzt offene Schritte automatisch fort und zeigt Phase und geprüfte Einträge.
  Bei einem Timeout erklärt die Oberfläche die sichere Fortsetzung.

## Prüfung

Die bestehende SQL-Integration prüft Eigentümerrechte, falsche Namen, veraltete
Bestätigung, Löschsperren, verbleibende Dateien, fremde Unternehmen, geteilte
Logins, Monatsabschlüsse, gemischte Auditdaten und veraltete Browserstände.

Zusätzlich: 205 gespeicherte Planungsdatensätze mit zwei JSON-Spalten über mehrere
Fenster; exakter Vorher/Nachher-Vergleich eines Objekts mit 4.000 Schlüsseln;
verbleibender Auditdatensatz hinter dem ersten Prüffenster; Schutz vor
erneutem Eintragen des Namens während `DATABASE_DONE`; Backend-Fortsetzung
ohne voreilige Erfolgsmeldung; bestehende Desktop-/Mobil-Dialogprüfung.

Isolierter Vergleich des 4.000-Schlüssel-Objekts: bisher 4.763 ms, optimiert 199 ms.
Das ist ein synthetischer Vergleich derselben Bereinigungsregeln, keine Aussage
über die Gesamtdauer einer produktiven Mitarbeiterlöschung.

Produktive Prüfung ohne Schreibzugriff: Berechnung der bereinigten Version des
größten gespeicherten Planungspayloads (rund 4,7 MB entpackte JSON-Struktur) mit
294 Referenzen in 2.511 ms. Der gespeicherte Datensatz und der Löschauftrag
wurden dabei nicht verändert.
