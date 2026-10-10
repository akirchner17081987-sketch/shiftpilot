# Personalbedarfs- und Ausfallsimulator

Der neue Bereich **Personalsimulator** ist für aktive Inhaber und Administratoren erreichbar. Er vergleicht den realen aktuellen Personalbestand mit bis zu drei selbst benannten Varianten für 3, 6 oder 12 Monate. Bereits angelegte Profile mit `__sp:planningPlaceholder=1` werden aus der Referenz ausgeschlossen und ihre Anzahl angezeigt.

## Bedienung

1. Startmonat und optionalen durchschnittlichen Arbeitgeberkostensatz je Vertragsstunde wählen, Daten laden.
2. Neue Stellen (0–20) mit Referenzprofil, Monatsstunden, Wochenmaximum und eigenem Kostensatz konfigurieren. Freigaben, Standort und verbindlicher Rhythmus des Referenzprofils werden übernommen; Personalnummern, personengebundene Sonderrechte und bestehende Abwesenheiten nicht.
3. Optional eine Vertragsänderung, zusätzlichen Bedarf je regulärem Einsatztag eines Modells oder einen konkreten Ausfall annehmen.
4. Varianten berechnen. Vergleich zeigt Personalzahl, gedeckten Bedarf, offene Dienste und Stunden, fehlende Zielstunden, Vertragsbudget und Differenz zur Referenz. Ein Ausfall wird zusätzlich mit derselben Variante ohne Ausfall verglichen.
5. Monatsdetails, Freigabeengpässe, Mitarbeiterziele und paginierte Planvorschau prüfen. CSV exportiert Vergleich und wesentliche Annahmen. Annahmen können unter einem Namen gespeichert, erneut geladen, geändert, kopiert und gelöscht werden.

## Rechenmodell und Grenzen

- Getrennte Neuplanung: reale Dienste innerhalb des Horizonts sind keine Bindung und werden niemals verändert. Vollständige Monate vor/nach dem Horizont sichern die zeitlichen Randbedingungen.
- Verwendet den bestehenden Optimierer und dieselben bestätigten Regeln Version 2. Freigaben, Vertragsdaten, persönliche Wochenlimits, verbindliche Rhythmen, genehmigte ganze/teilweise Abwesenheiten, Standortfeiertage, exklusive Mitarbeiter, gemeinsame Leitungsbesetzung und bedingte OT-Bedarfe werden geprüft.
- Geschützte Freizeitzusagen sperren bestehende Mitarbeiter auch in der Simulation. Offene Wünsche und historische Nacht-/Wochenendanteile sind weiche Präferenzen. Neue virtuelle Stellen übernehmen keine persönlichen Wünsche des Referenzprofils. Der Snapshot liefert dazu nur minimale Wunschdaten ohne Hinweise oder Entscheidungsgründe.
- Zusätzlicher Bedarf erhöht den Bedarf auf regulären Einsatztagen, bei Leitung den gemeinsamen Bedarf. Optionale Dienste werden ohne expliziten Zusatzbedarf nicht aufgefüllt.
- Suche im Worker: vier Verteilungen je Monat, auf 16 Zustände begrenzte Suche für Pflichtbesetzung; abbrechbar. Kein mathematischer Optimalitäts- oder Unmöglichkeitsnachweis. Restlücken können auch durch die gefundene Verteilung entstehen. Eine abschließende Regelprüfung verhindert das Anzeigen ungültiger Ergebnisse.
- Monatsziele werden bei Eintritt/Austritt kalendertäglich anteilig gerechnet. Dienststunden zählen innerhalb des Kalenderhorizonts; Nachtdienste zeitanteilig. Keine Abwesenheits-/Zeitkontogutschriften. Persönliche monatliche Zieldefizite werden je Monat berechnet und summiert, nicht mit Mehrstunden anderer Monate verrechnet.
- Budget = anteilige Vertragsstunden × manuell eingegebener Arbeitgeberkostensatz. Keine Abrechnung, keine automatische Zuschlags-/Nebenkostenberechnung, keine privaten Mitarbeiter-Lohndaten. Fehlende Kostensätze ergeben „Nicht angegeben“; explizit 0 bleibt möglich.
- Firmen ohne bestätigte Regeln Version 2 erhalten eine eindeutige Meldung statt einer unpassenden Simulation.

## Daten und Rechte

`staffing_simulator_snapshot` liefert ausschließlich erforderliche Planungsdaten. Abwesenheitsgründe, Kontaktdaten, Personalakten und private Lohnvorschauen werden nicht gelesen. Geschützte serverseitige Funktion prüft die aktive Firmenmitgliedschaft und OWNER/ADMIN; öffentlicher Wrapper ist invoker. Anonyme Zugriffe sind entzogen.

`staffing_simulations` speichert nur Annahmen, keine Planvorschauen, Mitarbeiterklarnamen oder berechneten Gehaltsdaten. RLS beschränkt Lesen auf Firmenadministratoren. Schreiben ausschließlich über autorisierte RPC, mit Versionsprüfung gegen gleichzeitiges Überschreiben, Datenmengenlimit und maximal 50 Vergleichen je Unternehmen. Löschen eines Mitarbeiters lässt eventuell gespeicherte Profilreferenzen ungültig werden; beim erneuten Berechnen wird eine neue Auswahl verlangt.

Firmen-/Rollenwechsel löschen den lokalen Zustand und beenden den Worker. Späte Antworten werden verworfen. Keine Schreibwege zu Dienstplan, Personalstamm oder Nachrichten. Der Simulator synchronisiert auch keine ungespeicherten operativen Entwürfe.

## Prüfung

### HilfeCenter

Eigene Kategorie **Personalsimulator** mit 14 Artikeln: Einstieg, Rollen und Voraussetzungen, Referenzprofile und Neueinstellungen, Vertragsänderung und Mehrbedarf, Ausfallvergleich, Kennzahlen, Vertragsziele, Arbeitgeberkosten, Engpässe und Planvorschau, Speichern/Laden/Kopieren/Löschen, CSV-Export, Abgrenzung zur operativen Planung, Aussagegrenzen und Fehlerhilfe. Die drei bisherigen Kurzartikel wurden aus Auto-Planung übernommen und erweitert. Zwei Anleitungen enthalten nummerierte Schritte mit den tatsächlichen Schaltflächennamen.

Alle Simulatorartikel und die zugehörigen Module sind im Hilfe-Inventar hinterlegt. Der bestehende Hilfe-Regressionstest prüft ihre Anzeige und Auffindbarkeit über die Suche. Die Live-Prüfung kontrolliert zusätzlich den exakten Inhalt der ausgelieferten Hilfe-Datei sowie deren neue Cache-Version in der Produktionsseite.

### Funktionsprüfung

Rechentests: Regeln, Monatsgrenzen, Sommerzeit, Teilabwesenheiten, Ausfälle, gemeinsame Leitung, Profilbindungen, Vertragsanteile, fehlende Kosten, ungültige Referenzen und bedingter Mehrbedarf. Vollständige bestehende Anwendungstests. Browserprüfung nutzt echte Assets und Worker mit synthetischen RPC-Daten für Vergleich, Details, Export, Speicherung, Abbruch, Fehler, Rechtewechsel und 320–1440px in Hell/Dunkel. Datenbank-Rollbackprüfung für Lesen/Speichern/Kopieren/Löschen, Revisionen und nicht berechtigte Zugriffe; Sicherheitsberater ohne neuen Simulatorbefund.
