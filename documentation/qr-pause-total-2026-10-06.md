# Pausensumme in der Mitarbeiter-QR-Zeiterfassung

Nach der Anmeldung mit Personalnummer und Eintrittsdatum zeigt `qr-time.html`
unter Mitarbeiter und Beginn einen eigenen Bereich **Pausen gesamt**.
Die Summe enthält sämtliche Pausen der aktuellen Buchung und wird als Minuten
und Sekunden angezeigt. Eine offene Pause zählt bis zum aktuellen Zeitpunkt
mit; die Anzeige aktualisiert sich jede Sekunde und beim Zurückkehren zur Seite.

Abgeschlossene Pausen bleiben unverändert. Beim Dienstende wird die vom Server
geschlossene Pause mitgerechnet und die Summe eingefroren. Eine neue Buchung
startet wieder bei null. Beim Abmelden werden die Anzeige und der Timer geleert.
Auch bereits laufende Buchungen erscheinen unmittelbar nach dem Anmelden mit
ihrer bisherigen Pausensumme.

## Berechnung

`assets/qr-pause-total-v1.js` addiert die Zeitintervalle aus der vorhandenen
STATUS- bzw. Buchungsantwort. Die Summe wird erst nach dem Addieren auf ganze
Sekunden gekürzt, damit kurze Pausen vollständig berücksichtigt werden.
Ungültige oder umgekehrte Intervalle erzeugen keine negativen Werte. Pausen
werden auf den Zeitraum der Buchung begrenzt. Für eine laufende Pause verwendet
die reine Anzeige die Geräteuhr; gespeichert werden weiterhin ausschließlich
die serverseitigen Buchungszeitpunkte. Es gibt keine zusätzlichen API-Anfragen
für den Anzeigetimer und keine Änderung an bezahlter Zeit oder Datenbank.

## Prüfung

- Zehn Berechnungstests: keine Pausen, mehrere kurze Pausen, offene/geschlossene
  Pausen, zehn Pausen, Mitternacht, Zeitzonen und ungültige Zeitintervalle.
- 14 Chromium-Tests mit vollständig abgefangenen Netzwerkanfragen und fiktiven
  Personal- und Buchungsdaten. Produktionsseite und Produktionsmodul werden
  unverändert geladen. Geprüft wurden bestehende Buchungen, laufende Pause,
  Pausenende, Dienstende mit offener Pause, neue Buchung, Abmeldung, Fehlermeldung
  und Ansichten mit 320, 390 sowie 1280 Pixeln Breite.
- Alle 14 Browserprüfungen erfolgreich:
  https://github.com/akirchner17081987-sketch/shiftpilot/actions/runs/37404849489
- Der vorhandene VM-Testaufbau für den QR-Login lädt jetzt auch das echte
  Pausensummenmodul und unterstützt die neuen Timer-/Sichtbarkeitsereignisse.

Die Browserprüfungen verwenden keine echte Anmeldung und schreiben keine
Produktionsbuchungen. Eine Prüfung im angemeldeten Live-Mitarbeiterportal ist
damit nicht ersetzt.
