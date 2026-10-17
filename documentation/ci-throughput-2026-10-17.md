# Prüfabläufe und Antwortzeit – 17.10.2026

## Geänderte Zuständigkeiten

- Read-only Prüfworkflows erhalten eine eigene Concurrency-Gruppe pro Workflow und Git-Ref. Ein neuer Stand bricht nur dessen überholte Prüfungen ab; andere Pull Requests und andere Prüfarten bleiben unabhängig.
- Die vollständige Node-Regression läuft weiterhin für jeden Pull Request und im IONOS-Release vor dem Upload. Spezielle Modulworkflows prüfen ihren Bereich statt jeweils sämtliche fachfremden Node-Tests zu wiederholen.
- Der Release führt alle bisherigen Browserprüfungen weiter aus. Ihre zuvor zusätzlich ausgeführten Node-Teiltests entfallen dort, da `npm test` sie bereits im selben Job geprüft hat. Die npm-Download-Daten werden über setup-node gecacht; `npm ci` bleibt bestehen.
- Schriftgrößen, Kennzahlen und Assistentenlayout haben jeweils ihre eigene Browserprüfung. Die Ladeprüfung überlässt die zusätzlichen Planungsabläufe dem dafür vorhandenen Planungsworkflow.
- Historische, nur auf alte Arbeitsbranches begrenzte Volltests bleiben erhalten. Die generierten IONOS-Orchestrierungs- und Uploadworkflows bleiben unverändert; laufende Veröffentlichungen werden nicht abgebrochen.

## Ausgangsmessung

Der letzte Release wartete am 17.10.2026 von 21:47:09 bis 21:48:59 Uhr (Berlin) auf den ersten Runner. Der Buildjob lief von 21:49:13 bis 21:52:31 Uhr; davon entfielen 53 Sekunden auf Node-/IONOS-Prüfungen und 134 Sekunden auf Browserinstallation und Browserprüfungen. Der eigentliche Build mit Installation brauchte drei Sekunden. Der nachgelagerte Upload war um 21:53:04 Uhr erfolgreich beendet.

Bei separaten Abrufen aus der Assistentenumgebung entfielen mehrere Sekunden auf den TLS-/Proxy-Verbindungsaufbau. Bei wiederverwendeter Verbindung lagen die ersten Bytes für eine JS-Datei bei 0,266 Sekunden und für die Hauptseite bei 0,377 Sekunden. Das ist keine belastbare Messung der Ladezeit eines angemeldeten Mitarbeiterportals.

`python3 scripts/measure-site-response.py` misst sechs öffentliche GET-Abrufe mit wiederverwendbaren Verbindungen. `Public site response timings` führt diese Messung unabhängig auf GitHub aus und speichert den Bericht. HTTP-Fehler schlagen fehl; es wird kein aus Einzelmessungen abgeleitetes, unbegründetes Latenzlimit erzwungen. Die Messung benötigt keine Zugangsdaten und verändert keine Daten. Bei unauffälligen Runner-Messungen ist keine Änderung am Hosting oder an den Portalanimationen begründet.
