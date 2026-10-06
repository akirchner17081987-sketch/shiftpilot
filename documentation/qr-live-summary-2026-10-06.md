# Live-Anzeige nach der Mitarbeiter-QR-Anmeldung

`qr-time.html` zeigt direkt nach Anmeldung die vier Werte der aktuellen Buchung:

- Dienstbeginn mit Uhrzeit und Datum in der Unternehmenszeitzone.
- Anwesenheitszeit als Stunden, Minuten und Sekunden.
- Gesamtdauer aller gebuchten Pausen; die offene Pause zählt mit.
- Standort und Standortbeschreibung des ursprünglichen Buchungs-Terminals.

Die Anwesenheitszeit umfasst sämtliche bezahlten Pausen. Sie wird anhand der
gespeicherten serverseitigen Zeitpunkte berechnet. Laufende Buchungen zählen
jede Sekunde weiter, ohne pro Sekunde weitere Anfragen oder Buchungen zu senden.
Die Serverzeit der letzten Antwort und die monotone Browseruhr verhindern,
dass eine falsch eingestellte Geräteuhr oder deren Umstellung die Anzeige
verfälscht. Beim Zurückkehren zur Seite werden die Werte sofort nachgeführt.

Nach Dienstende bleiben die Endwerte stehen. Eine neue Buchung beginnt wieder
bei null. Abmeldung entfernt die persönlichen Werte und beendet den Timer.
Vor dem Arbeitsbeginn werden der angemeldete Standort und 00:00:00 angezeigt.
Nach einem Scan an einem anderen Terminal desselben Unternehmens zeigt eine
bereits laufende Buchung weiterhin ihren ursprünglichen Standort.

## Umsetzung und Prüfung

Die Migration `20261006040336_qr_employee_live_summary.sql` ergänzt ausschließlich
`terminal_name`, `location_note`, `timezone` und `as_of` in der bestehenden
QR-Antwort. Anmeldung, Unternehmensgrenzen, Sperren, Zehn-Pausen-Grenze und
automatischer Pausenabschluss bei Dienstende werden unverändert beibehalten.
Die Anzeige setzt Standorttexte mit `textContent` ein.

Die isolierte CI-Prüfung verwendet fiktive Daten und abgefangene Anfragen:

- Laufender Nachtdienst, bezahlte Pause, Dienstende, neue Buchung und Abmeldung.
- Falsche Geräteuhr sowie Gerätezeitänderung während der Anzeige.
- Lange Namen und Standorte bei 320, 390 und 1280 Pixeln sowie größere Schrift.
- PostgreSQL: tatsächlicher Buchungsstandort, Serverzeit, bezahlte Dauer und
  Zugriffsgrenzen zwischen Terminals/Unternehmen.

Authentifizierte Tests gegen Produktionsdaten starten künftig nur über die
ausdrückliche manuelle Auswahl im allgemeinen Regressionstest-Workflow.
Die automatischen Funktions- und isolierten Browserprüfungen bleiben aktiv.
