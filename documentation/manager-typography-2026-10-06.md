# SF-06 – Lesbare, skalierende Hinweise

## Befund und Ursache

Im Heute-Dashboard standen Kennzahlen-Erklärungen und weitere Hinweise auf festen
9–11 px. Die Darstellungseinstellung „Größer“ schaltet bereits die Klasse
`sf-font-large` am HTML-Element und hebt dessen Grundschrift von 16 auf 17 px an.
Feste Pixelgrößen in einzelnen Modulen und in der bisherigen Lesbarkeitsdatei
folgten dieser Einstellung nicht.

## Korrektur

`assets/manager-typography-v1.css` ergänzt eine auf die Verwaltungsoberfläche
begrenzte Schriftstaffel: Hinweise 0,875 rem (14 px bei Standard), sekundäre
Beschriftungen 0,8125 rem (13 px), kompakte Navigation 0,75 rem (12 px).
Bei „Größer“ werden Hinweise 14,875 px und sekundäre Beschriftungen 13,8125 px.
Die vorhandene Einstellung und deren Speicherung bleiben erhalten.

Explizite Regeln erreichen auch nachträglich geladene Module: Heute-Erläuterungen,
Status, SOLL/IST, Zeiterfassung, Auswertungen sowie Wochen- und Monatsdetails im
Kalender. Farben und Bedeutungen der Zustände bleiben in den Theme-Regeln.

Die Heute-Karten verwenden je nach verfügbarer Breite 6, 3, 2 oder 1 Spalten.
Schaltflächen erhalten bei wenig Platz eigene Zeilen. Im Kalender bleiben
Schichtname, Zeit und Besetzung getrennt; Texte dürfen umbrechen. Wochen- und
Monatsraster behalten horizontales Scrollen, wenn die verfügbaren Spaltenbreiten
für vergrößerte Schrift nicht ausreichen.

## Prüfung

- `npm test`: 481 bestanden, keine Fehler.
- `npm run test:ionos`: 5 bestanden, keine Fehler.
- Backup-Zweig: 63 bestehende Regression- und Theme-Prüfungen bestanden.
- Statische Builds auf beiden Produktionszweigen erfolgreich.
- Unabhängiger Chromium-Lauf: 85 bestanden, keine Fehler
  (GitHub Actions Run 37396785002, getesteter Commit
  `dc6ab4ddb0a98da6b9392dcbd3284fea7306cc1f`).
- Davon 36 Schriftfälle: Hell/Dunkel × 1920, 1366, 1180, 768, 390, 320 px ×
  Standard, „Größer“, 150 % (24 px Grundschrift).
- Ein zusätzlicher Fall prüft die tatsächliche Darstellungsauswahl, Speicherung,
  Neuladen und Rückkehr zu Standard.
- 48 bestehende Kennzahlen-Layoutfälle bleiben bestanden.

Die Browserprüfung verwendet die tatsächlichen Styles und Renderer mit fiktiven
Mitarbeitern und Schichten, ohne Backend-Verbindung oder Anmeldung. Sie bestätigt
vor der Korrektur 9 px für eine Heute-Erklärung, danach die gewählten Mindestgrößen,
Textgrenzen, Kalendertexte auch bei belegten Schichten und die Wirkung nach erneutem
Rendern. Die öffentliche Seite und eine Portal-Kontrolle werden von den neuen
Regeln nicht verändert. Kein Schreibzugriff auf Unternehmensdaten.

Die abschließende Bildkontrolle umfasst Heute im Hellmodus mit „Größer“, einen
belegten Wochen-Schichtblock und einen Hinweis bei 320 px und 150 % Schriftgröße.
Dies ist eine Layoutprüfung mit Testdaten, keine Abnahme einer angemeldeten Sitzung.
