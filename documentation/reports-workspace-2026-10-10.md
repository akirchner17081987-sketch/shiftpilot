# Auswertungs-Dashboard

Der Bereich unterscheidet Plan, vollst�ndige erfasste Arbeit und best�tigte Arbeit. QR-Dienste werden auch ohne Dienstplanbuchung ber�cksichtigt; sich �berschneidende Zeiten desselben Mitarbeiters z�hlen einmal. Noch laufende QR-Dienste werden als Hinweis angezeigt.

## Umfang

- Woche, Monat, Quartal, Jahr und eigene Zeitr�ume bis 366 Tage; unabh�ngiges Bezugsdatum.
- Standort aus Schichtmodellen/QR-Terminals, Planungsteam A-E, Mitarbeiter, Schicht und Personalumfang.
- Nachname/Vorname-Sortierung und weitere Ansichten f�r Restplanung, Zeitpr�fungen und Konflikte.
- Vertrags-SOLL, Profilziel, Plan, Erfasst, Best�tigt, Abwesenheitsgutschrift, Restplanung und SOLL bis heute.
- Kalender nach Tag und Schicht; gemeinsame Leitungsgruppen z�hlen einmal, optionaler Wunsch gesondert. Ohne Pflichtbedarf ist die Quote nicht definiert.
- Direkte Navigation zum gew�hlten Dienstplantag bzw. zur betroffenen Zeitmeldung; keine automatischen Buchungs�nderungen.
- Vorperiodenvergleich, Schichtmix, Abwesenheiten und Belastungsverteilung mit verf�gbaren Tagen, Nacht-, Wochenend- und Zusatzdiensten.
- Vollst�ndige Excel- und PDF-Exporte mit allen gefilterten Daten, Filterumfang, Datenstand, Zeitzone und Definitionen. Darstellungspaginierung begrenzt keinen Export.

## Datengrenzen

Die Besetzung beschreibt den gesamten Standortbedarf und bleibt unabh�ngig von Personen-/Teamfiltern. Standort-/Schichtfilter erzeugen keine anteiligen Vertragsdefizite. Pers�nliche Monatsziele gelten nur gem�� der eingestellten SOLL-Methode und ihrem Wirksamkeitsdatum. Abgeschlossene vollst�ndige Monate verwenden gespeicherte SOLL-, Arbeits- und Gutschriftwerte. Best�tigte Buchungen eines Standort-/Schichtanteils sind Live-Daten und kein abgeschlossener Kontosaldo. Plan folgt dem Dienstbeginn; erfasste Zeit folgt den Kalendergrenzen der Unternehmenszeitzone.

## Sicherheit und Pr�fung

Die Schnittstelle `manager_reports_workspace` akzeptiert einen Monatsabschnitt bis 31 Tage. Der private, ausdr�cklich auf den angemeldeten Unternehmensmanager begrenzte Datenzugriff speist eine �ffentliche SECURITY-INVOKER-Schnittstelle. Zeitdaten werden nur bei vorhandenen Zeitverwaltungsrechten geliefert. Anonyme Aufrufe, Fremdmandanten und reine Zeiterfassungszug�nge sind gesperrt. Unternehmens-, Benutzer-, Rollen- und Berechtigungswechsel verwerfen Daten und offene Antworten.

Pr�fung: bestehende Testsuite einschlie�lich 12 Berechnungstests; Browserpr�fung mit Produktionsmodulen und tats�chlichen PDF-/Excel-Bibliotheken (Filter, Kalender, Navigation, vollst�ndige Downloads, Desktop/Mobil, beide Farbschemata, Ladefehler und Zugangsumstellung). Live-Datenbanktests pr�ften gesperrte Zug�nge und eine ausschlie�lich planende Rolle mit vollst�ndig zur�ckgerollter fiktiver Mitgliedschaft. Ein abgeschlossener Monat stimmte bei 20 von 20 Mitarbeitern in SOLL, Gutschrift und best�tigter Arbeit mit dem gespeicherten Abschluss �berein.
