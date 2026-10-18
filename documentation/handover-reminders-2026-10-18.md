# Automatische Übergabe-Erinnerungen

Stand 18.10.2026. Ergänzt die vorhandene Schichtübergabe und nutzt die Benachrichtigungszentrale sowie den bereits eingerichteten und vom Nutzer am 18.10.2026 auf seinem Handy bestätigten Push-Versand.

## Verhalten

- Prüfung alle fünf Minuten, unabhängig von geöffneten Browsern.
- Ausstehende Übernahme: erste Erinnerung 15 Minuten nach dem späteren Zeitpunkt aus Beginn der Folgeschicht und Versand. Empfänger sind das aktiv zugeordnete Folgeteam während seines Dienstes sowie aktive Inhaber, Administratoren und Planungsleitung im selben Unternehmen.
- Überfällige kritische Punkte: nach Fristablauf ab Schichtbeginn an die zugeordnete verantwortliche Person und die berechtigte Leitung. Ohne Verantwortliche wird das zugeordnete aktive Schichtteam erinnert. Nach Schichtende bleibt die Leitung zuständig; das abgelöste Team bekommt keine weiteren Erinnerungen.
- Höchstens drei Meldungen je Empfänger und offenem Vorgang mit mindestens einer Stunde Abstand. Wiederholungen aktualisieren denselben Eintrag unter der Glocke. Löschen oder Gelesen-Markieren einer Meldung setzt das Limit nicht zurück. Eine neue Frist oder ein nach erfasstem Abschluss wieder geöffneter Vorgang startet eine neue Episode.
- Übernahme, Erledigung, Weitergabe, zurückgezogene Veröffentlichungen und entzogener Zugang beenden die entsprechende Episode. Beim nächsten Prüflauf werden vorhandene Erinnerungen als gelesen/aufgelöst markiert. Vor einem verzögerten oder wiederholten Push wird die Quelle erneut geprüft, damit erledigte Aufgaben nicht nachträglich gesendet werden.
- Keine Titel, Beschreibungen, Namen oder Eskalationskontakte aus Aufgaben in Push-Nachrichten. Die Nachricht verweist ins Portal. Glocke und Push öffnen die richtige Übergabe einschließlich ihres Zeitraums; kritische Aufgaben werden fokussiert. Serverrechte bleiben maßgeblich. Der Freitext-Eskalationskontakt wird nicht automatisch angerufen oder angeschrieben.

## Umsetzung

Migration `20261018102003_shift_handover_reminders_v1.sql`, identische lesbare Quelle in `database/shift-handover-reminders-v1.sql`. Serverinterner Cron-Worker mit bestehender Unternehmenssperre und zusätzlicher Workersperre. Private RLS-geschützte Episodentabelle; keine Client-Grants. Fremdschlüssel erfassen Unternehmens-, Konto-, Mitarbeiter-, Aufgaben- und Übergabelöschung. Laufende endgültige Mitarbeiterlöschung sperrt die Kandidatenauswahl des Unternehmens.

Die Empfängerprüfung schließt fremde Unternehmen, gesperrte Mitgliedschaften, gelöschte/inaktive Mitarbeiter, reine Zeitrollen, reine Leser und explizit schreibgeschützte Planer aus. Manager-/Mitarbeiter-Doppelzuordnung erzeugt je Vorgang nur eine Meldung. Ein neuer Service-RPC prüft die aktuelle Quelle und ist ausschließlich für `service_role` ausführbar. Edge Function `push-dispatch` Version 14 ist aktiv und entspricht bytegenau dem geprüften Quelltext.

## Prüfung

- Gesamte Regression: 975 Tests erfolgreich.
- Worker-/Edge-Tests: echte Postgres-Ausführung in PGlite und tatsächlicher TypeScript-Dispatcher mit isolierten Provider-Doubles. Vorlauf/Frist, Empfänger, Mehrfachaufrufe, Zeitlimit, Meldungslimit, gelöschte Meldungen, Erledigung, Übernahme, Wiederöffnung, Fristwechsel, Weitergabe, Zeitzonen, veröffentlichte Dienste, Abbruch bei Löschung, Quellenprüfung und Grants.
- 24 neue Browserprüfungen mit tatsächlich ausgelieferten Portal-, Push- und Benachrichtigungsdateien: Mitarbeiter/Leitung, September-Nachtdienst aus Oktober öffnen, genaue Aufgabe, Konten-/Unternehmensfilter, verspätete Antworten bei Identitätswechsel; 360/1440 px.
- Bestehende Übergabe-Browserprüfung mit Übertragung, Übernahme, Rollen, Freigaben, tatsächlichen PDF-/Textdownloads, hell/dunkel und 320–1440 px erfolgreich. Build und fünf IONOS-Prüfungen erfolgreich.
- `tests/sql/handover-reminders-rollback.sql`: reale Produktions-RPCs/Trigger mit fiktiven Konten. Vier erste Erinnerungen korrekt in der HTTP-Warteschlange; drei Ledger-Claims je Vorgang und Grenze bestätigt. `now()` bleibt innerhalb dieser einzelnen Testtransaktion konstant, daher requeued der produktive Refresh-Trigger dort keine Wiederholungen; separate Worker-Transaktionen einschließlich Refresh-Trigger werden im Postgres-Test geprüft. Alle Fixtures, Auditdaten, Notifications und HTTP-Aufträge zurückgerollt; kein Versand an Beschäftigte.
- Sicherheitsberater: unverändert 55 bestehende Einzelbefunde, keine neuen. Keine Testkonten, Testunternehmen, Übergaben oder Ledger-Einträge verblieben.

Die neue erinnerungsspezifische Zustellung wurde mit isolierten Empfängern und zurückgerollter Warteschlange geprüft. Der tatsächliche Handyempfang des gemeinsamen Push-Wegs wurde zuvor vom Nutzer bestätigt. Ein realer Zwei-Schichten-Betrieb ist davon getrennt.
