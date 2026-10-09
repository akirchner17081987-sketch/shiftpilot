# HilfeCenter-Funktionsabgleich – 09.10.2026

Basis: Produktionsbranch `codex/ionos-migration`, Commit `903292a42d0fecf95ad387bffb414ed2e5fcde54`.

128 Artikel in 17 Kategorien, davon 38 ergänzt. Zwei bestehende Antworten und die Veröffentlichungsanleitung fachlich korrigiert. Beide geänderten Hilfe-Skripte erhalten eine neue Cache-Version.

## Umfang und Methode

Abgleich der verfügbaren Client-Funktionen und Rollenschranken mit den Hilfeartikeln. Das Inventar umfasst alle 170 JavaScript-Dateien unter assets sowie die Einbindung in index.html. Nicht jede Datei ist eine eigenständige Funktion: Layout-Erweiterungen, Backend-Brücken, Schutzmechanismen, Demo- und Legacy-Module sind entsprechend zugeordnet. Das maschinenlesbare Inventar enthält zusätzlich die Quellennachweise jedes neuen Artikels. Backend-Freischaltung, aktive Mandantenkonfiguration und tatsächliche Berechtigungen können die Verfügbarkeit einschränken.

## Abdeckung

| Hilfebereich | Artikel | Abgedeckte Inhalte |
|---|---:|---|
| Erste Schritte | 9 | Anmeldung, Navigation und Demo |
| Heute & Übersicht | 4 | Live-Besetzung und Einsatzbereitschaft |
| Dienstplan | 11 | Planen, prüfen, importieren und veröffentlichen |
| Mitarbeiter & Rhythmus | 9 | Profile, Freigaben und wiederkehrende Regeln |
| Zeiterfassung | 11 | Geplante und tatsächliche Zeiten |
| QR-Zeiterfassung | 12 | Terminals, Scans, Pausen und Auswertung |
| Abwesenheiten | 3 | Anträge, Freigaben und Konflikte |
| Auto-Planung | 14 | Vorschläge und Planungsregeln |
| Auswertungen & DATEV | 5 | Monatsberichte, Exporte und Lohnübergabe |
| Einstellungen & Sicherheit | 9 | SOLL-Werte, Rollen und Schutz des Zugangs |
| Mitarbeiterportal | 12 | Eigene Schichten, Anträge und Mobilansicht |
| Design & PWA | 4 | Hell/Dunkel und Nutzung auf dem Smartphone |
| Fehler & Hilfe | 8 | Häufige Probleme und erste Schritte |
| Schicht-Marktplatz | 2 | Offene Plätze und freiwillige Zusatzdienste |
| Störfall-Autopilot | 2 | Akute Ausfälle und Ersatzanfragen |
| Personalakte & Fristen | 5 | Dokumente, Nachweise und Profilkorrekturen |
| Benutzer & Sicherheit | 8 | Rollen, Unternehmen und Datenschutz |

## Wesentliche Korrekturen

- Zentrale Arbeitszeiten enthalten abgeschlossene QR-Dienste und bestätigte Ist-Zeiten mit Überschneidungsbereinigung. Die separate QR-Liste darf nicht zusätzlich aufsummiert werden.
- Veröffentlichung bezieht sich auf den angezeigten Wochen- oder Monatszeitraum.
- DATEV setzt administrative Rechte, Konfiguration und abgeschlossene Monatsrevision voraus; der Download ist keine automatische Übertragung.
- Normales Entfernen eines Mitarbeiters erhält Zeit-/Abrechnungshistorie; vollständige Datenlöschung ist eine gesonderte Inhaberaktion.
- Profilanfragen ändern keine Stammdaten automatisch.
- Individuelle Blockverteilung ist bedingt verfügbar; bestätigte Planungsregeln haben Vorrang.
- Die bestätigten OT1/OT2/OT3-Regeln, drei Tagdienstmitarbeiter und gesonderten OT-Wochenend-/Feiertagsregeln bleiben bestehen.

## Prüfung und Grenzen

Der Regressionstest führt den tatsächlich eingebundenen Hilfe-Renderer mit einer DOM-Testumgebung aus, prüft alle Kategorien, die Suche nach jedem neuen Artikel, bestehende bebilderte Anleitungen und die Referenzen des Quellinventars. CI prüft zusätzlich die bestehenden Anwendungsregressionen und den Produktionsbuild. Keine Dienstpläne, Mitarbeiterdaten, Zeitbuchungen oder Datenschutzfreigaben werden durch dieses Update geändert.

Ein angemeldeter Live-Durchlauf aller Rollen wurde nicht durchgeführt: Die sichere Anmeldung war zuvor abgelehnt worden. Der Abgleich belegt die Dokumentationsabdeckung des genannten Implementierungsstands, keine Freischaltung sämtlicher Funktionen für jedes Konto und keine Prüfung der tatsächlichen serverseitigen Erinnerungszustellung. Deployment und öffentliche Auslieferung sind separat zu verifizieren.

## Pflege bei neuen Funktionen

Bei Funktionsänderungen betroffene Artikel, Rollen, Voraussetzungen und Quellen im Inventar aktualisieren. Den Hilfe-Regressionstest ausführen und bei Änderungen an Inhalt oder Anleitung die jeweilige Script-Version in index.html erhöhen.
