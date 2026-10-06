# Auto-Planung – Vorschlagsbutton ohne Überlagerung

## Ursache und Verhalten

Der Einstieg zum Planungsassistenten und sein Chat waren als feste Elemente rechts
unten über der Arbeitsfläche positioniert. Beim Scrollen konnten sie den Button
„Vorschläge erstellen“ verdecken.

In der aktiven Auto-Planung verschiebt der vorhandene Assistent seine Schaltfläche
in einen eigenen Bereich direkt nach den Planungsaktionen. Ein geöffneter Chat
nimmt dort regulär Platz im Dokumentfluss ein. Die Bereiche können sich deshalb
auch beim Scrollen, bei schmalen Fenstern und bei größerer Schrift nicht überlagern.
Der Chat ist rechts ausgerichtet und wird auf Mobilgeräten so breit wie der Inhalt.
Beim Öffnen wird er in den sichtbaren Ausschnitt gescrollt.

Beim Wechsel in einen anderen Bereich werden dieselben Elemente wieder schwebend
rechts unten platziert. Es entstehen keine zusätzlichen Schaltflächen oder Chats.
Die bestehende Unterhaltung bleibt beim Schließen und Öffnen erhalten; ein Wechsel
der Firma oder Anmeldung setzt sie weiterhin zurück. Rollen und Planungslogik
werden nicht geändert.

Die bestehenden CSS- und JavaScript-Verweise sind auf `20261006-1` versioniert.

## Prüfung

Die unabhängige Chromium-Prüfung verwendet die tatsächlichen Styles aus
`index.html`, den versionierten Assistenten, Auto-Planung, Compliance-Prüfungen und
Monatsoptimierung und fiktive Daten. Sie greift auf keine Anmeldung und keinen produktiven Backenddienst zu.

- 48 Kombinationen: Hell/Dunkel, Fenster von 320 bis 1920 px, Schriftbasis
  16/17/24 px; zusätzlich 480 px Fensterhöhe und doppelte Schriftbasis (32 px).
- Vorschlagsbutton frei an fünf Trefferpunkten und tatsächlich per Maus und
  Tastatur bedienbar; Vorschlagserstellung bei geschlossenem und geöffnetem Chat.
- Geometrie ohne Überlagerung und horizontalen Überlauf, sichtbares Eingabefeld,
  Chatfragen, Escape, Schließen, Wiederöffnen mit erhaltener Unterhaltung.
- Ansichtswechsel ohne doppelte Elemente, Firmenwechsel und fünf weitere Rollen.
- Zwei bestehende vollständige Assistenten-Prüfungen in Hell/Dunkel. Deren fiktives
  Schichtmodell ergänzt die inzwischen benötigte `planningRestriction`-Methode.
- Zwei zusätzliche Monatsansichten prüfen die breiteren individuellen Planungs- und
  Optimierungsaktionen mit geöffnetem Chat.
- Insgesamt 58 Browserfälle, 481 bestehende automatisierte Tests und fünf
  IONOS-Prüfungen. Der Backup-Build wird zusätzlich separat geprüft.

Die Browserprüfung stellt sicher, dass keine Schreiboperation und keine externe
Backendanfrage entsteht. Ein angemeldeter Live-Test mit realen Mitarbeiterdaten
ist damit nicht verbunden.
