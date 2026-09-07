# SchichtFunk – QR-Zeiterfassung: kontrollierter Pilotbetrieb

Stand: 08.09.2026

## Ziel

Die QR-Zeiterfassung wird nicht sofort allgemein freigegeben. Der erste reale Test erfolgt mit **genau einem QR-Terminal und genau zwei ausdrücklich freigegebenen Test-Mitarbeitern**. Alle anderen Mitarbeiter werden serverseitig abgewiesen.

## Verbindliche Pilot-Mitarbeiter

Für den ersten Pilotbetrieb sind festgelegt:

1. **Saskia Frank – Personal-Nr. 37**
2. **Alexander Kirchner – Personal-Nr. 119 (Mitarbeiterkonto)**

Live-Prüfung am 08.09.2026:

- beide Mitarbeiter stehen auf `status = active`,
- beide Mitarbeiter besitzen eine `auth_user_id`,
- beide zugehörigen Auth-Konten sind bestätigt und nicht gesperrt,
- beide gehören demselben Unternehmen an.

Die Mitarbeiter werden nicht über fest einprogrammierte Datenbank-IDs freigeschaltet, sondern kontrolliert über die serverseitige Pilot-Whitelist des jeweiligen QR-Terminals.

## Veröffentlichtes Testschicht-Set

Für den ersten realen QR-Pilot sind in der Produktivdatenbank ausdrücklich als **QR-PILOT TEST** gekennzeichnete Schichten veröffentlicht:

- **Saskia Frank – Pers.-Nr. 37:** OT1, 08.09.2026, 06:00–16:00 Uhr, 60 Minuten geplante Pause. Assignment-ID: `689ff512-96d6-4c45-beb8-2a22ec50fff8`.
- **Alexander Kirchner – Pers.-Nr. 119:** O1, 08.09.2026 18:00 Uhr bis 09.09.2026 04:00 Uhr, 60 Minuten geplante Pause. Assignment-ID: `4826ebe8-1d5c-456a-b639-6e078b92322d`.

Beide Schichten wurden vor dem Insert gegen die bestehenden Standard-Schichtregeln geprüft. Zum Veröffentlichungszeitpunkt bestanden weder kollidierende Schichten noch wirksame Abwesenheiten. September 2026 ist nicht abgeschlossen. Beide Veröffentlichungen wurden durch den bestehenden Audit-Trigger erfasst und lösten je eine Mitarbeiter-Benachrichtigung aus. Es existiert bewusst noch kein `time_entries`-Datensatz; die IST-Zeit soll erst durch den QR-Pilot entstehen.

## Technische Pilot-Sperren

- Neue QR-Terminals werden **deaktiviert** angelegt.
- Jedes Terminal befindet sich zunächst im **Pilotmodus**.
- Ein Terminal kann erst aktiviert werden, wenn mindestens ein Pilot-Mitarbeiter zugeordnet wurde.
- Mehrere ausdrücklich freigegebene Pilot-Mitarbeiter können dasselbe Test-Terminal verwenden.
- Als Pilot-Mitarbeiter sind nur Datensätze zulässig, die
  - zum selben Unternehmen gehören,
  - `status = active` besitzen und
  - mit einem Supabase-Login (`auth_user_id`) verknüpft sind.
- Statusabfrage und CLOCK_IN/CLOCK_OUT prüfen die Pilotfreigabe serverseitig.
- Die interne ungeprüfte Buchungsfunktion liegt im Schema `private` und ist nicht für `anon`/`authenticated` ausführbar.
- Ein zusätzlicher Datenbank-Trigger verhindert QR-Punches außerhalb der Pilotfreigabe.
- Dispatcher/Planer dürfen den Pilotstatus nur lesen; OWNER/ADMIN dürfen die Whitelist ändern und Terminals aktivieren.
- Die Pilotliste kann bei aktivem Terminal nicht geändert werden. Das Terminal muss zuvor deaktiviert werden.
- Die Pilot-Whitelist besitzt RLS und keine direkten Client-Rechte.

## Aktueller Readiness-Status

**Mitarbeiterkonten bereit:** Saskia Frank und Alexander Kirchner erfüllen die technischen Login-Voraussetzungen.

**Testschichten bereit und veröffentlicht:** Beide Pilot-Mitarbeiter besitzen je eine passende veröffentlichte Testschicht mit geplanter Pause und eindeutiger QR-Pilot-Kennzeichnung.

**Noch nicht live aktiviert:** Die QR-Migrationen sind weiterhin **nicht auf die Produktivdatenbank angewendet**. Es existiert daher noch kein aktives Produktiv-QR-Terminal.

## Voraussetzungen für den Pilot

1. Saskia Frank und Alexander Kirchner als Pilot-Mitarbeiter beibehalten.
2. Mitarbeiterstatus und Login-Verknüpfung unmittelbar vor dem Test nochmals prüfen.
3. Persönlichen SchichtFunk-Login mit beiden Mitarbeiterkonten erfolgreich testen.
4. Die bereits veröffentlichten Testschichten und deren Zeitfenster kontrollieren.
5. Einen konkreten Teststandort für das QR-Terminal festlegen.
6. Für den Test mindestens ein Smartphone mit normaler Kamera und Internetzugang bereithalten.
7. Einen dritten, **nicht freigegebenen** Mitarbeiter für den Negativtest verwenden.

## Kontrollierte Live-Aktivierung

Erst wenn alle Voraussetzungen erfüllt sind:

1. Aktuellen Produktionsstand und Datenbankstatus prüfen.
2. QR-Migrationen in ihrer Reihenfolge kontrolliert auf Supabase anwenden.
3. Datenbank-Advisors/Sicherheitsprüfung ausführen.
4. Verifizieren, dass die neuen RPCs vorhanden sind und nur die vorgesehenen Rollen Ausführungsrechte besitzen.
5. Im Bereich **Zeiterfassung → QR-Terminals** genau ein Pilot-Terminal anlegen.
6. Das Terminal bleibt zunächst **deaktiviert**.
7. In der Pilot-Whitelist genau **Saskia Frank (Pers.-Nr. 37)** und **Alexander Kirchner (Pers.-Nr. 119)** auswählen.
8. Prüfen, dass keine weiteren Mitarbeiter ausgewählt sind.
9. QR-Code speichern/ausdrucken und am Teststandort bereitstellen.
10. Die bereits veröffentlichten Testschichten nochmals kontrollieren.
11. Erst unmittelbar vor dem Test das Terminal aktivieren.

## Pilot-Testablauf

### A. Saskia Frank – Einstempeln und Ausstempeln

1. Saskia scannt den QR-Code mit der Smartphone-Kamera.
2. Anmeldung mit ihrem persönlichen Mitarbeiterkonto, falls noch keine Sitzung besteht.
3. SchichtFunk zeigt Terminal, Schicht, Planzeit und geplante Pause.
4. Saskia bestätigt **„Arbeitszeit jetzt starten“**.
5. Prüfen:
   - ein `CLOCK_IN`-Punch wurde erzeugt,
   - `time_entries.actual_start` entspricht der Serverzeit,
   - Status des Zeiteintrags ist `open`,
   - Audit-Event `TIME_QR_CLOCK_IN` existiert.
6. QR-Code später erneut scannen und **„Arbeitszeit jetzt beenden“** bestätigen.
7. Prüfen:
   - `CLOCK_OUT` wurde erzeugt,
   - `time_entries.actual_end` entspricht der Serverzeit,
   - Status wechselt auf `recorded`,
   - Soll-/Ist-Zeit ist in der normalen Zeiterfassung sichtbar,
   - Audit-Event `TIME_QR_CLOCK_OUT` existiert.

### B. Alexander Kirchner – Einstempeln und Ausstempeln

Der gleiche Ablauf wird anschließend mit **Alexander Kirchner, Personal-Nr. 119, Mitarbeiterkonto** wiederholt. Die Buchungen müssen ausschließlich Alexanders veröffentlichter Schicht und seinem Mitarbeiterdatensatz zugeordnet werden.

### C. Negativtest

Mit einem dritten, nicht in der Pilot-Whitelist enthaltenen Mitarbeiterkonto denselben QR-Code öffnen.

**Erwartung:** Schichtdetails und Buchung werden serverseitig verweigert. Es darf kein Punch und kein Zeiteintrag entstehen.

## Abnahmekriterien

Der Pilot ist erfolgreich, wenn alle Punkte erfüllt sind:

- [ ] Saskia Frank kann den freigegebenen QR-Code verwenden.
- [ ] Alexander Kirchner kann den freigegebenen QR-Code verwenden.
- [ ] Ein nicht freigegebener Mitarbeiter erhält keinen Zugriff auf Schichtdetails oder Buchung.
- [ ] Saskias Buchungen werden ausschließlich Saskia zugeordnet.
- [ ] Alexanders Buchungen werden ausschließlich Alexander zugeordnet.
- [ ] CLOCK_IN verwendet ausschließlich Serverzeit.
- [ ] CLOCK_OUT verwendet ausschließlich Serverzeit.
- [ ] Kein doppelter Punch durch schnellen Mehrfachscan.
- [ ] `time_entries` wird korrekt von `open` auf `recorded` geführt.
- [ ] Geplante Pause wird korrekt übernommen.
- [ ] Manager sieht die resultierende IST-Zeit beider Mitarbeiter in der normalen Zeiterfassung.
- [ ] Audit-Punches und Audit-Events sind vollständig vorhanden.
- [ ] Deaktivieren des Terminals sperrt den QR-Code sofort.
- [ ] Alter QR-Code ist nach Token-Rotation ungültig.

## Abschluss des Piloten

Nach dem Test wird das Terminal zunächst wieder **deaktiviert**. Erst nach Auswertung der Buchungen und Audit-Daten von Saskia Frank und Alexander Kirchner wird entschieden, ob der Pilot wiederholt oder für weitere Mitarbeiter erweitert wird.

## Rückfallplan

Bei einem Fehler:

1. QR-Terminal sofort deaktivieren.
2. Bei Verdacht auf Weitergabe des QR-Codes den Terminalschlüssel rotieren.
3. Betroffene Zeitbuchung über den bestehenden Manager-Korrekturprozess prüfen/korrigieren.
4. QR-Funktion nicht weiter freigeben, bis Ursache und Audit-Daten geprüft sind.
5. Die bestehende manuelle Zeiterfassung bleibt als Fallback unverändert verfügbar.

## Bekannte Grenze des statischen QR-Codes

Ein statischer QR-Code kann fotografiert oder weitergegeben werden. Der Pilot verhindert Fremdbuchungen durch persönliche Anmeldung und die serverseitige Mitarbeiterfreigabe, beweist aber nicht die physische Anwesenheit am Standort. Für eine spätere Ausbaustufe kommen dynamische QR-Codes, Geoposition oder NFC/Terminal-Hardware infrage.
