# Offene Plätze aus der Auto-Planung

Nach einer Analyse erscheint in der Auto-Planung die Aktion **Offene Plätze auswählen**. Solange noch nicht übernommene Vorschläge vorliegen, bleibt die Aktion gesperrt. Vorschläge zuerst als Entwurf übernehmen oder entfernen.

Im Dialog können Planer einzelne Dienste auswählen und pro Dienst die Anzahl der angebotenen Plätze reduzieren. Ein optionaler Hinweis wird Mitarbeitern angezeigt. Erst **Im Marktplatz veröffentlichen** macht den Bedarf sichtbar. Abbrechen veröffentlicht nichts.

Mitarbeiter finden die Angebote im bestehenden Schicht-Marktplatz. **Schicht übernehmen** reicht eine Anfrage ein. Der Dienstplan wird erst nach der Planerfreigabe ergänzt. Anfragen können vor der Entscheidung zurückgezogen werden; Planer können Angebote zurückziehen oder Anfragen ablehnen.

Bei Anfrage und Freigabe werden der aktuelle Restbedarf, die aktive Schichtart, Beschäftigungszeitraum, Schichtfreigaben, genehmigte Abwesenheiten, Überschneidungen, Ruhezeit, Schichtdauer sowie Wochen- und Monatsstunden geprüft. Die neue Zuweisung hat keinen automatischen Pausenabzug.

Abweichungen von einem Team- oder Mitarbeiterrhythmus werden angezeigt. Eine Freigabe erfordert dann die ausdrückliche Bestätigung der Abweichung. Ändert sich der Rhythmus während der Prüfung, wird die Bestätigung erneut angefordert.

Manuell oder durch weitere Auto-Planung besetzte Plätze verschwinden beim Aktualisieren des Marktplatzes. Geänderte Schichtzeiten, archivierte Schichtarten und abgeschlossene Monate beenden betroffene Angebote. Vollständig besetzte oder zurückgezogene Angebote werden nicht automatisch wieder veröffentlicht.

Normale Dienstplanschreibvorgänge und Marktplatzfreigaben verwenden dieselbe Datenbanksperre pro Unternehmen. Eine Freigabe prüft den Bedarf innerhalb derselben Transaktion erneut. Wiederholte Freigaben erzeugen keinen zusätzlichen Dienst. Datenzugriff und Entscheidungen sind auf das eigene Unternehmen beschränkt und werden protokolliert.

Die vorhandenen Mitarbeiterangebote funktionieren weiter. Der neue Ablauf betrifft die produktive Cloud-Verbindung; der isolierte Demo-Marktplatz nutzt weiterhin seine bisherigen Beispieldaten.

## Prüfung

- `node --test tests/open-shift-marketplace.test.mjs tests/auto-plan-workspace.test.mjs`
- `node tests/browser/open-shift-marketplace-qa.cjs`: Auswahl, Teilbedarf, Abbrechen, Fehlermeldung und Wiederholung, Mitarbeiteranfrage, Planerfreigabe, Rhythmusbestätigung und bestehende Angebote; Desktop dunkel/hell und Handy.
- `tests/open-shift-marketplace.integration.sql`: vollständiger Datenbankablauf mit ausschließlich zurückgerollten Testdaten, einschließlich Mandantentrennung, Berechtigungen, Pausen, Tages-SOLL, Nachtdiensten und Doppelbesetzungen.
- Bestehende Regressionstests und statischer Build.

