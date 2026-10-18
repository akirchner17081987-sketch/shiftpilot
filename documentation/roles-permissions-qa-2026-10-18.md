# Rollen und Berechtigungen – Prüfung vom 18.10.2026

## Ergebnis

Die geprüften Rollen-, Unternehmens- und Mitarbeitergrenzen greifen nach den Korrekturen auch bei direkten Datenbankabfragen und älteren RPCs. 956 automatisierte Tests bestanden. Benutzerverwaltung auf Desktop/Handy (hell/dunkel, bis 320 Pixel mit großer Schrift) sowie 12 MFA-Browserprüfungen bestanden. Es wurden ausschließlich fiktive Testdatensätze verändert und sämtliche Testtransaktionen zurückgerollt.

## Behobene Lücken

1. **Teamleiter ohne Zeitrecht:** Der RPC für Zeiteinträge war gesperrt, eine ältere permissive Tabellenregel erlaubte dennoch das direkte Lesen fremder Ist-Zeiten. Eine zusätzliche restriktive Leseregel verlangt jetzt ein Zeitrecht oder den eigenen aktiven Mitarbeiterbezug. Dasselbe Zeitrecht schützt Startsalden.
2. **Gespeicherte Monatskonten:** Bei offenen Monaten verhinderte die Berechnungsfunktion den Abruf ohne Zeitrecht. Ein geschlossener Monat gab seinen gespeicherten Snapshot dagegen vor dieser Prüfung zurück. Monatskonten und Abschlussstatus prüfen das Zeitrecht jetzt direkt am Funktionseinstieg; die ältere interne Monatskontofunktion ebenfalls.
3. **Gesperrtes Mitarbeiterportal:** Die alte Mitarbeiter-ID-Funktion prüfte nur das Beschäftigungsverhältnis. Sie verlangt jetzt zusätzlich einen aktiven Portalzugang, ein nicht gelöschtes Profil und keine gesperrte Unternehmensmitgliedschaft. Zusätzliche restriktive Regeln schützen direkte Profil-, Dienstplan- und Ist-Zeit-Abfragen.
4. **Ältere Mitarbeiteraktionen:** Zehn interne Tausch-/Marktplatz-/Angebotsfunktionen und die öffentliche Antwort auf Dienstplanänderungen verlangen nun am Einstieg einen aktiven Mitarbeiterzugang. Sie behalten ihre vorhandenen Prüfungen für Anfragen, Dienstzustände und reine Zeitverwaltungszugänge. QR-Terminalbuchungen behalten ihre getrennte Authentifizierung.
5. **Finanzielle Kontoeinstellungen:** Sieben aktive/ältere Schreibfunktionen für Startsaldo, Kontostart, Gutschriften und SOLL-Methode verlangen nun MFA zusätzlich zur unveränderten Rollenprüfung. Vier öffentliche Schreibwege wurden mit AAL1 abgewiesen; erlaubte Änderungen mit AAL2 wurden bestätigt.

Migrationen: `20261018094117_roles_permission_boundaries.sql`, `20261018094151_roles_time_policy_helper_execute.sql` und `20261018094837_roles_readonly_employee_identity.sql`. Die zweite Migration gibt der angemeldeten Datenbankrolle die nötige Ausführungsberechtigung auf die interne Ja/Nein-Prüffunktion für Zeitrechte. Eine RLS-Regel wird mit den Rechten des Aufrufers ausgewertet; anonyme Ausführung bleibt gesperrt. Positivtests verhindern, dass die Absicherung berechtigte Leser blockiert.

6. **Nur lesen mit verknüpftem Mitarbeiterprofil:** Dieser Sonderfall konnte einen Schichttausch anfordern. Die zentrale Portalidentität schließt jetzt reine Lese- und Zeitverwaltungsmitgliedschaften aus. Ein neuer produktiver Rollbacktest reproduzierte vorher die unerlaubte Anfrage und bestätigt nachher ihre Ablehnung.

## Geprüftes Rollenmodell

| Zugang | Planung | Fremde Ist-Zeiten | Benutzer / personenbezogene Gesamtexporte |
|---|---|---|---|
| Inhaber | Ja | Ja | Mit MFA |
| Administrator | Ja | Ja | Mit MFA; keine Verwaltung von Inhabern/Administratoren |
| Teamleiter ohne Zusatzrechte | Planung; Veröffentlichung gesondertes Zusatzrecht | Nein | Nein |
| Teamleiter mit `manage_time` | Planung; Zeiten bearbeiten mit MFA | Ja | Nein |
| Teamleiter mit `confirm_time` | Planung; Zeiten bestätigen mit MFA | Ja | Nein |
| Nur lesen | Dienstplanansicht, keine Änderungen | Nein | Nein |
| Bestehender reiner Zeitverwaltungszugang | Keine Planung | Zugewiesene Zeitrechte; Schreibaktionen mit MFA | Nein |
| Mitarbeiter | Eigene Dienste und zulässige eigene Anfragen | Nur eigene Zeiten | Keine fremden Daten |
| Gesperrter Zugang / fremdes Unternehmen / anonym | Kein Zugriff auf geschützte Daten des geprüften Unternehmens | Nein | Nein |

Die Unternehmensrolle wird aus gespeicherten Mitgliedschaften ermittelt. Ein in `user_metadata` behaupteter Inhaberstatus verschafft keine Rechte. Eigentümer bleiben geschützt; Administratoren können sich oder andere Konten nicht zu Administratoren befördern. Bestehende Berechtigungen echter Benutzer wurden nicht geändert.

## Produktive Prüfungen mit Rollback

`tests/sql/roles-permissions-probe-rollback.sql` prüft 13 Kontexte: Inhaber, Administrator, Administrator ohne MFA, Teamleiter ohne Zeitrechte, Nur lesen, Zeitbearbeiter, Zeitprüfer, reiner Zeitverwalter, fremder Inhaber, gesperrter Administrator, aktiver Mitarbeiter, gesperrter Mitarbeiter und anonym. Geprüft werden Benutzerliste, Zugangskontext, Monatskonten/Snapshot, Abschlussstatus, Zeiteinträge, direkte Zeilenabfragen, eigenes Stundenkonto, Marktplatz, Tausch und reine Leseansicht. Das Skript prüft erlaubte Zugriffe ausdrücklich ebenso wie Verbote und bricht bei Abweichungen ab.

`tests/sql/roles-permissions-writes-rollback.sql` bestätigt:

- MFA für vier öffentliche finanzielle Schreibwege; erlaubte Änderungen mit AAL2.
- Inhaberschutz und Verbot der Administratorbeförderung durch Administratoren.
- Keine direkte Änderung eigener Zusatzrechte; keine Rechte durch Benutzer-Metadaten.
- Zeitbearbeiter kann erfassen, aber nicht bestätigen; Zeitprüfer kann bestätigen, aber nicht bearbeiten.

Zusätzlich erneut bestanden: kompletter Monatsabschluss-/Wiederöffnungszyklus, neun Schichttausch-Szenarien und Marktplatz-Freigabe einschließlich konkurrierender Übernahme. Quellen sind die vorhandenen SQL-Rollbacktests dieser Bereiche. Diese Regressionen bestätigen, dass aktive Mitarbeiter durch die neue Zugangskontrolle weiterarbeiten können.

Die Datenbanktests verwenden echte Funktionen und die Rollen `authenticated` bzw. `anon`, jedoch simulierte JWT-Kontexte. Sie ersetzen keinen interaktiven Login mit echten Zugangsdaten. Der Browser-MFA-Test verwendet ebenfalls einen fiktiven Auth-Dienst; Fehlcode, Erfolg, Einrichtung, Wiederverwendung und Abbruch werden geprüft.

## Bestandskontrolle und Sicherheitskatalog

Vor/nach den Tests unverändert: 12 Auth-Benutzer, 5 Unternehmen, 8 Mitgliedschaften, 84 Mitarbeiter, 0 Unternehmenseinladungen, 13 Mitarbeitereinladungen, 10.365 Schichtzuweisungen, 759 Ist-Zeiten und 94.463 Audit-Ereignisse. Keine fiktiven Rollen-Testunternehmen verbleiben. Die Migrationen ändern Regeln und Funktionen, keine echten Rollen oder Mitarbeiterdaten.

Im öffentlichen Schema wurden keine ungeschützten Tabellen oder freigegebenen Views gefunden. Anonyme Rollen können keine öffentlichen Definer-RPCs ausführen. Eine vorhandene private Triggerfunktion hat eine anonyme EXECUTE-Freigabe; Triggerfunktionen sind nicht als normale RPCs aufrufbar, und das private Schema ist nicht als Data API freigegeben.

Die Advisors-Befunde sind identisch zum Ausgangsstand: 15 Informationshinweise für interne Tabellen mit RLS ohne direkte Policies sowie 40 Warnhinweise für ausdrücklich freigegebene Definer-Funktionen. Das ist kein Nachweis einer neuen Freigabe; die vorhandenen Berechtigungsgrenzen werden separat getestet. Hinweise und Metadaten wurden vor/nach der Änderung verglichen; keine neuen Befunde.

- [RLS-Advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Definer-Funktionen-Advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Supabase: Funktionen absichern](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker)

## Wiederholbare Prüfungen

```sh
npm test
npm run build
npm run test:ionos
node tests/browser/users-permissions-qa.cjs
node tests/browser/access-mfa-matrix-qa.cjs
```

Die neue PostgreSQL-Simulation mit fünf Untertests ist Bestandteil von `npm test`. Der CI-Workflow `Roles and permissions` führt fokussierte Sicherheits- und Browserprüfungen bei relevanten Änderungen aus. Produktive SQL-Tests erfolgen gezielt über einen autorisierten Datenbankzugang und rollen ihre Fixtures zurück.
