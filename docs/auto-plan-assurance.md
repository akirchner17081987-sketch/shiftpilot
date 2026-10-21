# Selbständige Nachbesserung und Abschlussprüfung

Die einfache Vorschlagsplanung sucht nach dem ersten Besetzungs- und Stundenlauf
zusätzlich nach zulässigen Umbesetzungen: Ein bereits vorgeschlagener flexibler
Mitarbeiter kann eine offene Pflichtposition übernehmen, wenn sein bisheriger
Dienst gleichzeitig durch einen anderen passenden Mitarbeiter besetzt wird.
Jeder übernommene Schritt schließt eine zusätzliche Pflichtlücke. Alle Dienste
des neuen Vorschlags werden zusammen erneut geprüft; abgelehnte Versuche bleiben
ohne Wirkung. Anschließend folgt erneut der persönliche Stundenausgleich.

Gespeicherte und veröffentlichte Dienste, manuelle Rhythmusausnahmen, feste
konkrete Schichtvorgaben und genehmigte Marktplatzdienste werden nicht verschoben.
Bestätigte Erholungsregeln und individuelle Blocksolver behalten ihre bestehenden
strengeren Suchverfahren und Optionen; die zusätzliche einfache Umbesetzung
wird dort nicht eingesetzt. Suchzeit und Anzahl der Versuche sind begrenzt.
Verbleibende Lücken beweisen deshalb keine Unlösbarkeit.

Eine unabhängige Abschlussanzeige prüft jeden vorgeschlagenen Dienst gegen die
übrigen Vorschläge und die geschützte Basis. Sie gilt auch für Monatsoptimierungen,
wiederhergestellte Hintergrundvorschläge und manuell geänderte Vorschauen.
Beschäftigungszeitraum, Freigaben, Abwesenheiten, Rhythmen, Schichtfolgen, Ruhezeiten
und automatische Stundengrenzen werden geprüft. Individuelle Zeiten und genehmigte
Rhythmusausnahmen laufen durch die vorhandene Vorschauprüfung. Die Anzeige nennt
Regelkonflikte, tatsächlich verbleibende Pflichtlücken und den größten Stundenabstand
bei gleichem Monats-SOLL (getrennte Monate werden nicht miteinander verrechnet).

Geänderte Mitarbeiter, Dienste, Regeln, Bedarfe, Zeitraum, Unternehmen, Wünsche und
Verfügbarkeit der Prüfmodule verwerfen das zwischengespeicherte Prüfergebnis.
Unvollständige oder fehlgeschlagene Prüfungen geben den Vorschlag nicht frei.
Ein direkter Aufruf des Übernehmen-Befehls wird bei solchen Fehlern ebenfalls
gestoppt. Die vorhandenen Prüfungen vor und während der Speicherung bleiben aktiv.

„Vorschlag automatisch geprüft“ bestätigt die Prüfung der neuen Dienste gegen den
aktuellen lokalen Datenstand. Es ist keine Garantie eines globalen Optimums und
kein Nachweis fehlerfreier historischer Basisdienste. Offene Positionen bleiben als
Ausnahmen sichtbar. Speicherung als Entwurf benötigt weiterhin eine Bestätigung;
Veröffentlichung bleibt ein eigener Schritt. Keine Änderungen an Vertragsstunden,
Unternehmensregeln oder bestehenden gespeicherten Dienstplänen.

Prüfungen: `tests/auto-plan-assurance.test.cjs` und die Browserfälle
„automatic repair“, „final audit“ sowie der Januar-Ausgleich in
`tests/e2e/auto-plan-workspace.spec.cjs`.
