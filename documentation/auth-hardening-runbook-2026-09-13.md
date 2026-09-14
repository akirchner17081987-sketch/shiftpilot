# SchichtFunk – Auth-Härtung: Passwortschutz und MFA

Stand: 13.09.2026
Prüfart: lesende Dashboard- und Advisor-Prüfung, nicht ausgerollte Umsetzung im Git-Prüfzweig sowie Hosted-Auth-Livetest mit zwei synthetischen Konten auf einem gelöschten Wegwerf-Branch; Leaked Password Protection am 13.09.2026 durch den Betreiber live aktiviert und anschließend unabhängig im Advisor verifiziert

## Aktueller Zustand

| Einstellung | Live-Status | Ziel |
|---|---|---|
| E-Mail-Anmeldung | aktiv | aktiv |
| sichere E-Mail-Änderung | aktiv | aktiv |
| sichere Passwortänderung / Reauthentisierung | aus | aktiv nach Login-Regressionsprüfung |
| aktuelles Passwort bei Änderung erforderlich | aus | aktiv nach UI-Prüfung |
| Schutz vor geleakten Passwörtern | aktiv; frühere Advisor-Warnung verschwunden | aktiv; beibehalten |
| TOTP/App-Authenticator | in Supabase aktiviert | für privilegierte Rollen verpflichtend |
| SMS-MFA | deaktiviert | bleibt deaktiviert, solange kein begründeter Bedarf besteht |
| Dauer reiner AAL1-Sitzungen | auf 15 Minuten begrenzt | beibehalten |
| MFA-Faktoren je Nutzer | maximal 10 | vor Echtbetrieb auf 2–3 prüfen |

Supabase-seitig ist TOTP bereits verfügbar. In der IONOS-Vorschau für Git-Commit `ff20020` liegt eine App-Oberfläche für Einrichtung per QR/Secret, Bestätigung des sechsstelligen Codes, Faktorenliste, Entfernung und den verpflichtenden Challenge-Schritt bei bereits registriertem Faktor vor. Build und IONOS-Deployment waren erfolgreich; Datei und Loader-Einbindung wurden öffentlich mit HTTP 200 geprüft. Abgebrochene Anmeldungen beenden die lokale Sitzung; unvollständig eingerichtete TOTP-Faktoren werden beim nächsten Einrichtungsversuch bereinigt. Der Hosted-Auth-Fluss wurde nun mit zwei synthetischen Konten einschließlich Ersatzfaktor und Sitzungswiderruf live geprüft; die App-Integration ist zusätzlich statisch abgesichert. Die organisatorische Freigabe des Wiederherstellungswegs und die verpflichtende Einführung für echte privilegierte Rollen fehlen weiterhin.

Die Oberfläche ist auf die Passwort-Härtung vorbereitet: bekannte Schwach-/Leak-, Rate-Limit-, Reauthentisierungs- und Anmeldefehler werden verständlich und ohne rohe Anbieterdetails angezeigt. Bei einer angemeldeten Passwortänderung werden aktuelles Passwort und optional der sechsstellige Reauthentisierungscode an `updateUser()` übergeben; der Code kann zuvor über `reauthenticate()` angefordert werden. Der Recovery-Link-Fluss bleibt davon getrennt. Leaked Password Protection ist nun produktiv aktiv; ein absichtlich kompromittiertes Passwort wurde im Produktivprojekt nicht gesetzt oder verwendet. Die getrennten Schalter für Reauthentisierung und das aktuelle Passwort bei Änderungen bleiben bis zu ihrer eigenen Abnahme aus.

Die Datenschutz-Edge-Function verlangt für Auftrag und Freigabe bereits eine verifizierte `aal2`-Sitzung. Für 27 weitere sensible Data-API-RPCs liegt nun eine zentrale, stufenweise Pre-Request-Grenze im Prüfzweig vor. Alle vier Stufen starten deaktiviert und sind noch nicht produktiv ausgerollt. Deshalb darf MFA insgesamt noch nicht als vollständig umgesetzt gelten.

Im Prüfzweig liegt zusätzlich die gemeinsame Datenbankgrenze `private.sf_assert_aal2()` vor. Sie liest ausschließlich den signierten Supabase-Claim `aal`, behandelt fehlende Angaben sicher als `aal1` und liefert bei unzureichender Sitzung kontrolliert `MFA_REQUIRED`. Die neue Allowlist ordnet 27 sensible RPCs den Bereichen Benutzer/Rechte, Personalakte, DATEV/Berichte und QR-Sicherheitskonfiguration zu; alle Einträge sind zunächst aus. Die stufenweise Zuordnung und Abnahme ist in `mfa-sensitive-rpc-rollout-2026-09-13.md` und `privileged-mfa-rollout-2026-09-14.md` festgehalten.

Eine präzisierte rein lesende Produktivprüfung am 14.09.2026 ergab genau ein echtes `OWNER`-Konto für den Mandanten `SchichtFunk`, kein aktives `ADMIN`-Konto und noch keinen verifizierten Faktor für diesen echten OWNER. Der zweite zuvor mitgezählte OWNER gehört zu einem getrennten Mandanten mit der ausdrücklichen Kennzeichnung `SchichtFunk Abnahme … (FIKTIV)` und ist kein zweiter produktiver Inhaber. Die verpflichtende App-Oberfläche ist vorbereitet, die produktive Serverpflicht bleibt aber bis zur persönlichen Einrichtung des einen echten OWNER deaktiviert. Die vier RPC-Stufen bestanden anschließend auf einem datenlosen Wegwerf-Branch 59/59 Assertions einschließlich echtem PostgREST-Data-API-Negativtest. Vor der Branch-Löschung wurden 0 Auth-Benutzer, 0 Unternehmen und 0 aktive Schutzschalter bestätigt; danach blieb nur `main` bestehen.

Auf einem früheren Wegwerf-Testbranch wurden am 13.09.2026 TOTP „Enabled“, die AAL1-Begrenzung auf 15 Minuten, SMS „Disabled“ und maximal 10 Faktoren read-only bestätigt. Die gemeinsame AAL2-Grenze bestand dort AAL1-Ablehnung, AAL2-Zulassung und getrennten `service_role`-Workerpfad. Auf dem anschließenden datenlosen Branch `mfa-session-recovery-test-2026-09-13` bestanden OWNER und Mitarbeiter jeweils Passwortlogin auf AAL1, primären TOTP, zweiten Ersatzfaktor, Falschcode-Ablehnung, Faktorverlust, Wiederanmeldung mit Ersatzfaktor auf AAL2 sowie `others`- und `global`-Sitzungswiderruf. 12/12 Gruppenprüfungen bestanden; danach waren 0 aktive Test-Refresh-Tokens vorhanden und der Branch wurde gelöscht. Details stehen in `mfa-session-recovery-test-2026-09-13.md`.

Nach der späteren Aktivierung im Produktivprojekt wurde der Security Advisor um 10:29:46 UTC erneut abgefragt. Der vorherige Befund `Leaked Password Protection Disabled` war nicht mehr vorhanden. Der Projektstatus blieb `ACTIVE_HEALTHY`. Die verbleibenden Advisor-Klassen sind die bereits separat allowlist-geprüften 35 `SECURITY DEFINER`-RPCs sowie drei bekannte QR-Tabellen mit RLS und ausschließlich RPC-vermitteltem Zugriff.

Die Guard-Definition wurde am 13.09.2026 in einer sitzungsgebundenen `pg_temp`-Kopie gegen die aktuelle Supabase-Auth-Umgebung kompiliert. Der `aal1`-Negativpfad, der `aal2`-Erfolgspfad und der gesonderte Service-Role-Pfad verhielten sich wie vorgesehen; Transaktion und temporäre Funktionen wurden vollständig verworfen. Dies ist ein Syntax-/Grenztest, aber noch kein Ersatz für den Zwei-Konten-Test der tatsächlich geschützten RPCs.

## Sichere Aktivierungsreihenfolge

1. Technischen Zwei-Konten-Hosted-Auth-Test und statische App-Integration beibehalten; bei UI-Änderungen erneut ausführen.
2. Den technisch bestandenen Ersatzfaktor-Weg organisatorisch freigeben und Support-Identitätsprüfung festlegen.
3. `aal2` zunächst nur im Testmandanten für OWNER/ADMIN und sensible Aktionen prüfen: Personalakte, Benutzerverwaltung, DATEV, Exporte, Löschfreigaben und Sicherheitskonfiguration.
4. Datenbank/RPCs müssen `aal2` serverseitig prüfen; eine reine UI-Sperre reicht nicht.
5. Zwei Testkonten erneut prüfen: korrektes TOTP, falsches TOTP, verlorener Faktor, neue AAL1-Sitzung, Ersatzfaktor und Refresh-Sitzungswiderruf.
6. Schutz vor geleakten Passwörtern beibehalten; sichere Passwortänderung und aktuelles Passwort bei Änderung zunächst in einer Wegwerf-Umgebung aktivieren.
7. Login, Passwortänderung, Einladung, Mitarbeiterzugang, iPhone-PWA und Wiederanmeldung erneut testen.
8. Erst nach erfolgreichem Test für echte privilegierte Konten verpflichtend schalten.

## Abnahmekriterien

- OWNER/ADMIN kann ohne `aal2` keine Personalakte, Benutzerverwaltung, DATEV- oder Löschfreigabe verwenden.
- Normale Mitarbeiterfunktionen bleiben nach regulärem Login nutzbar, sofern die Kundenrichtlinie keine allgemeine MFA fordert.
- Bestehende schwache/geleakte Passwörter führen zu einem kontrollierten Änderungsprozess, nicht zu einer unverständlichen Kontosperre.
- Support kann Identität prüfen, aber keinen MFA-Schutz heimlich umgehen.
- Jede Änderung ist mit Datum, Prüfer, Testkonto und Ergebnis dokumentiert.

Status: 🟢 **LEAKED PASSWORD PROTECTION, ZWEI-KONTEN-MFA-/RECOVERY-/SITZUNGSWIDERRUF-NACHWEIS UND 59/59 AAL2-BRANCH-ASSERTIONS BESTANDEN**; 🟡 **PFLICHT-UI VORBEREITET, ABER ECHTKONTEN-EINRICHTUNG, SICHERE PASSWORTÄNDERUNG UND PRODUKTIVE AAL2-AKTIVIERUNG NOCH OFFEN.**

Quellen: https://supabase.com/docs/guides/auth/password-security, https://supabase.com/docs/guides/auth/auth-mfa und https://supabase.com/docs/guides/auth/signout
