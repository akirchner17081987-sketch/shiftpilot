# Audit-Logs

Der vollständige Audit-Verlauf steht Inhabern und Administratoren unter **Auswertung & Kontrolle → Audit-Logs** zur Verfügung. Teamleiter und Mitarbeiter erhalten keinen Zugriff auf das vollständige Audit-Protokoll.

## Finden und vergleichen

- Suche nach Mitarbeiter, Personalnummer, Schichtkennung, Begründung oder Audit-/Objekt-ID. Der Suchtext wird als Text gesucht; Zeichen wie `%` und `_` sind keine Platzhalter.
- Filter für Bereich, Bearbeiter (einschließlich System) und konkrete Aktion. Die Auswahlmöglichkeiten bleiben unabhängig von den geladenen Treffern verfügbar.
- Gesamter Verlauf, Monat, Quartal, Jahr oder eigener Zeitraum. Das Bis-Datum ist einschließlich; Grenzen und Zeitstempel verwenden die hinterlegte Unternehmenszeitzone und berücksichtigen die Sommerzeit.
- Die Anzeige nennt geladene und insgesamt passende Ereignisse. **Weitere 50 laden** ergänzt ältere Einträge ohne die bisherige Begrenzung auf 500. Zeitstempel und Audit-ID bilden zusammen die Seitenmarkierung.
- Details zeigen fachliche Feldänderungen, Begründung/Bemerkung, Bearbeiter und dessen Rolle zum Ereignis. Historische Rollen werden mit der damaligen Bezeichnung erklärt. Technische IDs und ursprüngliche Werte bleiben aufklappbar. Bestehende Mitarbeiter und Schicht-/Zeiteinträge lassen sich bei passender Berechtigung direkt öffnen; gelöschte Datensätze können fehlen.

## Vorgänge bündeln

Neue Ereignisse erhalten beim Einfügen die Datenbank-Transaktionskennung und die gespeicherte Hauptrolle des Bearbeiters. Ereignisse derselben Transaktion und desselben Bearbeiters werden bei aktiviertem **Vorgänge bündeln** zusammen angezeigt. Der Gruppenzähler nennt die bereits geladenen Ereignisse; weitere Seiten können die Gruppe ergänzen. Die einzelnen Protokolle bleiben zugänglich.

Historische Ereignisse ohne eindeutige Transaktionskennung bleiben einzeln. Es erfolgt keine nachträgliche Änderung alter Audit-Einträge und keine Zuordnung allein anhand ähnlicher Uhrzeiten. Datenschutz-Löschprozesse und die vorhandenen Audit-Schutzmechanismen bleiben wirksam.

## CSV und PDF

Beide Exporte laden alle Treffer der angewendeten Auswahl in Seiten von 1.000 nach. Unternehmensname, Filter, Erstellungszeitpunkt, Zeitzone, Audit-IDs und Feldänderungen werden mit ausgegeben. CSV nutzt UTF-8 mit BOM und Semikolon; potenzielle Tabellenformeln werden als Text ausgegeben. PDF erstellt einen lesbaren Prüfbericht mit Seitenzahlen.

Die Auswahl und der beim Laden festgelegte obere Zeitstempel gelten für den Export. Änderungen der Auswahl oder des Unternehmens brechen einen laufenden Export ab. Bei Verbindungsfehlern oder unvollständigen Daten wird keine Teil-Datei ausgegeben. Bei neuen Ereignissen zuerst **Aktualisieren** verwenden. PDF benötigt die gleichen fest versionierten PDF-Bibliotheken wie die bestehenden SchichtFunk-Berichte.

## Prüfung

Unit-Prüfungen decken Sommerzeitgrenzen, Unternehmenszeitzone, Feldvergleich und CSV-Formelschutz ab. Browser-Prüfungen verwenden ausschließlich künstliche Daten und prüfen ältere Suchtreffer, gleiche Zeitstempel beim Nachladen, stabile Filter, Navigation, beide Farbmodi, mobile Breiten, vollständige CSV-/PDF-Exporte, Wiederholung nach Fehlern, veraltete Antworten nach Unternehmenswechsel und Rollenentzug. Die Datenbank wurde zusätzlich unter Benutzerrechten auf Seitenabfrage und Zugriffssperren geprüft.
