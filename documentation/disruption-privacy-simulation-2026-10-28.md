# Simulierte Ersatzanfrage bei Krankmeldung – 28.10.2026

Die Simulation lief in einer isolierten PostgreSQL-kompatiblen PGlite-Datenbank mit synthetischen Personen und den SQL-Funktionen aus dem Repository. Keine echten Mitarbeiter, keine extern versendeten Nachrichten, keine Änderungen an Produktionsplänen.

## Ablauf und Ergebnis

| Prüfung | Ergebnis |
|---|---|
| Veröffentlichter synthetischer Dienst, Ausfalltyp SICKNESS und vertrauliche Testnotiz | Angelegt |
| Ersatzangebot für genau eine synthetische Portalperson | Angelegt |
| Vorher: bisherige Mitarbeiter-RPC | SICKNESS und vertrauliche Notiz abrufbar; Fehler reproduziert |
| Nachher: korrigierte Mitarbeiter-RPC | Neutraler Typ OTHER, Notiz leer |
| Angebotskennung, Status, Dienst, Beginn, Ende, Frist, eigener Kommentar | Unverändert |
| Unbeteiligte aktive Person | Sieht kein Angebot; Zusage wird abgewiesen |
| Berechtigte Ersatzperson sagt zu | Dienst wird übertragen, Störfall RESOLVED |
| Interne Dokumentation des Ausfalls | Unverändert erhalten |
| Erzeugte Benachrichtigungsdatensätze | Enthalten die vertrauliche Testnotiz nicht |

Automatisierter Test: `tests/disruption-replacement-sql.test.mjs`, Testname `simulated sickness: before/after privacy, unchanged offer, isolated access and successful acceptance`.

Das Ergebnis belegt diesen simulierten Datenbankablauf. Es bestätigt weder die Zustellung auf realen Mobilgeräten noch den vollständigen Abschluss von Punkt 3. Der zuvor separat durchgeführte Rollback-Test auf dem Produktionsschema betraf Teilablösung, Zeitbuchungen, Wiederholschutz und Betriebsratsfreigabe; er ist kein Live-Nachweis dieser Datenschutzkorrektur.
