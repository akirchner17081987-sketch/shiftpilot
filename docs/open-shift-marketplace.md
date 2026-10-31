# Offene Plätze aus der Auto-Planung

Im Dienstplan und nach einer Analyse in der Auto-Planung steht **Alle offenen Dienste in den Schichtmarkt** zur Verfügung. Eine gemeinsame Abfrage zeigt Anzahl, Zeitraum und eine aufklappbare Liste. Erst **Alle offenen Dienste einstellen** veröffentlicht den gesamten zukünftigen Restbedarf in einem Vorgang. Eine Einzelauswahl ist dafür nicht nötig. **Offene Plätze auswählen** bleibt für Teilmengen verfügbar. Solange noch nicht übernommene Vorschläge vorliegen, bleibt die Aktion gesperrt. Vorschläge zuerst als Entwurf übernehmen oder entfernen.

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


## Sammelaktion und Kennzeichnung · 31.10.2026

Die Sammelaktion bezieht sich auf den sichtbaren Planungszeitraum und künftig beginnende Dienste in der Unternehmenszeitzone. Vor der Abfrage werden ausstehende Entwürfe synchronisiert und die gespeicherten Daten geladen. Unternehmens-, Benutzer-, Rollen-, Zeitraum- oder Planänderungen verwerfen die Bestätigung. Während einer Speicherung verhindern die bestehenden Sperren einen doppelten Vorgang. Die vorhandene atomare Veröffentlichungsfunktion aktualisiert vorhandene Angebote, ohne zusätzliche Angebote für denselben Dienst anzulegen. Der Dienstplan und seine SOLL-Werte werden dadurch nicht verändert.

Aktive offene Angebote erhalten in Wochen- und Monatsansicht sowie der Besetzungsübersicht eine violette Beschriftung **Im Schichtmarkt · N Plätze**. Die Beschriftung kommt aus den berechtigten Marktplatzdaten, berücksichtigt die Unternehmenszeitzone und zählt Freigabeanfragen nicht als zusätzliche Angebote. Vollständig besetzte lokale Dienste, begonnene, zurückgezogene oder geschlossene Angebote verlieren die Markierung. Bei einem Ladefehler oder veraltetem Stand werden keine alten Markierungen weiter angezeigt; der Statushinweis benennt die fehlende Aktualisierung. Die bestehende Marktplatzaktualisierung wird auch in der Dienstplan-/Auto-Planungsansicht verwendet. Unternehmens- und Rollenwechsel entfernen die Kennzeichnung.

Beide Veröffentlichungsfenster haben ein X. Ein Klick auf den Hintergrund schließt das Fenster nicht. Abbrechen und X veröffentlichen nichts. Die Mitarbeiteranfrage mit anschließender Planerfreigabe bleibt unverändert. Keine neue Datenbankstruktur oder externe Dienstleistung.
