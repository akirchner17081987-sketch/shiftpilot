# Kennzahlen in Zeiterfassung und Auswertungen – SF-03

Die gemeinsame `.stat`-Karte reserviert eine 42-Pixel-Spalte für ein Symbol. Zeiterfassung und Auswertungen verwenden dieselbe Klasse mit nur einem Textbereich; dieser landete in der Symbolspalte. Das erklärt die mehrfach umbrochenen Texte und die freie Fläche rechts daneben.

## Änderung

- Die Textkarten unter `#timeStats` und `#reportStats` nutzen die volle innere Kartenbreite. Das Dashboard behält sein Symbolraster.
- Kennzahlenraster richten sich nach der verfügbaren Breite des jeweiligen Bereichs und der Grundschriftgröße. Zeiterfassung verwendet vier, zwei oder eine Spalte; Auswertungen sechs, drei, zwei oder eine.
- Beschriftung und Erklärung verwenden 0,8125 rem (13 Pixel bei Standard-Grundschrift), Zahlen 1,5 rem (24 Pixel). Die Einstellung „Größer“ kann mitwachsen.
- Kartenhöhen ergeben sich aus dem Inhalt. Werte mit Einheiten können bei stark vergrößerter Schrift kontrolliert umbrechen.
- Gemeinsame Darstellung in `assets/manager-kpi-layout-v1.css?v=20261006-1`, eingebunden in der Hauptseite. Die Kennzahlen stammen weiterhin aus den bestehenden Renderern.

## Prüfung

- 481 bestehende Funktionstests und 5 IONOS-Tests erfolgreich; 63 gezielte Regressions- und Theme-Tests des Vercel-Stands erfolgreich; statische Builds auf beiden Veröffentlichungszweigen erfolgreich; `git diff --check` erfolgreich.
- Eigenständige Chromium-Prüfung in GitHub Actions mit den Anwendungsstyles sowie den tatsächlichen Renderern aus Zeiterfassung und Auswertungen. Nur erfundene Daten; keine Anmeldung, Backend-Verbindung oder Speicherung.
- 48 Fälle: heller/dunkler Modus, 1920/1440/1366/1180/1024/768/390/320 CSS-Pixel, Grundschrift 16/17/24 Pixel. 17 Pixel aktiviert auch die Einstellung `sf-font-large`.
- Gemessen werden volle innere Textbreite, Textgrenzen, Überläufe, überlappende Felder/Karten und höchstens zwei Textzeilen pro Kennzahlenfeld. Suche, leere Ergebnisse und der Monatswechsel werden ebenfalls gerendert.
- In einem Fall wird das ursprüngliche 42-Pixel-Problem durch vorübergehendes Abschalten des neuen Styles reproduziert. Die separate Dashboard-Symbolkarte behält ihre 42-Pixel-Symbolspalte.

Browserprüfung: **48 bestanden, 0 fehlgeschlagen** (GitHub Actions Lauf `37393926253`). Alle gemessenen Textbereiche nutzen die innere Kartenbreite; kein Text-/Kartenüberlauf und keine überlagerten Kennzahlenfelder. Beschriftungen, Werte und Erklärungen belegen in dieser Testmatrix jeweils höchstens zwei Zeilen. Eine Live-Abnahme der privaten angemeldeten Sitzung ist nicht Teil dieser unabhängigen Testansicht.
