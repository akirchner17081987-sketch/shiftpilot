# Stunden fair verteilen

Bei aktiver Option „Schichten fair verteilen“ zählt das persönliche Monats-SOLL.
Nach notwendiger Besetzung und verbindlichen Regeln minimiert die Suche die Summe
von `(Planstunden - Monats-SOLL)² / Monats-SOLL`. Unter- und Überplanung zählen
gleichermaßen; unterschiedliche Vertragsziele werden anteilig behandelt.

Der normale Vorschlagslauf prüft anschließend einzelne Umverteilungen und offene
Pflichtpositionen erneut. Volle Rhythmusblöcke bleiben die erste Wahl; kürzere
zulässige Besetzungen dürfen bei fehlendem Bedarf oder Stundenlimits entstehen.
Die Monatsoptimierung nimmt dafür auch kürzere Optionen in unveränderten
Arbeits-/Freifenstern auf. Der Solver und seine fortsetzbare Hintergrundversion
vergleichen dieselbe Stundenbewertung und prüfen nachträgliche Transfers nur
zwischen zuvor freigegebenen, deckungsgleichen Schichtoptionen.

Gespeicherte Dienste gehören im normalen Vorschlagslauf zur unveränderlichen
Basis. Feste Schichtvorgaben, manuelle Rhythmusausnahmen, veröffentlichte Dienste,
Freizeitzusagen, Qualifikationen und Zeitgrenzen werden nicht gelockert. Eine
bewusst gestartete Monatsoptimierung behält ihren bestehenden Vorschau- und
Freigabeablauf für ersetzbare Entwürfe. Eine bessere Stundenverteilung allein
darf keine neue Pflichtlücke erzeugen.

Alle Berechnungen verwenden ausschließlich das übergebene Unternehmen und den
jeweiligen Monat. Suchbudgets begrenzen zusätzliche Laufzeit; es besteht keine
Garantie auf ein globales Optimum oder exakt gleiche Stunden bei unterschiedlichen
Freigaben und Verfügbarkeiten. Persönliche Ziel- und Höchststunden werden durch
diese Änderung nicht verändert.

Regression: sechs Mitarbeiter mit 180 h SOLL, 12-h-Tag-/Nachtdiensten,
fünf versetzten 4/3/3/2-Arbeits-/Freirhythmen und einem flexiblen Mitarbeiter.
Januar 2027 wird ohne gespeicherte Änderungen mit 93 Diensten vollständig besetzt:
drei Personen mit 180 h, drei mit 192 h. Die Verteilung ist nach allen geladenen
Kandidaten-, Rhythmus-, Ruhezeit-, Dienstfolgen- und Stundenprüfungen zulässig.

Prüfungen: `tests/planning-hours-balance.test.cjs`,
`tests/background-auto-plan.test.cjs`, `tests/month-optimizer.test.mjs` und
`tests/e2e/auto-plan-workspace.spec.cjs`.
