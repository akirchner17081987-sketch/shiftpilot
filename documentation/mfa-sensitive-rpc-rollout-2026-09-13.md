# SchichtFunk – MFA-Rollout für sensible Serveraktionen

Stand: 13.09.2026

Status: technische Vorbereitung; nicht ausgerollt

## Sicherheitsgrenze

Die Migration `20260913092708_mfa_sensitive_action_guard_v1.sql` stellt mit
`private.sf_assert_aal2()` eine gemeinsame serverseitige MFA-Prüfung bereit. Sie
vertraut auf den signierten Supabase-JWT-Claim `aal`, behandelt fehlende Angaben
als `aal1` und lässt ausschließlich authentifizierte `aal2`-Sitzungen passieren.
Service-Role-Aufrufe bleiben für eng begrenzte Hintergrundprozesse möglich und
benötigen weiterhin die jeweilige separate Rollen- und Auftragsprüfung.

Die Migration verändert noch keinen bestehenden öffentlichen RPC. Damit entsteht
beim bloßen Anwenden der Grundlage keine unangekündigte Kontensperre.

## Vorgesehene Einführungsgruppen

| Stufe | Aktionen | Voraussetzung |
|---|---|---|
| 1 | Löschauftrag und Vier-Augen-Freigabe | bereits an der Edge-Grenze vorbereitet; zwei Konten testen |
| 2 | Benutzer einladen, Einladung widerrufen, Rolle/Status ändern | Recovery-Prozess und zweites OWNER-Konto bestätigt |
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
5. Zweites OWNER-Konto und dokumentierter Recovery-Weg verhindern Aussperrung.
6. Berechtigungsprüfung und Mandantengrenze bleiben zusätzlich zur MFA-Prüfung aktiv.
7. Ergebnis wird mit Testkonto, Gerät, Zeitpunkt und geprüfter Funktionsgruppe dokumentiert.

## Freigabegrenze

Vor dem Test auf einer ausdrücklich bestätigten Wegwerf-Umgebung wird die
gemeinsame Prüfung nicht in vorhandene öffentliche RPCs eingebaut. Vor der
Produktivaktivierung sind außerdem zwei sichere privilegierte Konten, ein
Recovery-Verfahren und ein bestandener Login-/Einladungs-/PWA-Regressionslauf
erforderlich.
