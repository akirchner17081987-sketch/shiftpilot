# SchichtFunk – SECURITY-DEFINER-Allowlist

Stand: 13.09.2026

Projekt: Supabase `zbvloohfjleadjnqhbbh`, Frankfurt
Prüfart: ausschließlich lesende Katalogabfragen gegen Produktion

## Ergebnis

Die 35 vom Supabase Security Advisor gemeldeten, für `authenticated` ausführbaren `SECURITY DEFINER`-RPCs sind **beabsichtigte öffentliche Schnittstellen**. Sie bleiben nur dann freigegeben, wenn ihre Signatur in `supabase/security-definer-allowlist.json` steht und die automatische Drift-Abfrage keine Abweichung liefert.

Live-Befund:

- 35 von 35 Signaturen wurden einer fachlichen Funktion und einer internen Berechtigungsgrenze zugeordnet.
- 0 von 35 sind für `anon` ausführbar.
- 35 von 35 besitzen einen fest gesetzten `search_path`; 34 verwenden den leeren Pfad, eine ältere DATEV-Funktion den festen Pfad `public, pg_temp`.
- 0 von 35 verwenden `user_metadata`/`raw_user_meta_data` zur Autorisierung.
- 0 von 35 verwenden dynamisches SQL.
- Eigentümer ist jeweils die Datenbankrolle `postgres`.

Die Advisor-Warnung wird dadurch **nicht technisch beseitigt**: Sie weist korrekt auf privilegierte Funktionen hin. Der kontrollierte Umgang ist die exakte Allowlist plus Berechtigungs-, Mandanten- und Regressionstest.

Die maschinenlesbare Drift-Abfrage wurde am 13.09.2026 zusätzlich gegen das Produktivschema ausgeführt und lieferte **null Befunde**. Dabei wurden keine Fach- oder Konfigurationsdaten verändert.

## Gruppierung und Entscheidung

| Gruppe | Anzahl | Berechtigungsgrenze | Entscheidung |
|---|---:|---|---|
| Mitarbeiter: QR, Zeiten, Schichtänderung | 5 | `auth.uid()` bzw. private Mitarbeiter-/QR-Prüfung | zugelassen |
| Push/PWA | 4 | aktives Mitglied oder aktiver Mitarbeiter; Endpunktbesitz | zugelassen |
| Manager: Zeit, Stundenkonto, DATEV | 14 | aktive Managerrolle im Zielmandanten bzw. geprüfte Weiterleitung | zugelassen |
| Manager: Mitglieder/Einladungen | 4 | OWNER/ADMIN im Zielmandanten | zugelassen |
| Manager: QR-Terminalverwaltung | 8 | aktive Managerrolle über Zielmandant/Terminal; eine geprüfte Weiterleitung | zugelassen |

Die vollständige maschinenlesbare Liste enthält Name, Argumente und Prüfgrenze. Bei Änderung einer Signatur oder Ergänzung einer Funktion ist eine neue Einzelprüfung Pflicht.

## Freigaberegel

Vor einer Produktivmigration muss die Abfrage `supabase/tests/security_definer_allowlist.sql` auf einem Wegwerf-Testprojekt oder einer Supabase-Testbranch **null Zeilen** liefern. Jede Zeile bedeutet Release-Stopp. Zusätzlich sind je Funktionsgruppe mindestens folgende Negativtests erforderlich:

1. Aufruf ohne Anmeldung wird abgelehnt.
2. Angemeldeter Nutzer eines anderen Mandanten wird abgelehnt.
3. Mitarbeiter kann keine Managerfunktion ausführen.
4. deaktiviertes Konto kann weder Mitarbeiter- noch Managerfunktion ausführen.
5. QR-Token eines anderen Mandanten bzw. außerhalb der zulässigen Schicht wird abgelehnt.
6. Push-Endpunkt kann nur durch seinen Besitzer entfernt werden.

Der exakte Prüflauf wurde am 13.09.2026 vor und nach den Datenschutzmigrationen auf `privacy-restore-test-2026-09-13` wiederholt; beide Läufe lieferten null Zeilen. Der Security Advisor meldete danach weiterhin exakt 35 Einträge dieser Klasse und keine neue öffentlich erreichbare `SECURITY DEFINER`-Funktion.

Die fachlichen Fremdmandanten-Negativtests wurden anschließend auf dem datenlosen Wegwerf-Branch `rpc-cross-tenant-test-2026-09-13` ausgeführt. Alle 35 RPCs bestanden: 16 firmenbezogene Manager-, 10 objektbezogene Manager-, 5 Mitarbeiter- sowie 4 Push-/globale Prüfungen. Transaktions-Rollback, Leerstand und Branch-Löschung wurden bestätigt. Das vollständige Protokoll liegt in `documentation/security-definer-cross-tenant-test-2026-09-13.md`.

Status: 🟢 **ALLOWLIST, LIVE-/TESTBRANCH-DRIFTTEST UND 35/35 FACHLICHE FREMDMANDANTEN-NEGATIVTESTS BESTANDEN.**

Quelle: Supabase Database Linter, Warnung `authenticated_security_definer_function_executable`; Supabase RLS-Empfehlungen zu interner Authentisierung, festem `search_path` und minimalen Funktionsrechten.
