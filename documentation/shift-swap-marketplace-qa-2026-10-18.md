# Schichttausch und Marktplatz – Prüfung vom 18. Oktober 2026

## Befund und Korrektur

Der direkte Tausch scheiterte bereits beim Ermitteln geeigneter Kollegen: `sf_swap_candidate_reason` rief die allgemeinen Schichtregeln auf, deren geschützte Abwesenheitsprüfung nur den eigenen Mitarbeiter oder eine berechtigte Verwaltung zulässt. Der anfragende Mitarbeiter erhielt deshalb für einen sonst geeigneten Kollegen `Nicht berechtigt`.

Migration `20261018075716_shift_swap_candidate_availability.sql` führt die für diesen Ablauf erforderliche Verfügbarkeitsprüfung innerhalb des internen Tauschhelfers aus. Sie prüft Unternehmen, beteiligten aktiven Zugang, Veröffentlichung, Zukunft, Schichtfreigabe, Dauer, Überschneidung, wirksame ganztägige/teilweise Abwesenheit und Ruhezeiten mit den Unternehmenswerten. Sie gibt keine Abwesenheitskategorien, Notizen oder Personaldaten zurück. Die allgemeine Abwesenheitsfunktion bleibt unverändert geschützt. Der Helfer hat einen leeren Suchpfad und keine Ausführungsrechte für PUBLIC, anon oder authenticated; die vorhandenen kontrollierten RPCs rufen ihn intern auf.

Ein zweiter Befund betraf den Dialog auf kleinen Handys: `96vw` plus Außenabstand konnte über die Bildschirmkante hinausragen. Die Dialogbreite richtet sich jetzt nach dem verfügbaren Platz. Der Modulaufruf erhält eine neue Cachekennung.

## Ausgeführte Datenbanktests

Die folgenden Skripte wurden über die Verwaltungsverbindung gegen die produktiven RPCs ausgeführt. Sie verwenden ausschließlich fiktive Benutzer, Mitarbeiter und Unternehmen. Jeder Fall läuft in einer Untertransaktion; ein absichtlicher, gezielt abgefangener Testfehler rollt sämtliche Einträge einschließlich Benachrichtigungen und Audit-Ereignissen zurück.

- `tests/sql/shift-swap-rollback.sql`: neun Fälle – Freigabe, Ablehnung durch Kollegen, Ablehnung durch Disposition, Rückzug, veraltete Schichtversion, Überschneidung, genehmigte Abwesenheit, fehlende Ruhezeit, entzogene Schichtfreigabe. Nur die Freigabe überträgt genau einen vorhandenen Dienst.
- `tests/sql/employee-marketplace-rollback.sql`: Mitarbeiterangebot, Sichtbarkeit beim Kollegen, Anfrage ohne vorzeitige Dienstplanänderung, Freigabe, Ablehnung und Rückzug. Eigene Übernahme und Mitarbeiter-Selbstfreigabe werden abgewiesen.
- `tests/sql/open-shift-marketplace-rollback.sql`: Veröffentlichung begrenzt auf den tatsächlichen Bedarf, keine doppelten Angebote, zwei konkurrierende Anfragen für einen Platz, Freigabe erzeugt genau einen veröffentlichten Dienst ohne Pausenabzug; zweite und wiederholte Freigabe erzeugen keinen zusätzlichen Dienst.
- `tests/sql/marketplace-withdraw-all-rollback.sql`: Bestätigung und Verwaltungsrechte erforderlich, fremdes Unternehmen und nicht angemeldeter Zugriff gesperrt, beide Angebotsarten samt offenen Anfragen zurückgezogen; bereits übernommene Dienste und abgeschlossene Monate bleiben erhalten.
- `tests/sql/auto-hours-voluntary-market-rollback.sql`: freiwillige Mehrstunden werden angezeigt und erfordern eine ausdrückliche Freigabe; Bestätigung erlaubt 190 statt 180 Stunden und kennzeichnet den Zusatzdienst.

Die ersten Versuche deckten auch veraltete Testvoraussetzungen auf: Pflichtfelder aktiver Mitarbeiter, die Rückgabeform des Mitarbeiterfeeds und das Zurücksetzen beider JWT-Einstellungen. Ein großer Testaufruf scheiterte an der Verwaltungsverbindung und wurde durch die kleineren Skripte ersetzt. Diese Fehler waren keine weiteren Produktfehler. Das endgültige Skript für die veraltete Schicht verwendet eine Versionsänderung als isolierte Simulation, ohne den Schutz veröffentlichter Dienste abzuschalten.

Nach Abschluss entsprechen die Bestände dem Ausgangsstand: 12 Auth-Benutzer, 84 Mitarbeiterdatensätze, 5 Unternehmen, 10.365 Dienste, 10 Tauscheinträge, 67 offene Marktplatzangebote, 0 Übernahmeanfragen. Keine Benutzer der Testpräfixe sind zurückgeblieben. Die Sicherheitsprüfung meldet dieselben 15 Hinweise und 40 vorhandenen Warnungen wie vor der Änderung, keine zusätzlichen Befunde.

## Browser und Regression

`tests/browser/open-shift-marketplace-qa.cjs` besteht auf Desktop dunkel/hell und Handy: Auswahl/Teilbedarf, Abbruch, Wiederholung nach Fehler, Übernahmeanfrage, Verwaltungsfreigabe mit Rhythmusbestätigung sowie Sammelrückzug einschließlich Unternehmenswechsel.

`tests/browser/shift-swap-workflow-qa.cjs` besteht auf Desktop dunkel/hell sowie 390 px dunkel und 360 px hell: Anfrage, Fehler und Wiederholung, Kollegenannahme, Verwaltungsfreigabe und anschließendes Neuladen, Abschlussanzeige für beide Mitarbeiter, Rückzug, Kollegenablehnung und fehlende Kandidaten. Der Dialog passt vollständig auf den Bildschirm. Keine unbehandelten Browserfehler.

`tests/shift-swap-availability.test.mjs` reproduziert den ursprünglichen Fehler mit den echten vorhandenen SQL-Funktionen in isoliertem PostgreSQL und prüft die Korrektur einschließlich unverändert gesperrtem Fremdzugriff auf die allgemeine Abwesenheitsfunktion. Der Test läuft als Teil von `npm test`; die Marktplatz-CI führt beide Browserprüfungen aus.

Abschließend bestanden: **948 Node-/PostgreSQL-Tests**, beide Browserprogramme (insgesamt sieben Ansichtsvarianten), statischer Produktionsbuild und `git diff --check`.

## Grenzen

Die Datenbanktests simulieren Auth-Anfragekontexte; es erfolgt keine interaktive Anmeldung mit echten Mitarbeiterkonten. Die Browserprüfungen verwenden kontrollierte Antworten für Benutzerwechsel und Fehlerfälle. Datenbankablauf und Browserbedienung wurden deshalb getrennt geprüft. Ein tatsächlicher Parallelzugriff mehrerer Datenbanksitzungen, Push-Zustellung auf reale Geräte und ein Lasttest sind damit nicht nachgewiesen.
