# Gedämpfter heller Verwaltungsmodus – 06.10.2026

Die Live-Prüfung vom 05.10.2026 zeigte dunkle Karten mit dunklen Überschriften im Heute-Dashboard. Die bisherigen Regeln erfassten neuere, zur Laufzeit eingefügte Verwaltungsbereiche nicht. Große Flächen wirkten zudem zu hell.

## Änderung

- Die doppelte v1/v2-Farbdefinition ist zu einer gemeinsamen Palette konsolidiert.
- Arbeitsfläche: gedämpftes Blaugrau `#d5dfe6`; Navigation: `#cbd7df`; Karten: `#ecf1f4`; innere Flächen: `#dce5eb`.
- Haupttext: `#1c2d3a`; sekundärer Text: `#435969`; türkiser Textakzent: `#065d51`.
- Helle Flächen und passende Textfarben für Heute, Zeiterfassung/Stundenkonto, QR-Verwaltung, Auswertungen, Störfall-Autopilot, Einstellungen, Abwesenheiten, Auto-Planung, DATEV und Verwaltungsdialoge.
- Erfolgs-, Warn- und Fehlerzustände verwenden dunkle Schrift auf gedämpften farbigen Flächen. Farbige Dienstplan-Zuweisungen behalten weiße Schrift; QR-Code-Flächen bleiben weiß.
- Kleine Heute-Erklärtexte im hellen Modus auf 13 px bei Standard-Schrift angehoben. Dies ersetzt keine separate vollständige Schriftgrößenprüfung.
- Theme-Dateien erhalten neue Versionsparameter; der Browser-Themenfarbwert folgt der Arbeitsfläche.

## Prüfung

- Bestehende Regressionstests: 473 bestanden, 0 fehlgeschlagen.
- Theme-Tests prüfen rechnerisch mindestens 4,5:1 für normale Text- und Statusfarben auf den gemeinsamen Flächen.
- CSS-Syntax ohne Fehler; statische Kaskadenprüfung von 96 Textbeispielen aus den tatsächlichen Styles mit später eingefügten Modulregeln: keine Kontrastunterschreitung unter 4,5:1.
- Dunkle Dashboard-Kartenfarbe in dieser Prüfung unverändert.
- Statischer Build erfolgreich; keine Änderungen an Datenbank, Berechtigungen oder fachlichen Abläufen.

Die Kaskadenprüfung nutzt eine lokale, anmeldefreie Vorschau mit erfundenen Testinhalten. Der Browserzugriff war weiterhin durch das Browserwerkzeug gesperrt, auch für diese Testansicht. Deshalb noch keine visuelle Browser-Abnahme, kein echter Mobiltest und keine vollständige Barrierefreiheitsfreigabe. Mitarbeiterportal und QR-Scanner wurden in diesem Schritt nicht live geprüft.

## IONOS-Produktionszweig

IONOS veröffentlicht aus `codex/ionos-migration`. Die Theme-Korrektur wird dort auf den aktuellen Stand `7a66ed5` übernommen; die neueren periodengebundenen Bereitschaftsprüfungen bleiben dabei enthalten. Zusätzliche Prüfung dieses Produktionsstands: 481 Regressionstests bestanden, 0 fehlgeschlagen; statischer Build erfolgreich. Die Änderung auf `main` dient zugleich dem verbundenen Vercel-Rückfallstand.

## Nachkorrektur: dunkle Tabellen und Kalenderflächen

Die Rückmeldung zu weiterhin dunklen Tabellen bestätigte eine Lücke: Die erste Prüfung erfasste die aktuellen Wochen- und Monatsraster sowie mehrere Verwaltungslisten nicht. Außerdem färbten die bisherigen Regeln Tabellenzeilen, während eigene Zellfarben und die Hover-Regel der Stundenkontotabelle weiterhin dunkle Flächen zeichneten.

- Tabellenzellen übernehmen nun die helle Zeilenfläche; Hover, Tastaturfokus und Fußzeilen erhalten passende Flächen.
- Übersicht/Besetzung im Wochenplan, Monatsraster, Wochenenden, aktueller Tag und Drag-and-drop-Zustände verwenden die gemeinsame gedämpfte Palette.
- Die Auto-Planung behält unterscheidbare Zustände für zugewiesene Dienste und Abwesenheiten. Hinterlegte Personalgruppenfarben und Schichtakzente bleiben erkennbar.
- Ergänzte Verwaltungslisten: Schichtbörse/Tausch, Abwesenheitsfreigaben, Nutzerverwaltung, Protokoll, Einsatzbereitschaft und Datenschutz. Ergänzte Listendialoge: Personalakten/-anfragen, Fristen, Freigaben, Monatsabschluss und Historie.
- CSS-Versionsparameter auf `20261006-2` angehoben. JavaScript bleibt bei `20261006-1`.

Prüfung des IONOS-Stands: 481 Regressionstests und 5 IONOS-Tests bestanden; statischer Build erfolgreich (2,77 MiB); `git diff --check` ohne Fehler. Ergänzende statische Kaskadenprüfung mit 85 nachgelagerten Style-Blöcken aus den Anwendungsmodulen: jeweils 597 Textbeispiele und 268 Flächen bei 1440, 760 und 390 CSS-Pixel Breite, keine dunklen Testflächen und keine Textkontraste unter 4,5:1. Tabellenzellen, Personalgruppenfarben und Drag-and-drop-Zustände werden dabei ausdrücklich geprüft. Die geprüfte dunkle Kaskade und geteilte Mitarbeiterportal-Komponenten ergeben gegenüber dem vorherigen Stand keine Änderungen.

Diese Prüfung modelliert CSS-Regeln mit erfundenen Inhalten und ersetzt keine visuelle Live-Abnahme. Der verfügbare Browserzugriff war weiterhin gesperrt; Layout, tatsächliche Interaktion und das Mitarbeiterportal wurden für diese Nachkorrektur nicht live abgenommen.
