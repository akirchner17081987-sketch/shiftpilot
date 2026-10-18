# QR-Zeiterfassung – Prüfung vom 18. Oktober 2026

## Ergebnis

Der technische Ablauf von PIN-Anmeldung, Arbeitsbeginn, Pause, Pausenende und Arbeitsende wurde erfolgreich geprüft. Wiederholte Anfragen erzeugen keine zusätzlichen Buchungsereignisse. Eine gespeicherte Anfrage lässt sich nach verlorener Antwort anhand ihrer Kennung eindeutig bestätigen.

Bei einer fiktiven, über die echte Korrektur-API auf acht Stunden gesetzten Buchung mit 20 Minuten bezahlter Pause zeigen Mitarbeiterbuchungen, Stundenkonto und Verwaltung dieselben Werte: 480 Minuten Anwesenheit beziehungsweise bestätigte Arbeitszeit und separat 20 Minuten Pause. Bezahlte Pausen werden nicht abgezogen.

Die QR-Berechnung erforderte keine Änderung. Beim tatsächlichen Wechsel zwischen „Meine Schichten“ und „Arbeitszeit“ fiel ein Navigationsfehler auf: Eine erneute Aktualisierung derselben Ansicht löste im Orbit-Menü fälschlich das Schließen für einen Seitenwechsel aus. Der Fehler wurde vor der Korrektur durch eine ausdrückliche Regression reproduziert. Jetzt schließt die Beobachtung nur bei einer tatsächlich anderen Ansicht. Ein verzögerter Fokuswechsel übergeht außerdem kein inzwischen erneut geöffnetes Menü. Der Index erhält eine neue Cachekennung für das Modul.

## Ausgeführte Prüfungen

### Produktive Datenbankfunktionen mit zurückgerollten Testdaten

Die drei Skripte unter `tests/sql/qr-workflow-*-rollback.sql` verwenden ausschließlich fiktive Benutzer, Mitarbeiter, Unternehmen und Terminals. Die Buchungs- und PIN-Funktionen werden unter der tatsächlichen Datenbankrolle `service_role` aufgerufen; Mitarbeiter-Lesezugriffe unter `authenticated`. Die JWT-Kontexte für Mitarbeiter und Verwaltung werden simuliert. Alle Änderungen einschließlich PIN-Daten, Sitzungen und Audit-Ereignissen werden durch eine absichtlich ausgelöste und gezielt abgefangene Ausnahme in Untertransaktionen vollständig zurückgerollt.

- `qr-workflow-actions-rollback.sql`: persönlicher PIN-Einrichtungscode, Anmeldung, verpflichtende PIN ohne Eintrittsdatum-Rückfall, alle vier Buchungsaktionen, Wiederholung jeder Kennung, Statusbeleg für jede gespeicherte Aktion und Sperre eines weiteren Arbeitsbeginns. Vier Aktionen ergeben genau vier Ereignisse. Auditiertes Setzen einer historischen Achtstundenschicht und Abgleich mit eigenen QR-Buchungen, Mitarbeiter-Stundenkonto und zentraler Verwaltung.
- `qr-workflow-periods-rollback.sql`: gleichzeitig vorhandene manuelle Zeit und QR-Zeit werden zusammengeführt und zählen acht statt fünfzehn Stunden. Ein Nachtdienst am Monatswechsel wird nach Unternehmenszeitzone in 120 Minuten September und 360 Minuten Oktober geteilt. Zeitumstellung im Frühjahr ergibt sieben reale Stunden, im Herbst neun. Offene Dienste bleiben vorläufig und verhindern den Monatsabschluss. Mitarbeiterkonto, Tagesbericht und Verwaltungsübersicht ergeben für September übereinstimmend 600 Minuten. Mitarbeiter erhalten keinen Verwaltungszugriff.
- `qr-workflow-safety-rollback.sql`: zehn Pausen möglich, elfte Pause abgewiesen; offene Pause endet beim Ausstempeln exakt mit dem Dienst. Fremdes Terminal, abgelaufene Sitzung, deaktiviertes Terminal, deaktivierter Mitarbeiter und PIN-Zurücksetzen verhindern den weiteren Zugriff. Fremder Verwaltungsabruf und direkter Aufruf des Buchungs-RPCs durch normale Benutzer sind gesperrt.

Ein anfänglicher Testfehler betraf die Ausführung aller Aktionen in einem einzigen Verwaltungsstatement: `statement_timestamp()` bleibt darin unverändert, während neue Serverbuchungen mit `clock_timestamp()` entstehen. Solche gerade innerhalb desselben Statements erzeugten Enden liegen nach dessen Auswertungsstichtag und werden folgerichtig nicht als abgeschlossene Zeit gezählt. Der endgültige Test verwendet für den historischen Stundenabgleich die echte Korrektur-API mit einem Ende vor diesem Stichtag. Ein weiterer Testvergleich wurde an die tatsächlich verwendete deutsche Fehlermeldung angepasst. Dies waren Testvoraussetzungen, keine Fehler der Zeitberechnung.

Vorher und nachher unverändert: 12 Auth-Benutzer, 84 Mitarbeiterdatensätze, 5 Unternehmen, 6 Terminals, 12 unabhängige QR-Dienste, 17 Pausen, 55 Ereignisse, 2 Sitzungen und 759 manuelle Zeiteinträge. Keine Benutzer oder Unternehmen mit den Testpräfixen sind zurückgeblieben.

### Browser und isolierte Tests

- 61 gezielte Node-/PostgreSQL-Tests für PIN/Edge-Handler, Wiederholungen, Pause, Live-Dauer, zentrale Zeiten und Verwaltungs-Korrektur bestanden.
- 58 Chromium-Tests auf Desktop und Handy aus `qr-pause-total.spec.cjs`, `qr-reliable.spec.cjs` und `qr-central-time.spec.cjs` bestanden. Abgedeckt sind verlorene Antworten, unbekannter Buchungsstatus, Wiederholung mit gleicher Kennung, Nachtdienst, Zeitumstellung, falsche Geräteuhr, Abmeldung, Korrektur nach Versionskonflikt und zentraler Stundenabgleich.
- Eigene QR-Buchungen in der vollständigen aktuellen Anwendung auf 1440, 390 und 360 Pixeln geprüft: aktuelle Orbit-Navigation, derselbe Bereich nach Aktualisierung, echte Bereichswechsel, zehn Pausen, Uhrzeiten, Filter, weitere Einträge, Monatswechsel, Fehlerzustände, verspätete Antworten, Benutzerwechsel und Schutz vor eingefügtem HTML. Der frühere Test verwendete noch die ausgeblendete Seitenleiste und wurde entsprechend aktualisiert. Die Prüfung läuft künftig auch in der Orbit-CI.
- Mitarbeiter-Stundenkonto auf drei Bildschirmgrößen bestanden: Monatswerte, Formatwechsel, CSV, Verlauf, ausstehende Einträge, Fehler, verspätete Antworten und Benutzerwechsel.
- Verwaltungsansichten für Monat, Quartal und Jahr bestanden: disjunkte Anfragen, begrenzte Parallelität, Suche, Details, freie Datumsbereiche, Teilfehler und Unternehmenswechsel.
- Zusätzliche Portalprüfung: 13 Ansichten in vier Kombinationen aus Desktop/Handy und hell/dunkel, insgesamt 52 Ansichtsprüfungen, bestanden.
- Nach der Navigationskorrektur: alle 948 Regressionstests, Produktionsbuild und `git diff --check` bestanden.

## Grenzen

Die Browserfälle verwenden kontrollierte Serverantworten und die Datenbankfälle simulierte Anmeldekontexte. Eine interaktive Anmeldung mit echten Mitarbeiterkonten, reales Scannen mit einer Handykamera, ein Mobilfunk-Feldversuch und ein Lasttest mit mehreren gleichzeitig schreibenden Datenbanksitzungen wurden nicht durchgeführt. Fehler nach Antwortverlust und Wiederholungslogik wurden technisch geprüft; ein tatsächlicher Mobilfunkwechsel bleibt ein eigener Praxistest.
