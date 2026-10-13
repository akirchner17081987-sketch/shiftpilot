# Manuelle Wochenplanung – 13.10.2026

Die Wochenplanung zeigt den Kalender als Hauptarbeitsfläche. Die rechte Spalte bündelt die Dienstauswahl und Mitarbeiter; Schichtvorlagen sind einklappbar. Unter 1280 Pixeln steht die Mitarbeiterauswahl unter dem Kalender.

- Offene Position anklicken oder über „Manuell planen“ Tag und Schicht auswählen.
- Einplanbare Mitarbeiter erscheinen als Nachname, Vorname, mit Wochen- und Monatsstunden. Suche und Teamfilter grenzen die Auswahl ein.
- „Gesperrte anzeigen“ zeigt ausgeschlossene Mitarbeiter und die Gründe aus der zentralen Planungsprüfung.
- „Ergänzen“ ist auch für bereits besetzte Dienste verfügbar. Über „＋ Dienst“ oder die Schichtauswahl können optionale Dienste ohne Pflichtbedarf besetzt werden.
- Zuweisungen laufen unverändert über `SFCompliance.save`: erneute Prüfung, verbindliche Sperren, bestätigungspflichtige Hinweise und der Änderungsprozess für veröffentlichte Pläne.
- Schichtfilter und „Nur offene Besetzungen“ gelten für Übersicht und Besetzungsansicht. Monatsansicht und Zeitachse behalten ihre eigene Darstellung.
- Vorhandene Dienste werden durch Klick auf den Mitarbeiternamen bearbeitet. Drag-and-drop bleibt verfügbar.
- Wochen- und Unternehmenswechsel heben die aktive Dienstauswahl auf.

Die Änderungen betreffen die Oberfläche; Dienste und Besetzungsvorgaben werden durch den Umbau nicht verändert. Die Anleitung ist im bestehenden HilfeCenter-Artikel „Wie besetze oder ändere ich eine Schicht?“ integriert.

Validierung: bestehende Funktionstests und IONOS-Build, isolierter GitHub-Actions-Browsertest mit echter Compliance-Prüfung und fiktiven Mitarbeitern, vollständige Modul-/Navigationsprüfung. Die neuen Tests prüfen unter anderem Überschneidungen über Mitternacht, Abwesenheiten, Freigaben, Monatsgrenzen, Warnbestätigung, Entwurfszuweisung, den Änderungsprozess veröffentlichter Pläne sowie Hell-/Dunkelmodus mit 320–1920 Pixeln.
