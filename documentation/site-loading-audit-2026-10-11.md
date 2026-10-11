# Ladeprüfung der gesamten SchichtFunk-Seite

Ausgangsrelease: `ad5b370599ae659ae03921f3b46a0e5ab5a74819` (11.10.2026).

| Einstieg / Ladeweg | Ergebnis und Maßnahme |
| --- | --- |
| Hauptseite: Anmeldung, Heute, Dienstplan, Personal, Auto-Planung, Abwesenheiten, Auswertung, Einstellungen, Simulation, Wunschplanung, Übergabe | Alle statischen externen Skripte sind geordnet mit `defer` eingebunden. Die HTML-Verarbeitung wartet nicht mehr auf jeden Skript-Download. Klassische globale Funktionen und die bestehende Reihenfolge bleiben erhalten. |
| Basisphase und Verwaltungsphase | Bereits parallele Downloads bleiben erhalten. Die Anmeldung startet erst, wenn sowohl alle Basismodule als auch die komplette statische Seite bereit sind. Damit können bereits vorhandene, aber noch ausstehende `defer`-Skripte keine Abhängigkeitslücke verursachen. |
| Doppelte Einbindungen | Die Schichtzuweisungsintegration wird einmal ausgeführt. Die Marken-CSS-Datei wird einmal an ihrer bisherigen letzten Position eingebunden; die fertige CSS-Kaskade bleibt erhalten. |
| Inline-Erweiterungen am Seitenende | Qualitätsanpassungen und die Hilfe-Steuerung sind einzeln versionierte, wiederverwendbare Skripte. Ihr klassischer Scope und die Reihenfolge bleiben erhalten. |
| DATEV und Monatswahl | Der zentrale Verwaltungsloader bleibt zuständig. Die Markenbereinigung fordert beide Module nicht mehr schon vor Anmeldung oder für Mitarbeitende an. Fallbacks beim Öffnen der Zeiterfassung erkennen vorhandene Skripte unabhängig von der URL-Version. |
| Demo | Vier ausschließlich lokale Demo-Integrationen werden nur bei einer aktiven Demo-Sitzung angefordert. Die nachträglich eingebundene Demo-Skriptkette folgt weiterhin nach den Anwendungsskripten, ebenfalls mit `defer`. |
| Mitarbeiter- und Zeiterfassungszugang | Die bestehende Rollentrennung bleibt bestehen. Mitarbeitende erhalten keine nachgeladene Verwaltungsphase. Der Zeiterfassungszugang bleibt auf seine freigegebene Ansicht begrenzt. |
| QR-Terminal | Ein natives Modul mit einer kleinen Abhängigkeit. Die Abhängigkeit wird früh mit `modulepreload` angefordert. Kein Verwaltungsloader und kein Caching geheimer Terminal-URLs. |
| Demo-Anmeldeseite | Kleine API-Integration plus Formular. Die unmittelbare Abhängigkeit des Formularskripts bleibt erhalten. |
| Demo-Abschluss, Impressum, Datenschutz | Keine Verwaltungs-/Planungsmodule; kein zusätzlicher Loader erforderlich. |
| PDF / Excel / Scanner | Bibliotheken werden schon beim tatsächlichen Export bzw. Scannerstart angefordert. Keine große Export-/Kamerabibliothek wird zusätzlich in den Seitenstart verlagert. |
| Netzwerkverbindungen | Die bestehende CDN- und Supabase-Verbindung kann durch `preconnect` früh vorbereitet werden. SDK-Versionen und Authentifizierungsverfahren bleiben unverändert. |
| PWA und Cache | Sicherheitskritische Integrationen behalten ihre Netzprüfung. Neue Laufzeitdateien haben eigene Cache-Versionen. Keine Datenbankantworten, Zugangsdaten oder Terminal-URLs werden zusätzlich gecacht. |

## Verifikation

- Funktionstests prüfen geordnete Seiten-/Basisbereitschaft, Demo-Auswahl, vorhandene Rollenphasen, Hilfe-Steuerung und eindeutige Einbindungen.
- GitHub-Actions-Browserprüfung lädt die tatsächliche Hauptseite und Integrationen mit einem isolierten Authentifizierungs-/Datenrand. Produktive Anmeldungen und Datenänderungen sind ausgeschlossen.
- Ein vergleichbarer Test mit 35 ms Verzögerung je Asset erfasst HTML-Aufbau, DOM-Bereitschaft und Initialisierung. Diese Zahlen sind Testmessungen, keine Messung einer angemeldeten Produktionssitzung.
- Prüfung für unangemeldete Besucher sowie Owner, Admin, Planer, Dispatcher, Viewer, Mitarbeiter und Zeiterfassung. Zusätzlich Navigation, Schichtdialog, Hilfe, Hell/Dunkel und schmale Darstellung.
- Vor IONOS-Veröffentlichung laufen die bestehenden Browserprüfungen für Heute, Auswertungen, Simulation, Wunschplanung, Übergabe und Auto-Planung. Die Live-Prüfung vergleicht die ausgelieferten Dateien mit dem Release.

Eine weitere Aufteilung der gemeinsam verwendeten Fachmodule braucht eine gesonderte Abhängigkeitsanalyse: Viele Integrationen erweitern bei ihrer Initialisierung bestehende Funktionen. Sie lassen sich nicht durch das Entfernen einzelner Skript-Tags zuverlässig auf einen späteren Seitenaufruf verschieben. Die aktuelle Änderung erhält diese Abhängigkeiten und optimiert den gemeinsamen Ladeweg.
