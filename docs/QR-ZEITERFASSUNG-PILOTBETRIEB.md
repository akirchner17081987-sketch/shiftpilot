# SchichtFunk – QR-Zeiterfassung: kontrollierter Pilotbetrieb

Stand: 08.09.2026

## Ziel

Die QR-Zeiterfassung wird nicht sofort allgemein freigegeben. Der erste reale Test erfolgt mit **genau einem QR-Terminal und genau einem ausdrücklich freigegebenen Test-Mitarbeiter**. Alle anderen Mitarbeiter werden serverseitig abgewiesen.

## Technische Pilot-Sperren

- Neue QR-Terminals werden **deaktiviert** angelegt.
- Jedes Terminal befindet sich zunächst im **Pilotmodus**.
- Ein Terminal kann erst aktiviert werden, wenn ein Pilot-Mitarbeiter zugeordnet wurde.
- Als Pilot-Mitarbeiter ist nur ein Datensatz zulässig, der
  - zum selben Unternehmen gehört,
  - `status = active` besitzt und
  - mit einem Supabase-Login (`auth_user_id`) verknüpft ist.
- Statusabfrage und CLOCK_IN/CLOCK_OUT prüfen die Pilotfreigabe serverseitig.
- Die interne ungeprüfte Buchungsfunktion ist in das Schema `private` verschoben und nicht für `anon`/`authenticated` ausführbar.
- Ein zusätzlicher Datenbank-Trigger verhindert QR-Punches außerhalb der Pilotfreigabe.
- Dispatcher/Planer dürfen den Pilotstatus nur lesen; OWNER/ADMIN dürfen zuordnen und aktivieren.
- Der Pilot-Mitarbeiter kann bei aktivem Terminal nicht gewechselt werden. Das Terminal muss zuvor deaktiviert werden.

## Aktueller Readiness-Status

**Noch nicht startbereit:** In der Produktivdatenbank gibt es derzeit keinen Mitarbeiter, der gleichzeitig aktiv und mit einem Login verknüpft ist. Vor der Live-Aktivierung muss daher genau ein Test-Mitarbeiter vollständig für das Mitarbeiterportal aktiviert werden.

Die QR-Migrationen sind weiterhin **nicht auf die Produktivdatenbank angewendet**.

## Voraussetzungen für den Pilot

1. Einen geeigneten Test-Mitarbeiter auswählen.
2. Mitarbeiterstatus auf aktiv prüfen.
3. Persönlichen SchichtFunk-Zugang vollständig einrichten und Login erfolgreich testen.
4. Eine veröffentlichte Testschicht für diesen Mitarbeiter vorbereiten.
5. Sicherstellen, dass der betreffende Abrechnungsmonat nicht abgeschlossen ist.
6. Einen konkreten Teststandort für das QR-Terminal festlegen.
7. Für den Test ein Smartphone mit normaler Kamera und Internetzugang bereithalten.

## Kontrollierte Live-Aktivierung

Erst wenn alle Voraussetzungen erfüllt sind:

1. Aktuellen Produktionsstand und Datenbankstatus prüfen.
2. QR-Migrationen in ihrer Reihenfolge kontrolliert auf Supabase anwenden.
3. Datenbank-Advisors/Sicherheitsprüfung ausführen.
4. Verifizieren, dass die neuen RPCs vorhanden sind und nur die vorgesehenen Rollen Ausführungsrechte besitzen.
5. Im Bereich **Zeiterfassung → QR-Terminals** genau ein Pilot-Terminal anlegen.
6. Das Terminal bleibt zunächst **deaktiviert**.
7. Genau den Test-Mitarbeiter als Pilot-Mitarbeiter auswählen.
8. QR-Code speichern/ausdrucken und am Teststandort bereitstellen.
9. Testschicht veröffentlichen und Zuordnung kontrollieren.
10. Erst unmittelbar vor dem Test das Terminal aktivieren.

## Pilot-Testablauf

### A. Einstempeln

1. Test-Mitarbeiter scannt den QR-Code mit der Smartphone-Kamera.
2. Anmeldung mit dem persönlichen Mitarbeiterkonto, falls noch keine Sitzung besteht.
3. SchichtFunk zeigt Terminal, Schicht, Planzeit und geplante Pause.
4. Mitarbeiter bestätigt **„Arbeitszeit jetzt starten“**.
5. Prüfen:
   - ein `CLOCK_IN`-Punch wurde erzeugt,
   - `time_entries.actual_start` entspricht der Serverzeit,
   - Status des Zeiteintrags ist `open`,
   - Audit-Event `TIME_QR_CLOCK_IN` existiert.

### B. Negativtest

Mit einem anderen Mitarbeiterkonto denselben QR-Code öffnen.

**Erwartung:** Schichtdetails und Buchung werden serverseitig verweigert. Es darf kein Punch und kein Zeiteintrag entstehen.

### C. Ausstempeln

1. Pilot-Mitarbeiter scannt denselben QR-Code erneut.
2. SchichtFunk erkennt die offene QR-Buchung.
3. Mitarbeiter bestätigt **„Arbeitszeit jetzt beenden“**.
4. Prüfen:
   - `CLOCK_OUT` wurde erzeugt,
   - `time_entries.actual_end` entspricht der Serverzeit,
   - Status wechselt auf `recorded`,
   - Soll-/Ist-Zeit ist in der bestehenden Zeiterfassung sichtbar,
   - Audit-Event `TIME_QR_CLOCK_OUT` existiert.

## Abnahmekriterien

Der Pilot ist erfolgreich, wenn alle Punkte erfüllt sind:

- [ ] Nur der freigegebene Pilot-Mitarbeiter kann den QR-Code nutzen.
- [ ] Ein anderer Mitarbeiter erhält keinen Zugriff auf Schichtdetails oder Buchung.
- [ ] CLOCK_IN verwendet ausschließlich Serverzeit.
- [ ] CLOCK_OUT verwendet ausschließlich Serverzeit.
- [ ] Kein doppelter Punch durch schnellen Mehrfachscan.
- [ ] `time_entries` wird korrekt von `open` auf `recorded` geführt.
- [ ] Geplante Pause wird korrekt übernommen.
- [ ] Manager sieht die resultierende IST-Zeit in der normalen Zeiterfassung.
- [ ] Audit-Punches und Audit-Events sind vollständig vorhanden.
- [ ] Deaktivieren des Terminals sperrt den QR-Code sofort.
- [ ] Alter QR-Code ist nach Token-Rotation ungültig.

## Abschluss des Piloten

Nach dem Test wird das Terminal zunächst wieder **deaktiviert**. Erst nach Auswertung der Buchungen und der Audit-Daten wird entschieden, ob der Pilot wiederholt oder für weitere Mitarbeiter erweitert wird.

## Rückfallplan

Bei einem Fehler:

1. QR-Terminal sofort deaktivieren.
2. Bei Verdacht auf Weitergabe des QR-Codes den Terminalschlüssel rotieren.
3. Betroffene Zeitbuchung über den bestehenden Manager-Korrekturprozess prüfen/korrigieren.
4. QR-Funktion nicht weiter freigeben, bis Ursache und Audit-Daten geprüft sind.
5. Die bestehende manuelle Zeiterfassung bleibt als Fallback unverändert verfügbar.

## Bekannte Grenze des statischen QR-Codes

Ein statischer QR-Code kann fotografiert oder weitergegeben werden. Der Pilot verhindert Fremdbuchungen durch persönliche Anmeldung und die serverseitige Mitarbeiterfreigabe, beweist aber nicht die physische Anwesenheit am Standort. Für eine spätere Ausbaustufe kommen dynamische QR-Codes, Geoposition oder NFC/Terminal-Hardware infrage.
