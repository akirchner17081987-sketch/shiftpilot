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

## Live-Pilotstand

Die vorbereiteten QR-Migrationen wurden am **08.09.2026 kontrolliert auf die Produktivdatenbank angewendet**.

Live vorhanden und geprüft:

- `time_qr_terminals` – RLS aktiv, keine direkten `anon`-/`authenticated`-DML-Rechte,
- `time_qr_punches` – RLS aktiv, keine direkten `anon`-/`authenticated`-DML-Rechte,
- `time_qr_pilot_employees` – RLS aktiv, keine direkten `anon`-/`authenticated`-DML-Rechte,
- interne QR-Hilfsfunktionen liegen im Schema `private`, besitzen einen leeren `search_path` und sind für `anon`/`authenticated` nicht direkt ausführbar,
- die vorgesehenen öffentlichen RPCs besitzen ebenfalls einen leeren `search_path` und sind nur für die vorgesehenen angemeldeten Aufrufe freigegeben,
- die Validierungs- und Punch-Guard-Trigger sind aktiv.

### Pilot-Terminal

Es existiert genau ein vorbereitetes Terminal:

- Name: **QR-Pilot Testterminal**
- Terminal-ID: `c7a931b4-bde8-472f-8bdf-66361c752c56`
- Status: **deaktiviert** (`is_active = false`)
- Modus: **Pilot** (`pilot_mode = true`)
- Startfenster: 120 Minuten vor Schichtbeginn
- Ausstempelfenster: 360 Minuten nach Schichtende
- Standortnotiz: `Kontrollierter Pilotbetrieb – Saskia Frank & Alexander Kirchner`

Die Whitelist enthält **exakt zwei Mitarbeiter**:

1. Saskia Frank – Pers.-Nr. 37
2. Alexander Kirchner – Pers.-Nr. 119

Ein Sperrtest mit einem freigegebenen Mitarbeiterkonto wurde bei deaktiviertem Terminal erfolgreich durchgeführt: die Statusabfrage wird serverseitig verweigert. Es wurden dabei **keine Punches und keine IST-Zeiteinträge** erzeugt.

Der Roh-Token des Terminals wird nicht in Klartext in der Datenbank gespeichert; dort liegt ausschließlich sein Hash.

## Aktueller Readiness-Status

**Bereit:** Mitarbeiterkonten, veröffentlichte Testschichten, QR-Datenbankmigrationen, Pilot-Terminal und Zwei-Personen-Whitelist.

**Weiterhin gesperrt:** Das Pilot-Terminal ist deaktiviert und hat noch keine Zeitbuchung erzeugt.

**Noch vor dem ersten Smartphone-Scan erforderlich:** Die QR-Seite muss im produktiven Vercel-Stand verfügbar sein. Am 08.09.2026 liefert `https://shiftpilot-two.vercel.app/qr-time.html` noch HTTP 404. Die Seite ist im Feature-Branch/Preview bereits erfolgreich verfügbar. Deshalb darf das Terminal vor der Produktivbereitstellung der QR-Seite nicht aktiviert werden.

## Voraussetzungen für den Pilot

1. Saskia Frank und Alexander Kirchner als Pilot-Mitarbeiter beibehalten.
2. Mitarbeiterstatus und Login-Verknüpfung unmittelbar vor dem Test nochmals prüfen.
3. Persönlichen SchichtFunk-Login mit beiden Mitarbeiterkonten erfolgreich testen.
4. Die bereits veröffentlichten Testschichten und deren Zeitfenster kontrollieren.
5. Produktive Verfügbarkeit von `/qr-time.html` herstellen und mit HTTP 200 prüfen.
6. Einen konkreten Teststandort für das QR-Terminal festlegen bzw. die bestehende Pilot-Standortnotiz konkretisieren.
7. Für den Test mindestens ein Smartphone mit normaler Kamera und Internetzugang bereithalten.
8. Einen dritten, **nicht freigegebenen** Mitarbeiter für den Negativtest verwenden.

## Kontrollierte Live-Aktivierung

Nach erfolgter Produktivbereitstellung der QR-Seite:

1. Aktuellen Produktionsstand und Datenbankstatus nochmals prüfen.
2. Verifizieren, dass `/qr-time.html` produktiv HTTP 200 liefert.
3. Prüfen, dass das Pilot-Terminal weiterhin deaktiviert ist.
4. Prüfen, dass die Whitelist exakt **Saskia Frank (Pers.-Nr. 37)** und **Alexander Kirchner (Pers.-Nr. 119)** enthält.
5. Prüfen, dass keine weiteren Mitarbeiter ausgewählt sind.
6. QR-Code mit dem gültigen Terminalschlüssel erzeugen/speichern und am Teststandort bereitstellen.
7. Die bereits veröffentlichten Testschichten nochmals kontrollieren.
8. Erst unmittelbar vor dem jeweiligen realen Scan-Test das Terminal aktivieren.
9. Nach dem Test das Terminal wieder deaktivieren.

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
