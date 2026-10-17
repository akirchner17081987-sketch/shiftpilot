# Mitarbeiterportal – Überarbeitung vom 17.10.2026

Das Mitarbeiterportal behält die Orbit-Navigation mit vier Kategorien. Alle 13 Bereiche verwenden gemeinsame, kontrastreiche Flächen und Statusfarben. Wiederholte Überschriften werden reduziert, mobile Kopfbereiche und Dock werden kompakter. Die Stammdatenwarnung ist aufklappbar und führt zum Profil.

## Funktionen

- Übersicht: eigene offene Tauschantworten, Freizeitzusagen mit Freigabeanfrage sowie persönliche Übergabeaufgaben und ausstehende Übernahmen ergänzen die vorhandenen Aufgaben. Übergaben werden für den Zeitraum sieben Tage zurück bis sieben Tage voraus berücksichtigt. Keine pauschale Aussage „Alles erledigt“ über nicht erfasste Bereiche.
- Navigation: Zahlen signalisieren offene Antworten oder Aufgaben, keine historische Gesamtmenge.
- Ersatzanfragen: aktive Angebote nach Frist, sichtbare Antwortfrist und eingeklappter Verlauf. Abgelaufene Angebote erhalten keine Antwortbuttons.
- Marktplatz: Filter nach Unternehmensdatum, tatsächlichem Standort und passenden Diensten; abgeschlossene eigene Vorgänge im Verlauf.
- Meine Schichten: lokale ICS-Datei des ausgewählten Monats mit ausschließlich freigegebenen Diensten, stabilen UIDs, UTC-Zeiten und Standort. Der Export ist eine Momentaufnahme, kein Kalenderabo.
- Schichtänderungen: tatsächlich geänderte Felder der angefragten Variante werden zusätzlich mit „Geändert“ gekennzeichnet.
- Schichttausch: nächster Bearbeitungsschritt und zuständige Person werden ausdrücklich angezeigt.
- Arbeitszeit: die Übersicht öffnet den Startmonat einer laufenden QR-Buchung, auch über Monatsgrenzen hinweg.
- Stundenkonto: der Link zu Arbeitszeit übernimmt den ausgewählten Monat. Aktualisierungszeiten verwenden die Unternehmenszeitzone.
- Wunschplanung: direkter Einstieg in das neue Wunschformular und Verknüpfung zu offenen Freigabeanfragen.
- Übergabe: relevante eigene Übergabe vorausgewählt; persönliche und überfällige offene Aufgaben zuerst.
- Lohnvorschau: Stundenlohn optional als private Vorgabe ab einem bestimmten Monat. Monatliche Einzelwerte haben Vorrang; die Vorgabe lässt sich entfernen. Speicherung bleibt nach Benutzer, Unternehmen und Mitarbeiter getrennt auf dem Gerät.
- Profil/Abwesenheit: eine Auskunft zum fehlenden Urlaubskonto öffnet eine vorausgefüllte Korrekturanfrage. Sie wird erst durch explizites Absenden verschickt.

## Datenbasis und Grenzen

Ein verbindlicher Urlaubsanspruch einschließlich Übertrag und tatsächlichem Verbrauch ist im vorhandenen Datenmodell nicht hinterlegt. Es wird kein Resturlaub aus Kalendertagen geschätzt. Ein echtes Urlaubskonto benötigt diese fachlichen Stammdaten.

Die bestehende lesende RPC `employee_home_summary` wurde erweitert. Alle Zähler und Standortdaten werden auf den angemeldeten, aktiven Mitarbeiter und das ausgewählte Unternehmen beschränkt. Der öffentliche Wrapper und die bestehenden Berechtigungen bleiben erhalten; anonyme und reine Zeiterfassungszugänge sind ausgeschlossen. Migration: `20261017193021_employee_portal_actions_v2.sql`.

## Prüfung

- 933 Node-Prüfungen erfolgreich, einschließlich SQL-Tests für fremde Unternehmen, fremde Mitarbeiter, erledigte Vorgänge und Zugriffsgrenzen sowie Kalenderexport mit Zeitumstellung und UTF-8-Zeilenfaltung.
- Portal-Browserprüfung: alle 13 Bereiche bei 1440, 390 und 360 Pixeln, Hell/Dunkel, Filter, Kalenderdownload, Monatsverknüpfungen, Lohnvorgabe, Profilformular und Textkontraste der gefüllten Karten.
- Bestehende Browserprüfungen für persönliche Übersicht, Wunschplanung, Marktplatz, Lohnvorschau und Übergabe erfolgreich.
- Zusätzliche Prüfung mit echtem Mitarbeiter-Testzugang und produktiven Lese-APIs; dabei keine Personaldaten oder Anträge verändert.
- Supabase-Sicherheitsprüfung vor/nach Migration: unverändert 13 bestehende Informationshinweise und 40 bestehende Warnungen, keine zusätzlichen Befunde.
