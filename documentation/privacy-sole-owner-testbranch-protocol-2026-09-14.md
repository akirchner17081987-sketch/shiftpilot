# SchichtFunk – Prüfprotokoll Ein-OWNER-Löschfreigabe V6

Stand: 14.09.2026

## Testumgebung

- Supabase-Branch: `privacy-sole-owner-v6-2026-09-14`
- Branch-Referenz: `qrdlywnhbqtknejpgdus`
- Elternprojekt: `zbvloohfjleadjnqhbbh`
- Region und Größe: Frankfurt (`eu-central-1`), Micro
- Modus: nicht persistent, ohne Produktionsdaten (`with_data=false`)
- erstellt: 14.09.2026, 06:08:11 UTC
- Löschung angefordert und bestätigt: 14.09.2026, 06:14:47 UTC
- nachweisbare Laufzeit: 6 Minuten 36 Sekunden

Nach der Löschung enthielt die Branch-Liste ausschließlich `main`. Der offizielle Startpreis für einen Micro-Preview-Branch beträgt 0,01344 USD pro Stunde. Da Compute laut Supabase auf volle Stunden aufgerundet wird, ist für diesen Lauf voraussichtlich eine Stunde Branching Compute, also 0,01344 USD zuzüglich möglicher Steuern und praktisch vernachlässigbarer zusätzlicher Nutzung, anzusetzen. Branching Compute wird weder durch Compute Credits noch durch den Spend Cap gedeckt. Der endgültige Rechnungsbetrag ergibt sich ausschließlich aus der Supabase-Abrechnung.

## Installierter Prüfstand

Die nicht produktiven Datenschutzmigrationen V1 bis V6 wurden ausschließlich auf dem Wegwerf-Branch eingespielt. V6 ergänzt:

- den Modus `SOLE_OWNER_DELAYED`,
- zwei AAL2-bestätigte, unterschiedliche JWT-Sitzungen,
- SHA-256-Fingerabdrücke statt roher `session_id`,
- 24 Stunden Abkühlfrist und 7 Tage Bestätigungsfenster,
- unveränderliche Vorschau- und Fristprofil-Hashes,
- erneute Rollen-, Ziel-, Frist- und Legal-Hold-Prüfung,
- harte Sperren für das einzige OWNER-Konto und Mandantenlöschungen,
- ausschließlich service-role-berechtigte Datenbankzugänge,
- Edge-Function-Eingänge für Antrag und zweite Bestätigung.

Es wurde kein Lösch-Zeitplan installiert und keine Migration auf das Produktivprojekt ausgeführt.

## Testergebnisse

| Prüfung | Ergebnis |
|---|---|
| neuer V6-Ein-OWNER-Datenbanktest | 22 geplant, 22 ausgeführt, 0 fehlgeschlagen; vollständiger Rollback |
| bestehender Lifecycle-/Offboarding-/MFA-Test | 41 geplant, 41 ausgeführt, 0 fehlgeschlagen; vollständiger Rollback |
| lokale Anwendungstests nach Korrektur | 33 Testdateien bestanden |
| Edge Function `privacy-lifecycle` | auf Testbranch aktiv, JWT-Prüfung eingeschaltet; anonymer Aufruf mit HTTP 401 abgewiesen |
| Berechtigungen der neuen Stage-/Confirm-Wrapper | `anon=false`, `authenticated=false`, `service_role=true` |
| Funktionsgrenze | vier private `SECURITY DEFINER`-Funktionen und vier öffentliche `SECURITY INVOKER`-Wrapper bestätigt |
| Testdaten nach beiden Datenbankläufen | 0 fiktive Auth-Benutzer, 0 Lifecycle-Aufträge, 0 Fristprofile, 0 Legal Holds |
| Lösch-Zeitpläne | 0 |
| Security Advisor | 35 bekannte, zuvor allowlist- und fremdmandantengeprüfte Bestandswarnungen; 0 neue Ein-OWNER-/Privacy-Lifecycle-Befunde |
| Branch-Bereinigung | Branch gelöscht; anschließend nur `main` vorhanden |

## Im Test gefundene und behobene Abweichung

Der erste V6-Lauf fand eine Randbedingung in der Löschzeitberechnung: Beim kontrollierten Zurücksetzen der Testzeit konnte `erase_after` vor dem bereits festgelegten `access_revoke_after` liegen. Die Datenbank lehnte dies korrekt über `privacy_lifecycle_dates_check` ab; die gesamte Testtransaktion wurde zurückgerollt und die anschließende Kontrolle ergab 0 Testdatensätze.

V6 wurde daraufhin gehärtet: `erase_after` ist nun immer der größte Wert aus `access_revoke_after`, `requested_at` und dem fristabhängigen Löschtermin. Danach bestanden alle 22 neuen und alle 41 bestehenden Datenbankprüfungen.

## Restgrenzen

- V6 ist nicht produktiv ausgerollt.
- Der produktive Auth-Admin-/Storage-Worker fehlt weiterhin.
- Es besteht weiterhin kein automatischer Lösch-Zeitplan.
- Langfristredaktion für Auditdaten und Monatssnapshots sowie kundenspezifische Fristfreigaben bleiben offen.
- Eine Produktivaktivierung erfordert weiterhin eine eigene ausdrückliche Freigabe.

Status: 🟢 **V6-EIN-OWNER-FREIGABE AUF DATENLOSEM WEGWERF-BRANCH MIT 22/22 NEUEN UND 41/41 BESTEHENDEN DATENBANKTESTS BESTANDEN; TESTDATEN VOLLSTÄNDIG ZURÜCKGEROLLT UND BRANCH GELÖSCHT.** 🟡 **PRODUKTIVAKTIVIERUNG, AUTH-/STORAGE-WORKER, ZEITPLAN UND LANGFRISTREDAKTION BLEIBEN OFFEN.**
