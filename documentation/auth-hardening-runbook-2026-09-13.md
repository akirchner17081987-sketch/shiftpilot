# SchichtFunk – Auth-Härtung: Passwortschutz und MFA

Stand: 13.09.2026
Prüfart: lesende Dashboard- und Advisor-Prüfung sowie nicht ausgerollte Umsetzung im Git-Prüfzweig; keine Live-Einstellung geändert

## Aktueller Zustand

| Einstellung | Live-Status | Ziel |
|---|---|---|
| E-Mail-Anmeldung | aktiv | aktiv |
| sichere E-Mail-Änderung | aktiv | aktiv |
| sichere Passwortänderung / Reauthentisierung | aus | aktiv nach Login-Regressionsprüfung |
| aktuelles Passwort bei Änderung erforderlich | aus | aktiv nach UI-Prüfung |
| Schutz vor geleakten Passwörtern | aus; Advisor-Warnung | aktiv |
| TOTP/App-Authenticator | in Supabase aktiviert | für privilegierte Rollen verpflichtend |
| SMS-MFA | deaktiviert | bleibt deaktiviert, solange kein begründeter Bedarf besteht |
| Dauer reiner AAL1-Sitzungen | auf 15 Minuten begrenzt | beibehalten |
| MFA-Faktoren je Nutzer | maximal 10 | vor Echtbetrieb auf 2–3 prüfen |

Supabase-seitig ist TOTP bereits verfügbar. In der IONOS-Vorschau für Git-Commit `ff20020` liegt nun eine App-Oberfläche für Einrichtung per QR/Secret, Bestätigung des sechsstelligen Codes, Faktorenliste, Entfernung und den verpflichtenden Challenge-Schritt bei bereits registriertem Faktor vor. Build und IONOS-Deployment waren erfolgreich; Datei und Loader-Einbindung wurden öffentlich mit HTTP 200 geprüft. Abgebrochene Anmeldungen beenden die lokale Sitzung; unvollständig eingerichtete TOTP-Faktoren werden beim nächsten Einrichtungsversuch bereinigt. Dieser App-Fluss ist noch nicht mit den sicheren Konten abgenommen. Ein organisatorischer Wiederherstellungsweg und die verpflichtende Einführung für privilegierte Rollen fehlen weiterhin.

Die Datenschutz-Edge-Function verlangt für Auftrag und Freigabe bereits eine verifizierte `aal2`-Sitzung. Andere sensible Bereiche wie Personalakte, Benutzerverwaltung und DATEV erzwingen `aal2` noch nicht vollständig an ihren jeweiligen Server-/Datenbankgrenzen. Deshalb darf MFA insgesamt noch nicht als vollständig umgesetzt gelten.

## Sichere Aktivierungsreihenfolge

1. Die vorbereitete MFA-Oberfläche mit zwei sicheren Testkonten im Wegwerf-Testmandanten prüfen.
2. Recovery-Verfahren und mindestens einen Ersatzfaktor organisatorisch festlegen.
3. `aal2` zunächst nur im Testmandanten für OWNER/ADMIN und sensible Aktionen prüfen: Personalakte, Benutzerverwaltung, DATEV, Exporte, Löschfreigaben und Sicherheitskonfiguration.
4. Datenbank/RPCs müssen `aal2` serverseitig prüfen; eine reine UI-Sperre reicht nicht.
5. Zwei Testkonten prüfen: korrektes TOTP, falsches TOTP, verlorener Faktor, neue Sitzung, abgelaufene Sitzung und Downgrade nach Faktorentfernung.
6. Danach Schutz vor geleakten Passwörtern, sichere Passwortänderung und aktuelles Passwort bei Änderung aktivieren.
7. Login, Passwortänderung, Einladung, Mitarbeiterzugang, iPhone-PWA und Wiederanmeldung erneut testen.
8. Erst nach erfolgreichem Test für echte privilegierte Konten verpflichtend schalten.

## Abnahmekriterien

- OWNER/ADMIN kann ohne `aal2` keine Personalakte, Benutzerverwaltung, DATEV- oder Löschfreigabe verwenden.
- Normale Mitarbeiterfunktionen bleiben nach regulärem Login nutzbar, sofern die Kundenrichtlinie keine allgemeine MFA fordert.
- Bestehende schwache/geleakte Passwörter führen zu einem kontrollierten Änderungsprozess, nicht zu einer unverständlichen Kontosperre.
- Support kann Identität prüfen, aber keinen MFA-Schutz heimlich umgehen.
- Jede Änderung ist mit Datum, Prüfer, Testkonto und Ergebnis dokumentiert.

Status: 🟡 **SUPABASE-VORAUSSETZUNGEN UND APP-FLOW IN DER IONOS-VORSCHAU VORHANDEN; ECHTKONTEN-/GERÄTETEST, RECOVERY UND BREITE SERVERSEITIGE AAL2-DURCHSETZUNG NOCH OFFEN.**

Quellen: https://supabase.com/docs/guides/auth/password-security und https://supabase.com/docs/guides/auth/auth-mfa
