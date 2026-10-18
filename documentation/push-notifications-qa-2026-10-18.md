# Push- und Erinnerungstest – 18.10.2026

## Ergebnis

Technischer Push-Weg und bestehende Übergabeoberfläche geprüft. Eine Berechtigungslücke ist geschlossen und produktiv aktiv: Ein gesperrtes Unternehmensmitglied konnte über seine ältere aktive Mitarbeiterverknüpfung weiterhin Geräteabos registrieren und Push-Tests auslösen. Dieselbe Rückfalllogik war im Versand vorhanden. Registrierung, Testnachricht und Versand verwenden jetzt dieselbe Unternehmens-/Kontoprüfung. Gesperrte Mitgliedschaft hat Vorrang; Mitarbeiter müssen aktiv, freigeschaltet und nicht gelöscht sein. Aktive Verwaltungs-, Lese- und Zeitrollen behalten ihre zulässigen eigenen Benachrichtigungen.

Produktiv: Migration `20261018100412_push_active_recipient_guard`, Edge Function `push-dispatch` Version 13. Ausgelieferter Quelltext stimmt exakt mit dem geprüften Stand überein. Neuer Service-RPC ist weder anonym noch für normale angemeldete Nutzer aufrufbar. Keine privaten Schlüssel, Geräteendpunkte oder Nachrichteninhalte im Prüfbericht.

## Nachweise

- `npm test`: 963 erfolgreich, 0 Fehler.
- `npm run test:push`: 13 Quellen-, Laufzeit- und Postgres-Tests plus 22 Browserprüfungen. Tatsächlicher TypeScript-Dispatcher mit isolierten Supabase-/Provider-Doubles ausgeführt: falscher Schlüssel, ungültige Anfrage, fehlende Nachricht, inaktive Empfänger, kanonischer Link, Dringlichkeit, Provider-Ausfälle, Teilzustellung, abgelaufene Abos und Apple Declarative Web Push gegenüber älteren Clients. Service Worker zeigt beide Payloads und öffnet das Portal.
- Browser mit tatsächlichem Push-Asset, simulierten Geräte-APIs: ausdrückliche Aktivierung, keine vorzeitige Berechtigungsfrage, Testaktion, Deaktivierung, verweigerte Erlaubnis, Registrierungsfehler, iOS-Installationshinweis; 360/768/1440 px ohne Überlauf.
- `tests/sql/push-notifications-rollback.sql`: reale Produktions-RPCs und Grants mit fiktiver Identität. Registrierung, exakt eine Notification/HTTP-Warteschlange, 30-Sekunden-Limit, fremdes Unternehmen, gesperrte Mitgliedschaft, gelöschter und deaktivierter Mitarbeiter, Service-RPC-Beschränkung und eigenes Abmelden geprüft. Alle Fixtures, Auditdaten, Nachrichten und HTTP-Aufträge zurückgerollt. pg_net startet erst nach Commit; keine Testzustellung an Geräteanbieter oder Beschäftigte.
- Bestehende Übergabe-Browserprüfung erfolgreich: Validierung, Fristen, Verantwortliche, Übertragung, Mitarbeiter-Übernahme, Berichtsfreigabe, PDF/Text, Identitätswechsel, Rollen/Fehler und 320–1440 px hell/dunkel.
- Build und 5 IONOS-Prüfungen erfolgreich. Sicherheitsberater unverändert: 15 bestehende Informationshinweise und 40 bestehende Definer-Hinweise, keine neuen Befunde.
- Betriebsprüfung: Push-Konfiguration aktiv; 7 aktivierte Geräteabos für 4 Konten; Retry-Job aktiv. Vier bestehende Dispatches mit Status SENT, keine FAILED/PENDING. Nach den zurückgerollten Tests weiterhin 7 Abos und 4 Dispatches, keine Testkonten oder Testunternehmen vorhanden. SENT belegt die Annahme des Versandwegs, nicht die Anzeige auf einem realen Handy.

## Noch offen

Automatische Erinnerungen bei ausstehender Übergabeübernahme und überfälligen kritischen Aufgaben sind aktuell nicht implementiert: weder passender Datenbank-Worker noch Cron-Job oder Benachrichtigungsauslöser. Die Anzeige überfälliger Aufgaben und der manuelle Übernahmeablauf sind vorhanden. Der Test ergänzt diese neue Funktion nicht stillschweigend.

Echter Empfangstest: Auf dem Zielhandy SchichtFunk öffnen (auf iPhone als installierte Home-Bildschirm-App), Push aktivieren und im Push-Bereich „Test senden“ betätigen. Nachricht bei App im Hintergrund bzw. gesperrtem Bildschirm bestätigen und durch Antippen den richtigen Portalbereich öffnen. Danach bei Bedarf WLAN/Mobilfunkwechsel wiederholen. Geräteanzeige, reale Zwei-Schichten-Übergabe und parallele reale Sitzungen sind durch die isolierten Tests nicht nachgewiesen.

## Werkzeughinweis

Die automatische Freigabeprüfung blockierte einen Supabase-CLI-Fortsetzungsschritt wegen möglicher PostHog-Telemetrie. Die Migrationsdatei war bereits erzeugt. Es gab keinen erneuten CLI-Aufruf; Migration und Edge-Deployment wurden über die vorhandene Supabase-Verbindung abgeschlossen.
