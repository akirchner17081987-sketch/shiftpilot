# Schnellerer Start und Auto-Planung

Stand: 11.10.2026. Ausgangsrelease: `e6b9ee5867b53eb51c9b7f275d04a8e8f60be4db`.

## Änderungen

- Die 56 Basismodule und die 29 Verwaltungsmodule werden je Phase gleichzeitig angefordert. Klassische Skripte mit `async=false` werden weiterhin in ihrer bisherigen Reihenfolge ausgeführt. Die Anmeldung beginnt erst nach Abschluss der Basisphase. Mitarbeitende erhalten weiterhin keine nachgeladene Verwaltungsphase.
- Datums- und Zeitformatierer werden je Unternehmenszeitzone wiederverwendet. Die vollständigen Dienstzuweisungen bleiben verfügbar, einschließlich der Nachbardienste für Monatswechsel und Erholungsregeln.
- Die Anzeige zählt gespeicherte Dienste einmal je Durchlauf. Pflicht- und optionale Bedarfe verwenden denselben Zähler; gemeinsame Leitungsbesetzung wird weiterhin von der bestehenden Schichtmodelllogik geprüft.
- Stunden und Dienstzahlen werden einmal pro Dienst auf die Mitarbeitenden verteilt. Die Zuordnung im Treppenmuster verwendet einen Index nach Mitarbeiter und Datum.
- Mehrmonatige Vorschauen zeigen einen auswählbaren Monat. Stunden, SOLL, Dienstzahlen und offene Positionen gelten weiterhin für den gesamten ausgewählten Zeitraum. Die Monatswahl verändert keine Planung.
- Tagesvorschläge werden beim Aufklappen aufgebaut. „Alle Tage öffnen“ zeigt weiterhin alle Besetzungen. Identische Inhalte werden beim erneuten Anzeigen nicht erneut in den DOM geschrieben; Änderungen an Namen und Vorschlägen werden berücksichtigt.
- Listen mit mehr als 60 offenen Schichtgruppen sind durchblätterbar. Alle Gruppen, Gründe und Links bleiben erreichbar; die Zahl der offenen Positionen wird nicht auf die sichtbare Seite begrenzt.
- Optional nicht besetzte Dienste bleiben getrennt als „Keine Pflichtlücke“ sichtbar. Das Hilfecenter erklärt die Vorschau und Navigation.

## Prüfung

- Funktionsregression: Vorschläge bleiben getrennt vom echten Plan; Abbrechen, Bestätigung, Stundengrenzen, Zeitregeln, Pflicht-/optionale Besetzung und gemeinsame Leitung bleiben geprüft.
- Neue Tests: verzögerte Anmeldung, gleichzeitige Modulanforderung, Ausführungsreihenfolge, Trennung der Mitarbeiterphase, Datumswechsel und Sommerzeit, vollständige Jahresstunden und erreichbare offene Positionen.
- Browserprüfung auf GitHub Actions mit echten ausgelieferten Loader-/Planungsdateien und isolierten Daten. Der Leistungsvergleich nutzt 40 fiktive Mitarbeitende, zwölf Monate und 8.640 Dienste. Der Ladetest setzt eine kontrollierte Verzögerung von 30–54 ms pro Datei. Die Artefakte enthalten `metrics.json` und Aufnahmen für 320–1440 px in Hell/Dunkel.
- Zusätzlich werden die bestehenden Browserabläufe für Auto-Planung und Veröffentlichung geprüft. Der IONOS-Build führt die neue Browserprüfung vor dem Hochladen aus.

Die Vergleichszeiten sind Messungen unter diesen Testbedingungen. Sie sind keine Zusage über die Ladezeit auf einem bestimmten Endgerät und keine Messung einer angemeldeten Produktionssitzung. Es werden keine realen Dienste, Anträge oder Mitarbeiterdaten verändert.
