# Monatsabschluss und Exporte – Prüfung vom 18.10.2026

## Umfang und Ergebnis

Geprüft wurden Monatsabschluss, Wiederöffnung, Stundenkonten, gespeicherte Monatsberichte, Einzel-/Gesamtexporte als Excel und PDF, die Auswertungsübersicht sowie DATEV LODAS (.txt/.sic). Die Datenbankprüfungen liefen mit fiktivem Unternehmen und fiktivem Mitarbeiter in zurückgerollten Untertransaktionen. Dabei wurden echte Produktionsfunktionen mit der Datenbankrolle `authenticated` und simuliertem JWT-Kontext verwendet. Es wurden keine echten Monate abgeschlossen oder wieder geöffnet.

## Gefundene und behobene Fehler

1. **Startsaldo trotz Monatsabschluss änderbar:** Der bestehende Sperrtrigger war nur an der alten Tabelle `employee_time_account_openings` installiert. Die aktive Funktion schreibt in `time_account_openings`. Der gleiche Trigger schützt nun auch diese Tabelle, einschließlich der vorhandenen kontrollierten Ausnahme für Mitarbeiterlöschung. Updates, rückwirkende Inserts, Deletes und das Verschieben eines geschützten Startsaldos sind gesperrt. Zukünftige, bisher nicht betroffene Starts bleiben möglich.
2. **Falscher Monatsbezug bei Nachtschichten:** Die Abschlussprüfung verwendete das UTC-Enddatum der Schicht statt der Überschneidung mit dem lokalen Monat. Nun werden alle betroffenen lokalen Monatsintervalle berücksichtigt; dasselbe gilt für noch zu prüfende manuelle Zeiten und laufende manuelle Buchungen.
3. **Vollständig erfasste QR-Schicht als fehlende Ist-Zeit markiert:** Vollständige, beendete und zusammengeführte bezahlte Zeitintervalle decken nun eine veröffentlichte Schicht auch ohne redundanten manuellen Eintrag ab. Teilweise QR-Abdeckung reicht weiterhin nicht zur automatischen Freigabe.
4. **Monatsabschluss löste eigene Statusabfragen aus:** Der MutationObserver reagierte auf seine eigenen Statusänderungen. Er berücksichtigt jetzt relevante Änderungen am Stundenkonto und ignoriert die eigene Statusleiste, Dialoge und Exportstatusänderungen.
5. **Wechsel während Bestätigung/Export:** Der Abschlussdialog und laufende Excel-/PDF-/DATEV-Exporte sind an Unternehmen, Benutzer, Rolle, Client und ausgewählten Monat gebunden. Veraltete Antworten/DATEV-Vorprüfungen führen zu keinem Download oder Abschluss für eine andere Auswahl. Die Mitarbeiterliste wird bei einem Kontextwechsel ersetzt.
6. **Mitarbeiternamen als HTML in Exportauswahl:** Optionen werden über die DOM-Text-API erstellt. Namen mit HTML-Zeichen bleiben Text.
7. **Dialog auf kleinen Geräten:** Monatsabschlussdialog passt auf 360/390 Pixel, hat einen benannten Dialog, zugeordnete Eingabebeschriftungen, Escape und Tastaturfokusbegrenzung. Abschluss-/Wiederöffnungsaktionen werden nur OWNER/ADMIN angeboten.

## Datenbanknachweise

- September 2026, 40 Wochenstunden, Sachsen: SOLL 10.560 Minuten; bestätigte Arbeit 480; Fortbildungsgutschrift 480; Monats-IST 960; Startsaldo +60; kumulierter Saldo −9.540 Minuten.
- Fehlende Ist-Zeit blockiert den Abschluss.
- Abschluss Revision 1 → Wiederöffnung mit Pflichtgrund Revision 2 → erneuter Abschluss Revision 3.
- Geschlossene Monatswerte und 30 Tageszeilen stimmen mit dem gespeicherten Bericht überein. Eine spätere Änderung der Wochenstunden verändert den geschlossenen Snapshot nicht. Nach Wiederöffnung/erneutem Abschluss werden die korrigierten Werte übernommen.
- Änderungen an Ist-Zeiten, Abwesenheiten, Kontoeinstellungen und betroffenem Startsaldo werden nach Abschluss abgewiesen.
- DATEV-Freigabe erzeugt einen Audit-Eintrag. Falsche Revision und offener Monat werden abgewiesen. Mitarbeiter erhalten weder den vollständigen Monatsbericht noch Wiederöffnung oder DATEV-Freigabe.
- QR-Abdeckung: Vorher `missing=1`, nach Korrektur `missing=0`; zusätzliche unbelegte Nachtschicht September/Oktober: `missing=1`.
- Reproduzierbar: `tests/sql/month-close-exports-rollback.sql` und `tests/sql/month-close-period-rollback.sql`.

Alle geprüften Bestandszahlen vor und nach den Tests identisch: 2 Monatsabschlüsse, 759 Ist-Zeiten, 10.365 Schichtzuweisungen, 40 Abwesenheiten, 5 Unternehmen, 84 Mitarbeiter, 12 Auth-Benutzer und 94.463 Audit-Ereignisse. Keine fiktiven Testunternehmen verbleiben.

## Browser und Dateien

- Produktionsmodule mit tatsächlichen Exportbibliotheken, fiktiven RPC-Antworten und blockierten externen Anfragen; 1440, 390 und 360 Pixel.
- Bestätigung, Pflichtgrund, Verbindungsfehler und erneuter Versuch, Sperre/Freigabe von Eingaben sowie Rollen-/Unternehmens-/Monatswechsel geprüft.
- Einzel-Excel: 30 Tageszeilen; Gesamt-Excel: 35 Mitarbeiter und 1.050 Tageszeilen. Daten sind Zahlen; alle Mitarbeiter werden exportiert.
- Einzel- und Gesamt-PDF: jeweils 2 Seiten; Beschriftungen, Summen, wiederholte Tabellenköpfe und Seitenzahlen kontrolliert. Zusätzlich zum Poppler-Render erfolgte wegen fehlerhafter lokaler Fontsubstitution eine Gegenprüfung mit MuPDF.
- Auswertungsbericht: 8 Excel-Blätter; gewählte Filter gelten für alle 17 Mitarbeiter der Auswahl einschließlich Folgeseiten; 12 PDF-Seiten. Fehlerhafte Teilabfragen erzeugen keinen Download. Zeitraumaufteilung, responsive Darstellung und Unternehmenswechsel geprüft.
- DATEV .txt und .sic: richtige Endung, ASCII, CRLF, Satzkopf und Bewegungsdaten; Download erst nach erfolgreicher Serverfreigabe. Abgewiesene Freigabe und veraltete Vorprüfung erzeugen keine Datei.
- Kein Import in ein externes Lohnabrechnungsprogramm durchgeführt; die Prüfungen betreffen Dateierzeugung, Format und Freigabe in SchichtFunk.

## Prüfergebnis

950 automatisierte Tests bestanden, Build und alle 5 IONOS-Prüfungen erfolgreich. Beide Browserprüfprogramme bestanden. Beide Datenbankmigrationen wurden angewendet und ihre Fehlerkorrekturen anschließend mit zurückgerollten Produktions-RPC-Tests bestätigt.

## Wiederholbare Prüfungen

```sh
npm test
npm run build
npm run test:ionos
node tests/browser/month-close-exports-qa.cjs
node tests/browser/reports-workspace-qa.cjs
```

Die beiden neuen Postgres-Regressionstests sind in `npm test` eingebunden. Der Workflow `Month close and exports` führt die fokussierten Berechnungs-/Datenbanksimulationen und den neuen Browsertest bei relevanten Pull Requests aus. Die SQL-Rollbacktests werden gezielt über den autorisierten Datenbankzugang ausgeführt.

## Bedienweg

**Personal → Arbeitszeit → Stundenkonto**: Monat auswählen, Status/Prüfpunkte kontrollieren, anschließend „Monat abschließen“. Excel/PDF befinden sich im gleichen Stundenkonto. **Personal → Abrechnung** enthält DATEV-Vorprüfung und Export für den abgeschlossenen Abrechnungsmonat.
