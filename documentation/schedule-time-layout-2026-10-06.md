# SF-04 / SF-05 – Vollständige Schichtbeschriftungen und sichtbare Zeit-Tabs

## Befund und Korrektur

Schichtname, Zeitspanne und Besetzungsanzeige konkurrierten in schmalen
Wochenzellen um dieselbe Zeile. Feste Schriftgrößen und Ellipsen verkürzten
die Beschriftungen. Die Zeit-Tabs standen neben Überschrift und Zeitraumfilter;
bei etwa 1363 px Fensterbreite reichte „QR-Terminals“ über den Inhaltsbereich.

`assets/manager-schedule-time-layout-v1.css` ergänzt gezielte Regeln für die
Verwaltungsansichten Dienstplan und Zeiterfassung:

- Schichtnamen umbrechen vollständig mit 0,875 rem Schriftgröße. Zeitspanne und
  Besetzungszahl stehen untereinander, ohne Ellipsen oder Überlagerungen.
- Übersicht und Besetzung behalten sieben mindestens 10 rem breite Tagesspalten.
  Die Mindestbreite enthält auch die sechs Spaltenabstände. Bei wenig Platz bleibt
  die Woche horizontal scrollbar.
- Die Dienstplan-Werkzeugleiste und die drei Ansichts-Schaltflächen umbrechen
  kontrolliert. Auf schmalen Fenstern verdecken Standort- und Zeitraumwahl die
  Schaltfläche „Übersicht“ dadurch nicht mehr.
- `manager-schedule-time-layout-v1.js` schiebt ein fokussiertes Wochen-Steuerelement
  vollständig in den sichtbaren Ausschnitt. Chromium ließ zuvor bei bestimmten
  Breiten trotz Fokus einen Teil des Elements außerhalb des Ausschnitts stehen.
- Zeiterfassung, Stundenkonto und QR-Terminals bekommen eine eigene volle Zeile.
  Schaltflächen umbrechen bei schmalen Fenstern und bleiben mindestens 44 px hoch.
- Zeitraumfilter dürfen umbrechen und sind nur in der Zeiterfassung eingeblendet.
  Auf Mobilgeräten stehen die Felder untereinander. Die Flex-Richtung des Zeit-Kopfs
  ist ausdrücklich festgelegt, damit Breitenvorgaben bei kleinen Fenstern nicht
  zu übergroßen Leerflächen in der Höhe werden.

Der neue Stylesheet-Link wird nach den bestehenden Theme-, Kennzahlen- und
Schriftregeln geladen. Die Fokuskorrektur ist direkt über einen versionierten
`defer`-Script-Link eingebunden. Fachlogik, gespeicherte Schichten, Zeiten, QR-Konfiguration
und Rollenrechte bleiben unverändert.

## Prüfung

Die unabhängige Chromium-Prüfung nutzt die tatsächlichen Styles und geladenen
Kalender-Module (Wochen- und Monatsansicht sowie Werkzeugleiste), mit fiktiven Mitarbeitern und Schichten, ohne Anmeldung oder
Backend-Verbindung. Alle anderen Netzwerkanfragen werden blockiert. Die Prüfung
misst vollständige Namen, Uhrzeiten und Besetzungszahlen in allen 28 Schichtzellen
je Wochenansicht sowie Textgrenzen und Überschneidungen.

Die Matrix umfasst Hell/Dunkel, Fensterbreiten 1920, 1366, 1363, 1024, 768, 390
und 320 px sowie Grundschriften 16, 17 („Größer“) und 24 px (150 %).
Tag, Woche, Monat und eigener Zeitraum werden über den tatsächlichen Zeitraumfilter
gewechselt. Tab und Enter prüfen den Wechsel von Zeiterfassung über Stundenkonto
zu QR-Terminals sowie den Zugang zur letzten Wochenspalte. Zusätzliche Fälle prüfen
OWNER und TIME_TRACKING mit dessen gesperrtem Stundenkonto und „QR-Erfassung“.
Kein Test schreibt Unternehmensdaten. Dies ist keine Abnahme einer angemeldeten
Portal-Sitzung.

- `npm test`: 481 bestanden, keine Fehler.
- `npm run test:ionos`: 5 bestanden, keine Fehler.
- Backup-Zweig: 88 bestehende Regression-, Theme-, Kalender-, Lesbarkeits-,
  Rollen- und QR-Prüfungen bestanden.
- Statische Builds auf beiden Produktionszweigen erfolgreich.
- Unabhängiger Chromium-Lauf: 44 bestanden, keine Fehler, keine Wiederholungen
  (GitHub Actions Run 37400056410, getesteter Commit
  `0a784f90bba97de876a53da10245893695bb0bad`).
- Alle 42 Layoutfälle prüfen beide Wochenansichten, alle vier Zeitfilter,
  Tastaturfokus, Tab-Wechsel und sichtbare zugehörige Panels. Zwei weitere Fälle
  prüfen die Rollen OWNER und TIME_TRACKING.
- Die Zeit-Kopfhöhe bleibt innerhalb eines 960 px hohen Bildschirms; die Überschrift
  bleibt innerhalb des Kopfs. Die Dienstplan-Werkzeugleiste und alle Zeit-Tabs haben
  weder horizontale Überläufe noch überlappende Schaltflächen.
- Keine Browserfehler, keine externen Netzwerkanfragen, keine Speichervorgänge.
  Die einzige zusätzliche Anfrage lädt die Fokuskorrektur über den direkt aus
  `index.html` übernommenen Script-Link von der fiktiven Testadresse.

Die Bildkontrolle bestätigt den langen Schichtnamen mit Zeitspanne und Besetzung
im Hellmodus bei 1363 px und „Größer“, die Übersicht im Dunkelmodus sowie Zeit-Kopf
und Schichtkarte bei 320 px mit 150 % Schriftgröße. Die mobile Zeitansicht hat
keine übergroßen Leerflächen; alle drei Zeit-Tabs bleiben vollständig lesbar.
