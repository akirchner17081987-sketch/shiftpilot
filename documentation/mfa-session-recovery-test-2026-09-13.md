# SchichtFunk – MFA-, Recovery- und Sitzungswiderruf-Test

Stand: 13.09.2026

Prüfumgebung: kostenpflichtiger, datenloser Supabase-Wegwerf-Branch

Produktionsprojekt: ausschließlich unveränderte Referenz; keine Schreibzugriffe

## 1. Umfang und Schutzgrenzen

Der Branch `mfa-session-recovery-test-2026-09-13` (`sjwfciiuwibopaeaxite`) wurde aus dem Produktionsschema ohne Produktionsdaten erstellt. Vor dem Test enthielt er 0 Auth-Nutzer, 0 MFA-Faktoren, 0 Sitzungen und 0 Unternehmen. Verwendet wurden genau zwei synthetische Konten unter der reservierten Domain `example.invalid`: ein OWNER-Testkonto und ein Mitarbeiter-Testkonto. Passwörter, Zugriffstoken, Refresh-Tokens und TOTP-Secrets wurden weder ausgegeben noch gespeichert.

Der Test änderte keine Produktionsdaten, keine produktiven Auth-Einstellungen, keine Edge Functions und keine DNS-/IONOS-Konfiguration. Die Testlogik verweigert ausdrücklich die bekannte Produktions-Projekt-URL und E-Mail-Adressen außerhalb `example.invalid`.

## 2. Ausführung

Der Branch wurde am 13.09.2026 um 18:12:41 UTC erstellt. Nach Korrektur der ausschließlich synthetischen Auth-Fixtures lief der automatisierte Hosted-Auth-Test um etwa 18:18 UTC vollständig durch.

| Prüffall | OWNER | Mitarbeiter |
|---|---|---|
| Passwortanmeldung startet auf AAL1 | bestanden | bestanden |
| Primärer TOTP-Faktor eingerichtet und AAL2 erreicht | bestanden | bestanden |
| Zweiter, unabhängiger Ersatzfaktor verifiziert | bestanden | bestanden |
| Falscher TOTP-Code abgewiesen | bestanden | bestanden |
| Andere Sitzung über `scope=others` widerrufen; Refresh abgewiesen | bestanden | bestanden |
| Verlorenen Primärfaktor entfernt | bestanden | bestanden |
| Neue Anmeldung startet auf AAL1 und erreicht mit Ersatzfaktor AAL2 | bestanden | bestanden |
| Alle Sitzungen über `scope=global` widerrufen; fremder Refresh abgewiesen | bestanden | bestanden |

Automatisierte Zusammenfassung: 12/12 geplante Gruppenprüfungen bestanden, 0 fehlgeschlagen. Nach dem globalen Widerruf waren für die beiden Konten 0 aktive Refresh-Tokens und 0 Sitzungen ohne explizites Ablaufdatum vorhanden. Pro Konto blieb genau der verifizierte Ersatzfaktor zurück, bis der gesamte Branch gelöscht wurde.

## 3. Sicherheitsbewertung

Der technische Supabase-Auth-Nachweis für Zwei-Konten-MFA, Faktorverlust, Ersatzfaktor und Refresh-Sitzungswiderruf ist bestanden. Bereits ausgestellte kurzlebige Access-JWTs können nach einem Widerruf bis zu ihrem Ablauf gültig bleiben; deshalb ersetzen `global` und `others` keine kurze Token-Laufzeit und keine serverseitige AAL2-Prüfung an sensiblen Grenzen.

Der Security Advisor zeigte auf dem Branch nur die bereits separat bewerteten 35 `SECURITY DEFINER`-RPCs und drei QR-Tabellen mit RLS ohne direkte Policies. Durch diesen Test wurden weder deren Definition noch Berechtigungen verändert. Die stufenweise AAL2-Erzwingung für sensible RPCs bleibt eine eigene, noch nicht produktiv aktivierte Maßnahme.

## 4. Löschung und Kosten

Nach der Ergebnisaufnahme wurde der Branch `14cd2b96-d1be-4147-be3a-829a7c2e3080` erfolgreich gelöscht. Die anschließende Branchliste enthielt ausschließlich `main`; damit wurden auch die synthetischen Nutzer, Faktoren und Sitzungen verworfen.

Bestätigter Branchpreis: 0,01344 USD pro Stunde. Die technische Laufzeit betrug rund sechs Minuten; der rein zeitanteilige Rechenwert beträgt damit ungefähr 0,00134 USD. Maßgeblich sind Rundung, Abrechnungsintervall und Rechnung von Supabase.

## 5. Reproduzierbarkeit

- Hosted-Auth-Test: `scripts/verify-supabase-mfa-live.mjs`
- Statische Schutzprüfung: `tests/mfa-session-security.test.mjs`
- Gesamtregression: 32/32 Testdateien bestanden
- IONOS-Migrationssuite: bestanden
- Build: 2.156.091 Byte (2,06 MiB), unter dem 50-MiB-Ziel
- Abhängigkeitsprüfung: 0 bekannte Schwachstellen

Status: 🟢 **TECHNISCHER ZWEI-KONTEN-MFA-, RECOVERY- UND SITZUNGSWIDERRUF-NACHWEIS BESTANDEN; BRANCH GELÖSCHT.**

Quellen: https://supabase.com/docs/guides/auth/auth-mfa und https://supabase.com/docs/guides/auth/signout
