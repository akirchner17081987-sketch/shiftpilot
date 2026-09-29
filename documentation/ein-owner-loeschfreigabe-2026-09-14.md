# SchichtFunk – Löschfreigabe im Ein-OWNER-Betrieb

Stand: 14.09.2026

Dokumentstatus: Verbindliche Betriebsregel; V6 auf Wegwerf-Testbranch bestanden und Löschautomatisierung am 14.09.2026 produktiv aktiviert.

## 1. Entscheidung und Geltungsbereich

Für Kundenunternehmen mit genau einem aktiven `OWNER` und keinem aktiven `ADMIN` gilt für die endgültige Löschung von Beschäftigtendaten der Modus `SOLE_OWNER_DELAYED`.

Dieser Modus ist keine Vier-Augen-Kontrolle. Er ersetzt die zweite Person durch mehrere kompensierende Kontrollen: zwei getrennte AAL2-bestätigte Sitzungen, eine Abkühlfrist, eine unveränderliche Vorschau, erneute Frist-/Legal-Hold-Prüfung und ein manipulationsgeschütztes Prüfprotokoll. Sobald mindestens eine weitere freigabeberechtigte Person vorhanden ist, gilt wieder das Zwei-Personen-Verfahren.

Der Modus gilt ausschließlich für das Offboarding eines Mitarbeiters innerhalb eines bestehenden Mandanten. Er gilt nicht für:

- die Löschung des Kundenunternehmens,
- die Löschung oder Deaktivierung des einzigen aktiven `OWNER`,
- die Löschung eines Auth-Kontos mit Eigentum, weiterer aktiver Mitgliedschaft oder ungeklärten Datenbeziehungen,
- das Umgehen einer fehlenden Kundenweisung, einer Aufbewahrungspflicht oder eines Legal Hold.

Diese Fälle bleiben automatisch gesperrt und erfordern einen gesonderten, extern dokumentierten Prüf- und Freigabeprozess.

## 2. Voraussetzungen

Der Ein-OWNER-Modus darf nur gewählt werden, wenn alle folgenden Bedingungen zum Zeitpunkt des Antrags und der zweiten Bestätigung erfüllt sind:

1. Der Mandant hat genau einen aktiven `OWNER` und keinen aktiven `ADMIN`.
2. Der handelnde Benutzer ist dieser `OWNER` und mit `aal2` angemeldet.
3. Der Löschauftrag betrifft nicht den eigenen OWNER-Datensatz oder das eigene Auth-Konto.
4. Eine dokumentierte Kundenweisung bzw. ein vertraglich freigegebenes Fristprofil ist hinterlegt.
5. Es besteht kein einschlägiger Legal Hold.
6. Vorschau, Zielmandant, Mitarbeiter, Zweck, Fristprofil und Begründung sind vollständig und eindeutig.

Ändert sich die Rollenlage vor der zweiten Bestätigung, verfällt der Ein-OWNER-Pfad. Die Freigabe ist dann im regulären Zwei-Personen-Verfahren neu durchzuführen.

## 3. Verbindlicher Ablauf

### 3.1 Erste Bestätigung

Der einzige `OWNER` startet den Auftrag nach einer AAL2-Prüfung. Der Server speichert mindestens:

- Auftrags-ID und Idempotenzschlüssel,
- Mandant, Mitarbeiter und beantragte Löschphasen,
- konkrete Begründung und Referenz auf Kundenweisung/Vertrag,
- Version des freigegebenen Fristprofils,
- SHA-256 der vollständigen Löschvorschau,
- Ergebnis der Frist- und Legal-Hold-Prüfung,
- Benutzer-ID, Zeitpunkt und einen SHA-256-Fingerabdruck des signierten JWT-Claims `session_id`.

Der rohe Sitzungsschlüssel und gelöschte Klarinhalte gehören nicht in das Prüfprotokoll.

Die reversible Zugriffssperre darf als eigener Schritt sofort ausgeführt werden, wenn sie fachlich beauftragt ist. Die endgültige Löschphase bleibt gesperrt.

### 3.2 Abkühl- und Widerrufsfrist

- Früheste zweite Bestätigung: 24 Stunden nach der ersten Bestätigung.
- Ende des Bestätigungsfensters: 7 Tage nach der ersten Bestätigung.
- Bis zur Ausführung kann der Auftrag widerrufen werden.
- Die bevorstehende Löschung ist über einen vom aktuellen Browser getrennten, dokumentierten Kanal an den OWNER zu melden.

Eine Bestätigung vor Ablauf von 24 Stunden wird abgewiesen. Ohne gültige zweite Bestätigung innerhalb von 7 Tagen verfällt der Auftrag und muss mit neuer Vorschau begonnen werden.

### 3.3 Zweite Bestätigung

Die zweite Bestätigung verlangt erneut `aal2` und eine neue Anmeldung. Der SHA-256-Fingerabdruck von `session_id` muss sich von der ersten Sitzung unterscheiden.

Vor Annahme prüft der Server erneut:

- unveränderten Mandanten, Mitarbeiter, Zweck und Fristprofilstand,
- bytegleiches Vorschau-Hash,
- weiterhin genau einen aktiven OWNER und keinen aktiven ADMIN,
- weiterhin keinen Bezug zum einzigen OWNER-Konto,
- aktuelle Fälligkeit und das Fehlen eines Legal Hold,
- Einhaltung des Zeitfensters von 24 Stunden bis 7 Tagen.

Bei jeder fachlichen oder technischen Abweichung wird nicht bestätigt. Eine geänderte Vorschau erfordert einen neuen Auftrag und eine neue Abkühlfrist.

### 3.4 Ausführung

Der Hintergrundarbeiter darf nur einen gültig bestätigten und fälligen Auftrag übernehmen. Parallelzugriffe werden mit `FOR UPDATE SKIP LOCKED` getrennt; externe und Datenbankschritte bleiben kurz, idempotent und wiederholbar.

Die Reihenfolge lautet:

1. Freigabe, Fristprofil, Rollenlage und Legal Hold erneut prüfen.
2. Sitzungen und Zugänge widerrufen; bereits gesperrte Zugänge verifizieren.
3. Das eingefrorene Storage-Manifest abarbeiten und Löschung durch erneute Auflistung sowie Hash-/Mengennachweis kontrollieren.
4. Fällige Live-Daten in einer kurzen Datenbanktransaktion löschen oder kontrolliert redigieren.
5. Das Auth-Konto nur entfernen, wenn keine Eigentümerrolle, weitere zulässige Mitgliedschaft oder blockierende Datenbeziehung besteht.
6. Ergebnis, Mengen, Zeitpunkte, Manifest-Hash und Abweichungen ohne gelöschte Klarinhalte protokollieren.

Fehlgeschlagene externe Schritte führen zu `BLOCKED`. Automatische Wiederholungen dürfen keine bereits bestätigte Löschung doppelt ausführen.

## 4. Harte Sperren

Folgende Regeln sind technisch als Fail-Closed-Bedingungen umzusetzen:

- Das einzige aktive OWNER-Konto darf niemals durch die Löschautomatisierung deaktiviert oder gelöscht werden.
- Eine Mandantenlöschung ist im Ein-OWNER-Modus nicht zulässig.
- Dieselbe JWT-Sitzung darf nicht für beide Bestätigungen verwendet werden.
- `aal1`, fehlende oder nicht verifizierbare `session_id`, ein abweichender Vorschau-Hash und ein aktiver Legal Hold führen zur Ablehnung.
- Eine abgelaufene oder verfrühte zweite Bestätigung führt nicht zur Ausführung.
- Ein Auth-Konto mit weiteren Mandantenzugängen darf nicht gelöscht werden.
- Ein technischer Fehler darf nie als erfolgreiche Löschung protokolliert werden.

Es gibt keinen manuellen MFA-Bypass. Bei Verlust des Authenticators wird das reguläre, dokumentierte Kontowiederherstellungsverfahren genutzt; ein offener Auftrag verfällt erforderlichenfalls.

## 5. Mindestnachweis und Aufbewahrung

Das unveränderliche Prüfprotokoll enthält ausschließlich erforderliche Metadaten:

- Betriebsmodus `SOLE_OWNER_DELAYED`,
- Auftrags- und Mandantenreferenz,
- pseudonymisierte Zielreferenz,
- Benutzer-ID des bestätigenden OWNER,
- zwei unterschiedliche Sitzungsfingerabdrücke,
- Zeitpunkte beider AAL2-Bestätigungen,
- Vorschau-, Fristprofil- und Storage-Manifest-Hash,
- Ergebnisse von Rollen-, Fälligkeits- und Legal-Hold-Prüfung,
- Worker-ID, Status, Mengen und Fehlercodes,
- Widerruf, Verfall oder Abschluss.

Die Nachweisfrist richtet sich nach dem Kunden-AVV und dem Löschkonzept. Das Protokoll darf keine gelöschten Inhaltsdaten, Auth-Tokens, TOTP-Geheimnisse oder Storage-Dateien enthalten.

## 6. Technische Abnahmekriterien vor Produktion

Vor einer Produktivaktivierung müssen auf einer Wegwerf-Testumgebung mindestens folgende Negativ- und Positivfälle automatisiert bestanden sein:

1. Ein-OWNER-Modus wird nur bei exakt einem aktiven OWNER und null aktiven ADMIN zugelassen.
2. `aal1` wird bei beiden Bestätigungen abgewiesen.
3. Dieselbe `session_id` wird für die zweite Bestätigung abgewiesen.
4. Eine zweite Bestätigung vor 24 Stunden wird abgewiesen.
5. Ein Auftrag ohne zweite Bestätigung verfällt nach 7 Tagen.
6. Vorschau-, Ziel- oder Fristprofildrift erzwingt einen neuen Auftrag.
7. Ein aktiver Legal Hold sperrt die Löschphase.
8. Das einzige OWNER-Konto und eine Mandantenlöschung bleiben gesperrt.
9. Weitere Mandantenzugänge verhindern die Auth-Kontolöschung.
10. Widerruf, Workerfehler und Wiederholung sind idempotent und revisionssicher.
11. Storage-Löschung und Auth-Admin-Schritt werden vollständig nachgewiesen.
12. Die normale Zwei-Personen-Freigabe bleibt bei geeigneter Rollenlage unverändert wirksam.

## 7. Einführungsstatus

Die Betriebsregel ist hiermit für den vorgesehenen Ein-OWNER-Betrieb festgelegt. Die technische V6-Erweiterung mit gehashten Sitzungsnachweisen, Fristprofil-Doppelbestätigung, Rollen-/Zielsperren und Edge-Function-Endpunkten bestand auf dem datenlosen Wegwerf-Testbranch 22/22 neue sowie 41/41 bestehende Datenbankprüfungen. Alle Testdaten wurden zurückgerollt und der Branch danach gelöscht. Am 14.09.2026 wurden V1–V9, der Auth-/Storage-Worker und ein geschützter 15-Minuten-Zeitplan produktiv aktiviert. Der echte Scheduler-Leerlauf endete mit HTTP 200 und 0 verarbeiteten Aufträgen; die Abnahme änderte keine Nutzdaten. Auth- und Storage-Löschung bleiben ohne ausdrückliche Aktivierung und konkrete Fristen im freigegebenen Kundenprofil technisch aus. Vollständiger Nachweis: `privacy-lifecycle-production-activation-2026-09-14.md`.
