# Auswertungs-Dashboard

Der Bereich unterscheidet Plan, vollständige erfasste Arbeit und bestätigte Arbeit. QR-Dienste werden auch ohne Dienstplanbuchung berücksichtigt; sich überschneidende Zeiten desselben Mitarbeiters zählen einmal. Noch laufende QR-Dienste werden als Hinweis angezeigt.

## Umfang

- Woche, Monat, Quartal, Jahr und eigene Zeiträume bis 366 Tage; unabhängiges Bezugsdatum.
- Standort aus Schichtmodellen/QR-Terminals, Planungsteam A–E, Mitarbeiter, Schicht und Personalumfang.
- Nachname/Vorname-Sortierung und weitere Ansichten für Restplanung, Zeitprüfungen und Konflikte.
- Vertrags-SOLL, Profilziel, Plan, Erfasst, Bestätigt, Abwesenheitsgutschrift, Restplanung und SOLL bis heute.
- Kalender nach Tag und Schicht; gemeinsame Leitungsgruppen zählen einmal, optionaler Wunsch gesondert. Ohne Pflichtbedarf ist die Quote nicht definiert.
- Direkte Navigation zum gewählten Dienstplantag bzw. zur betroffenen Zeitmeldung; keine automatischen Buchungsänderungen.
- Vorperiodenvergleich, Schichtmix, Abwesenheiten und Belastungsverteilung mit verfügbaren Tagen, Nacht-, Wochenend- und Zusatzdiensten.
- Vollständige Excel- und PDF-Exporte mit allen gefilterten Daten, Filterumfang, Datenstand, Zeitzone und Definitionen. Darstellungspaginierung begrenzt keinen Export.

## Datengrenzen

Die Besetzung beschreibt den gesamten Standortbedarf und bleibt unabhängig von Personen-/Teamfiltern. Standort-/Schichtfilter erzeugen keine anteiligen Vertragsdefizite. Persönliche Monatsziele gelten nur gemäß der eingestellten SOLL-Methode und ihrem Wirksamkeitsdatum. Abgeschlossene vollständige Monate verwenden gespeicherte SOLL-, Arbeits- und Gutschriftwerte. Bestätigte Buchungen eines Standort-/Schichtanteils sind Live-Daten und kein abgeschlossener Kontosaldo. Plan folgt dem Dienstbeginn; erfasste Zeit folgt den Kalendergrenzen der Unternehmenszeitzone.

## Sicherheit und Prüfung

Die Schnittstelle `manager_reports_workspace` akzeptiert einen Monatsabschnitt bis 31 Tage. Der private, ausdrücklich auf den angemeldeten Unternehmensmanager begrenzte Datenzugriff speist eine öffentliche SECURITY-INVOKER-Schnittstelle. Zeitdaten werden nur bei vorhandenen Zeitverwaltungsrechten geliefert. Anonyme Aufrufe, Fremdmandanten und reine Zeiterfassungszugänge sind gesperrt. Unternehmens-, Benutzer-, Rollen- und Berechtigungswechsel verwerfen Daten und offene Antworten.

Prüfung: bestehende Testsuite einschließlich 12 Berechnungstests; Browserprüfung mit Produktionsmodulen und tatsächlichen PDF-/Excel-Bibliotheken (Filter, Kalender, Navigation, vollständige Downloads, Desktop/Mobil, beide Farbschemata, Ladefehler und Zugangsumstellung). Live-Datenbanktests prüften gesperrte Zugänge und eine ausschließlich planende Rolle mit vollständig zurückgerollter fiktiver Mitgliedschaft. Ein abgeschlossener Monat stimmte bei 20 von 20 Mitarbeitern in SOLL, Gutschrift und bestätigter Arbeit mit dem gespeicherten Abschluss überein.
