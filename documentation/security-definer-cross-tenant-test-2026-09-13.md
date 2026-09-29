# SchichtFunk – Fremdmandanten-Negativtest der privilegierten RPCs

Stand: 13.09.2026  
Produktivprojekt: Supabase `zbvloohfjleadjnqhbbh`, Frankfurt  
Prüfumgebung: kurzlebiger, datenloser Supabase-Branch `rpc-cross-tenant-test-2026-09-13`

## Ergebnis

Alle 35 für `authenticated` freigegebenen `SECURITY DEFINER`-RPCs wurden mit zwei vollständig fiktiven Mandanten und drei fiktiven Konten geprüft. Ein Konto des Mandanten A versuchte jeweils, auf Mandant-B-Daten oder -Objekte zuzugreifen; zusätzliche Prüfungen deckten Mitarbeiter-, Push- und Funktionen ohne übergebenen Mandantenbezug ab.

| Gruppe | Prüfungen | Ergebnis |
|---|---:|---|
| Firmenbezogene Manager-RPCs | 16 | 16/16 abgewiesen |
| Objektbezogene Manager-RPCs | 10 | 10/10 abgewiesen |
| Mitarbeiter-RPCs | 5 | 5/5 abgewiesen |
| Push-/globale RPCs | 4 | 4/4 abgewiesen bzw. fremder Datensatz unverändert |
| **Gesamt** | **35** | **35/35 bestanden, 0 fehlgeschlagen** |

Der Test lief innerhalb einer Datenbanktransaktion und endete zwingend mit `ROLLBACK`. Für die eine Funktion, die einen fremden Push-Endpunkt absichtlich stillschweigend nicht löscht, wurde der unveränderte Datensatzbestand vor und nach dem Aufruf verglichen.

## Branch- und Kostenprotokoll

- Branch-ID: `439f161e-a16d-49bf-8450-7d3eda1f560e`
- temporäre Projekt-Referenz: `qpueftbucekehtomhtmt`
- erstellt: 13.09.2026, 17:57:33 UTC
- datenlos angelegt (`with_data: false`); Startkontrolle: 0 Firmen, 0 Auth-Konten, 0 Beschäftigte, 0 Schichtzuweisungen und 0 Push-Abonnements
- Löschung bestätigt: 13.09.2026, vor 17:59:19 UTC
- Laufzeit: unter zwei Minuten
- bei Erstellung bestätigter Preis: 0,01344 US-Dollar pro Stunde; die endgültige anteilige Abrechnung und etwaige Steuern ergeben sich aus der Supabase-Rechnung
- nach Löschung zeigte die Branchliste ausschließlich `main`

Es wurden keine Produktionsdaten kopiert, keine produktiven Daten oder Einstellungen geändert und keine Migration in Produktion übernommen.

## Rollback- und Sicherheitskontrolle

Nach dem Test waren alle gezielt verwendeten Testobjekte wieder bei 0: Firmen, Auth-Konten, Beschäftigte, Schichtzuweisungen, Schichtänderungsanträge, Einladungen, QR-Terminals und Push-Abonnements.

Der Security Advisor der Testumgebung meldete weiterhin exakt die bekannten 35 `SECURITY DEFINER`-Hinweise. Diese sind aufgrund der fachlich benötigten RPC-Aufrufbarkeit beabsichtigt und werden durch Allowlist, feste Suchpfade, minimale Ausführungsrechte sowie die hier dokumentierten Berechtigungsprüfungen kontrolliert. Zusätzlich blieben die drei bekannten reinen QR-RPC-Tabellenhinweise auf Informationsstufe bestehen; es kam kein neuer Befund hinzu.

## Reproduzierbarkeit

- Ausführbarer Test: `supabase/tests/security_definer_cross_tenant_test.sql`
- Vollständigkeitskontrolle gegen die Allowlist: `tests/security-definer-cross-tenant.test.mjs`
- maßgebliche Allowlist: `supabase/security-definer-allowlist.json`

Status: 🟢 **35/35 FREMDMANDANTEN-NEGATIVTESTS BESTANDEN; ROLLBACK, LEERSTAND UND BRANCH-LÖSCHUNG BESTÄTIGT.**
