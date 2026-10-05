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
