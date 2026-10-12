# Hilfe-Center-Funktionsabgleich – 12.10.2026

Geprüfter Funktionsstand: Produktionsbranch codex/ionos-migration, Commit 1ab633a34363f39c256bd1b5a2ef3c23dbed2282.

Die aktive Hilfe enthält jetzt **204 Artikel in 21 Kategorien**. **27 Artikel wurden ergänzt, zehn bestehende Antworten korrigiert**. Die vier vorhandenen Assistentenartikel sind in die eigene Kategorie „Planungsassistent“ umgezogen.

## Tatsächlich angezeigte Hilfe

Maßgeblich sind help-center-content-v3.js und help-center-renderer-v2.js, eingebunden in index.html. Die älteren Hilfebuilder bilden nicht den aktuellen Hauptinhalt. Hierdurch fiel die noch manuell beschriebene Teamleiter-Zuordnung auf; die aktive Hilfe beschreibt jetzt die automatische Regel, Führungskraft-Sperren, MFA und die ausdrücklich beibehaltene Trennung privater Personalakteninhalte.

## Abdeckung

| Kategorie | Artikel |
|---|---:|
| Erste Schritte | 8 |
| Heute & Übersicht | 6 |
| Dienstplan | 11 |
| Mitarbeiter & Rhythmus | 10 |
| Zeiterfassung | 12 |
| QR-Zeiterfassung | 12 |
| Abwesenheiten | 6 |
| Auto-Planung | 16 |
| Planungsassistent | 7 |
| Personalsimulator | 14 |
| Wunschplanung & Fairness | 11 |
| Auswertungen & DATEV | 8 |
| Einstellungen & Sicherheit | 15 |
| Mitarbeiterportal | 14 |
| Design & PWA | 5 |
| Fehler & Hilfe | 10 |
| Schicht-Marktplatz | 3 |
| Störfall-Autopilot | 2 |
| Personalakte & Fristen | 11 |
| Benutzer & Sicherheit | 10 |
| Schichtübergabe & Leistungsbericht | 13 |

Das Inventar enthält alle **192 JavaScript-Module unter assets** sowie drei bereits dokumentierte SQL-Quellen der Schichtübergabe. Es unterscheidet fachliche Funktionen, unterstützende Module und ältere Komponenten. Die neuen und korrigierten Artikel haben konkrete Quellennachweise. categoryCoverage wurde für alle Kategorien vollständig erneuert.

## Wesentliche Ergänzungen und Korrekturen

- Automatische Personalgesprächs-Zuordnung, ausgeschlossene Führungsprofile, Unterschied zwischen beruflicher Funktion und Zugangsrolle, Qualifikationsfreigabe und deren Widerruf sowie Gesprächsprotokollierung.
- Anmeldung, animierter Einstieg, vier Startschritte, Nachladen der Bereiche, Abmeldung, Fehlerzustände und messbarer Auto-Planungsfortschritt.
- Eigenständige Assistentenhilfe zu Belastungsprüfung, Stundenverbesserung, Simulation, bestätigter Entwurfsübernahme und lokal gespeicherten Planungsgründen.
- Abwesenheitsarten, stundenweise Anträge, freiwilliger Kommentar, Status/Rückmeldung, offene Antragszahlen und Zugriffsgrenzen für Krankheitsgründe.
- Zeitrechte getrennt von Personal-/Abwesenheitsverwaltung und administrativem Monatsabschluss; Tag/KW/Monat/eigenes Datum; persönlicher QR-Verlauf und Monatswahl der eigenen Schichten.
- Wunschplanung und Schichtübergabe in der Portalübersicht; Nachtzeitraum 22:00–06:00 in der unverbindlichen Lohnvorschau; Schriftgröße, Kontrast und Dichte; Schichtmodelle; Rückziehen aller offenen Marktplatzangebote.

## Suche und Pflege

Die Suche prüft mehrere Wörter unabhängig von ihrer Reihenfolge, vereinheitlicht Schreibweise und Akzente und erkennt 2FA/Zwei-Faktor/AAL2 als MFA. Sie verwendet weiterhin nur die für das aktuell angemeldete Unternehmen freigegebenen privaten Antworten. Beispiele sind allgemein gehalten. Die Cache-Versionen der aktiven Inhalts- und Rendererdatei sind erneuert.

## Verifikation und Grenzen

Die Tests führen den tatsächlich eingebundenen Renderer aus und prüfen alle Kategorien, alle neuen Artikel, Mehrwortsuche, aktuelle Teamleiter-Anleitungen, den vollständigen Modulbestand, Quellen und bestehende bebilderte Anleitungen. Private mandantenabhängige Hilfeantworten werden nur im angemeldeten aktuellen Unternehmenskontext eingeblendet und weiterhin HTML-sicher ausgegeben.

Die Browserprüfung nutzt die echte Hilfemarkup-/Styles-/Renderer-Kombination mit einem fiktiven Seitenkontext in vier Desktop-/Mobil- und Hell-/Dunkelvarianten, einschließlich 320 px mit großer Schrift. Sie prüft Suche, aktuelle Gesprächsrechte, Artikelöffnung, QR-Abbildungen, Tastaturöffnung und Schließen.

Dies ist ein Inhalts- und Bedienungsabgleich. Er belegt weder eine allgemeine Datenschutz-/Rechtskonformität noch die Freischaltung jeder Funktion für jede Rolle. Ein angemeldeter Live-Durchlauf sämtlicher Geschäftsabläufe ist kein Bestandteil dieses Hilfeupdates. Veröffentlichungsstatus und unveränderte Auslieferung der geprüften Dateien sind separat zu kontrollieren.
