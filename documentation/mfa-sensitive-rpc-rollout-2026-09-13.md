# SchichtFunk – MFA-Rollout für sensible Serveraktionen

Stand: 14.09.2026

Status: Stufensteuerung und verpflichtende Bedienoberfläche im Prüfzweig vorbereitet, 59/59 Branch-Assertions und echter Data-API-Negativtest bestanden; nicht produktiv aktiviert

## Sicherheitsgrenze

Die Migration `20260913092708_mfa_sensitive_action_guard_v1.sql` stellt mit
`private.sf_assert_aal2()` eine gemeinsame serverseitige MFA-Prüfung bereit. Sie
vertraut auf den signierten Supabase-JWT-Claim `aal`, behandelt fehlende Angaben
als `aal1` und lässt ausschließlich authentifizierte `aal2`-Sitzungen passieren.
Service-Role-Aufrufe bleiben für eng begrenzte Hintergrundprozesse möglich und
benötigen weiterhin die jeweilige separate Rollen- und Auftragsprüfung.

Die Migration verändert noch keinen bestehenden öffentlichen RPC. Damit entsteht
beim bloßen Anwenden der Grundlage keine unangekündigte Kontensperre. Die
Folgemigration `20260914045554_staged_privileged_aal2_gate_v1.sql` ordnet 27
sensible Data-API-RPCs den Stufen 2 bis 5 zu und registriert den zentralen
Pre-Request-Guard. Sämtliche Allowlist-Einträge starten mit `enabled=false`.

Die App öffnet für `OWNER` und `ADMIN` ohne verifizierten Faktor eine
verpflichtende Authenticator-Einrichtung. Eine serverseitige Antwort
`MFA_REQUIRED` führt zu einer Challenge und genau einem kontrollierten
Wiederholungsversuch. Die vollständige Arbeitsanweisung und der Rückfallweg
stehen in `privileged-mfa-rollout-2026-09-14.md`.

## Vorgesehene Einführungsgruppen

| Stufe | Aktionen | Voraussetzung |
|---|---|---|
| 1 | Löschauftrag und Vier-Augen-Freigabe | bereits an der Edge-Grenze vorbereitet; zwei Konten testen |
| 2 | Benutzer einladen, Einladung widerrufen, Rolle/Status ändern | Authenticator des einzigen echten OWNER und Recovery-Prozess bestätigt |
| 3 | Personalakte lesen, ändern, Dokumente registrieren/löschen, Notizen verwalten | iPhone-/Desktop-Test und Storage-Negativtest |
| 4 | DATEV-Export autorisieren/protokollieren sowie sensible Audit-/Monatsberichte abrufen | Export- und Monatsabschluss-Regressionsprüfung |
| 5 | QR-Terminal-Geheimnis rotieren und sicherheitsrelevante Konfiguration ändern | Terminal-Rückfallplan und erneute Anmeldung geprüft |

Normale Mitarbeiterfunktionen, Schichtanzeige, Zeiterfassung und freiwillige
Push-Nutzung bleiben zunächst bei regulärer Anmeldung verfügbar. Eine allgemeine
MFA-Pflicht ist eine separate Kundenentscheidung.

## Abnahmetest je Stufe

1. `aal1` liefert kontrolliert `MFA_REQUIRED`, ohne Daten zu ändern.
2. Nach erfolgreicher TOTP-Challenge wird derselbe Vorgang mit `aal2` ausgeführt.
3. Falscher und abgelaufener Code bleiben gesperrt.
4. Faktorentfernung oder neue Anmeldung senkt die Sitzung wieder auf `aal1`.
5. Verifizierter Ersatzfaktor und dokumentierter Recovery-Weg begrenzen das Aussperrungsrisiko; ein zweites produktives OWNER-Konto ist nicht vorhanden.
6. Berechtigungsprüfung und Mandantengrenze bleiben zusätzlich zur MFA-Prüfung aktiv.
7. Ergebnis wird mit Testkonto, Gerät, Zeitpunkt und geprüfter Funktionsgruppe dokumentiert.

## Freigabegrenze

Vor der Produktivaktivierung werden die vier Stufen auf einer ausdrücklich
bestätigten Wegwerf-Umgebung geprüft. Diese Abnahme wurde am 14.09.2026 mit
59/59 Assertions und einem echten `MFA_REQUIRED`-Data-API-Test bestanden; der
Branch wurde nach der Leerstandskontrolle gelöscht. Im Produktivprojekt besteht
genau ein echtes `OWNER`-Konto für `SchichtFunk`. Für dieses Konto wurde am
14.09.2026 um 05:23:54 UTC rein lesend ein verifizierter TOTP-Faktor bestätigt.
Ein zweiter technisch gezählter OWNER gehört zu einem getrennten, ausdrücklich
fiktiven Abnahmemandanten und ist keine Produktivvoraussetzung. Vor der jeweiligen
Produktivstufe bleiben die ausdrückliche Freigabe sowie der Login-/Einladungs-/
PWA-Regressionslauf Voraussetzung.
