# Mehrbenutzer- und Wiederverbindungstest – 19. Oktober 2026

## Ergebnis und Reichweite

Der technische Mehrbenutzertest mit zwei getrennten Chromium-Profilen ist bestanden.
Die tatsächlichen aktuellen Verwaltungs- und Mitarbeiteroberflächen laufen gleichzeitig
gegen einen gemeinsamen, synthetischen HTTP-Lesedienst. Die Personalnummer 119 in
dieser Fixture bezeichnet eine fiktive Testperson. Dieser automatisierte Teil
verwendet keine produktiven Konten. Der anschließend gemeinsam ausgeführte
Live-Sitzungstest ist unten getrennt dokumentiert.

Zusätzlich wurden die bestehenden produktiven Datenbankfunktionen in vollständig
zurückgerollten Fixtures geprüft. Die Datenbankrollen werden dabei tatsächlich
gewechselt; die JWT-Anmeldekontexte sind simuliert. Dies ist kein echter
Supabase-Auth-Login und kein Nachweis für einen parallelen Schreiblasttest.

## Live-Ergänzung: Verwaltung und Mitarbeiterportal um 13:33–13:38 Uhr

- Der Nutzer stellte eine tatsächlich angemeldete Verwaltungssitzung im Testbrowser
  bereit. Die sichtbare Oberfläche bestätigte die Rolle Inhaber, die verbundene Cloud
  und die laufende Tagesübersicht mit echten Daten.
- Mitarbeiter 119 wurde über die normale Mitarbeiterübersicht gezielt gefunden.
  Seine bestehenden QR-Buchungen konnten in der Verwaltungsansicht gefiltert und
  ein konkreter Vergleichseintrag für das Mitarbeiterportal bestimmt werden.
  Namen, konkrete Arbeitszeiten und weitere Personaldaten werden hier nicht publiziert.
- Nach einem echten Neuladen blieb die Verwaltung angemeldet und startete auf der
  Tagesübersicht.
- Der Nutzer bestätigte die parallele Anmeldung im Mitarbeiterportal auf seinem
  Handy und anschließend das erfolgreiche Aktualisieren nach dem angewiesenen
  Wechsel von WLAN auf Mobilfunk ohne erneute Anmeldung. Dies ist ein vom Nutzer
  durchgeführter und bestätigter Geräteversuch, keine autonome Handybedienung.
- Anschließend zeigte die Verwaltung weiterhin „Cloud verbunden“ und einen aktuellen
  Datenstand um 13:38 Uhr. Die mobile Sitzung störte die Verwaltungsanmeldung nicht.
- Es wurden über die Live-Oberflächen keine Dienstpläne oder Zeitbuchungen geändert.

Damit ist der Live-Verbindungs- und Sitzungstest mit parallel geöffneter Verwaltung
und Mitarbeiterportal bestanden. Die Rückmeldung zum Netzwechsel belegt allein
keinen unabhängigen numerischen Abgleich aller Handywerte und keinen Schreiblasttest.

## Browserprofile und Netzunterbrechung

`node tests/browser/multiuser-network-qa.cjs`

- Vollständige aktuelle Seite mit synthetischer Admin- und Mitarbeiteridentität,
  getrennten Browserkontexten, 1440 px Verwaltungsansicht und 390 px Mitarbeiterportal.
- Gleichzeitige, zeitlich überlappende HTTP-Anfragen lesen denselben Fixturezustand.
- Unterschiedliche Benutzeridentitäten und getrennte lokale Speicherung bestätigt.
  Das Mitarbeiterprofil erhält keine Verwaltungsschale.
- Das Mitarbeiterprofil wird über die Browser-Netzwerksimulation offline gesetzt.
  Die Aktualisierung zeigt einen Fehler und behält die zuletzt bestätigte Buchung.
  Die Verwaltung bleibt erreichbar und liest eine inzwischen beendete Fixturebuchung.
- Nach dem Wiederverbinden stimmen Mitarbeiteransicht und Verwaltung überein:
  fünf Stunden Anwesenheit, separat 15 Minuten bezahlte Pause, Dienst beendet.
- Beim umgekehrten Ausfall der Verwaltung bleibt das Mitarbeiterprofil bedienbar.
  Veraltete Zeitdaten erzeugen keinen neuen Fehlzeitverdacht. Die Verwaltung erholt
  sich nach dem Wiederverbinden.
- Keine JavaScriptfehler, keine produktiven Anmeldungen und keine produktiven
  Schreibanfragen. Der synthetische Transport weist unerwartete Operationen ab.

Die Netzwerkunterbrechung betrifft echte Netzwerkzugriffe der lokalen Testbrowser,
der gemeinsame Server liefert aber kontrollierte Antworten. Die Probe bildet
keinen physischen WLAN-/Mobilfunkwechsel ab.

## Antwortverlust und Rechte

- `npx playwright test tests/e2e/qr-reliable.spec.cjs --workers=1 --retries=0`:
  24/24 Browserfälle auf Desktop und mobilem Chromium bestanden. Dazu gehören
  verlorene Buchungsantworten, Wiederholung mit derselben Kennung, Prüfung einer
  verlorenen Korrekturantwort, Versionskonflikte und der gesperrte Korrekturzugriff
  durch Mitarbeiter. Diese Browserfälle verwenden kontrollierte Serverantworten.
- `node --test tests/qr-reliable-requests.test.mjs tests/roles-permission-boundaries.test.mjs tests/internal-messages.test.mjs`:
  24/24 gezielte Tests bestanden. Dies ist kein Versandtest mit realen Empfängern.

## Produktive Datenbankfunktionen mit zurückgerollten Testdaten

Ausgeführt auf dem bestehenden SchichtFunk-Projekt mit zufällig erzeugten
Test-UUIDs, fiktiven Unternehmen, Testpersonen und Terminals:

- `tests/sql/qr-workflow-actions-rollback.sql`: PIN-Einrichtung, vier Buchungsaktionen
  einschließlich Wiederholung und Statusbeleg, genau vier gespeicherte Ereignisse,
  gesperrter Doppelbeginn sowie identische Mitarbeiter-/Verwaltungswerte von
  480 Minuten und separat 20 Minuten bezahlter Pause bestanden.
- `tests/sql/qr-workflow-safety-rollback.sql`: zehn Pausen, gesperrte elfte Pause,
  automatisches Pausenende beim Ausstempeln, fremdes Terminal, abgelaufene Sitzung,
  deaktiviertes Terminal, deaktivierter Mitarbeiter, PIN-Reset sowie fremder
  Verwaltungszugriff bestanden.
- `tests/sql/roles-permissions-probe-rollback.sql`: alle Assertions für 13
  Zugriffssituationen bestanden, einschließlich Admin mit/ohne MFA, Mitarbeiter,
  Nur-Lesen, Zeiterfassung, fremdem Inhaber, deaktivierten Konten und anonymem Zugriff.
- Der direkte Buchungs-RPC bleibt für `authenticated` und `anon` unzulässig.
- Nachkontrolle: null Auth-Testbenutzer mit den verwendeten QR-/Rollen-Testpräfixen
  und null Unternehmen mit den verwendeten Fixture-Namen zurückgeblieben.

Es wurden keine echten Dienstpläne oder Zeitbuchungen geändert und keine Nachrichten
an Beschäftigte versendet. Die vorhandenen Rollbackskripte erzwingen die vollständige
Rücknahme ihrer Fixtures und erzeugten Auditdaten durch eine gezielt abgefangene
Ausnahme. Die Datenbankprüfungen sind keine gleichzeitigen schreibenden Sitzungen.

## Noch nicht nachgewiesen

1. Gleichzeitige schreibende Datenbanksitzungen unter Last und ein Test mit zwei
   nachweislich unterschiedlichen Auth-Identitäten. Die zwei realen Portal-/Geräte-
   sitzungen wurden bestätigt; ihre zugrunde liegenden Auth-Identitäten wurden
   nicht ausgelesen.
2. Verhalten eines echten Handys im gesperrten Zustand bzw. Betriebssystem-
   Hintergrund und reales Scannen mit der Handykamera. Der WLAN-/Mobilfunkwechsel
   bei geöffneter Arbeitszeitansicht wurde inzwischen vom Nutzer bestätigt.
3. Vollständige Schichtübergabe über zwei echte Schichten.

Produktcode wurde für diese Prüfung nicht geändert. Der technische Zweiprofiltest
und der gemeinsam durchgeführte Live-Verbindungs-/Sitzungstest sind abgeschlossen;
die oben genannten weitergehenden Praxisnachweise bleiben offen.
