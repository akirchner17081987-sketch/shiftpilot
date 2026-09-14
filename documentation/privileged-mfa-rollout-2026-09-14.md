# SchichtFunk – verpflichtende MFA für privilegierte Konten

Stand: 14.09.2026  
Status: technische Branch-Abnahme und Echtkonto-Einrichtung bestätigt; Produktivschutz noch nicht aktiviert

## Sicher festgestellter Ausgangszustand

- Das Produktivprojekt enthält genau ein echtes `OWNER`-Konto für den Mandanten `SchichtFunk` und kein aktives `ADMIN`-Konto.
- Ein zweiter technisch als `OWNER` gezählter Datensatz gehört ausschließlich zum getrennten Mandanten `SchichtFunk Abnahme … (FIKTIV)`. Er ist ein älteres Abnahmekonto und kein zweiter produktiver Inhaber.
- Für das echte `OWNER`-Konto wurde am 14.09.2026 um 05:23:54 UTC rein lesend ein verifizierter TOTP-Faktor bestätigt. Faktor-Geheimnis und vollständige Kontoadresse wurden nicht ausgelesen oder dokumentiert.
- TOTP/App-Authenticator und Leaked Password Protection sind im Supabase-Projekt aktiv.
- Die vorhandene Datenschutz-Lifecycle-Grenze verlangt bereits `aal2`.
- Die neue Stufensteuerung für weitere sensible RPCs startet vollständig deaktiviert. Das Anwenden ihrer Grundlagenmigration allein sperrt deshalb keine Funktion.

Kontoadressen und Faktor-Geheimnisse werden im Nachweis bewusst nicht aufgeführt.

## Technische Umsetzung im Prüfzweig

Die Anwendung verlangt von `OWNER` und `ADMIN` ohne bestätigten Faktor beim Start die Einrichtung eines App-Authenticators. Der Dialog kann im Pflichtmodus nicht geschlossen werden. Ein Abbruch oder ein nicht behebbarer Fehler bietet die sichere Abmeldung an. Der letzte bestätigte Faktor eines privilegierten Kontos kann über die Oberfläche nicht entfernt werden.

Antwortet die Datenbank bei einer sensiblen Aktion mit `MFA_REQUIRED`, öffnet die Anwendung die TOTP-Challenge und wiederholt genau diesen Aufruf einmal nach erfolgreicher Bestätigung. Fehlt noch ein Faktor, wird stattdessen die Pflicht-Einrichtung geöffnet. Die serverseitige Entscheidung bleibt damit maßgeblich; die Oberfläche ist nur die verständliche Bedienebene.

Die Migration `20260914045554_staged_privileged_aal2_gate_v1.sql` registriert einen PostgREST-Pre-Request-Guard. Er gilt ausschließlich für Aufrufe unter `rpc/...`, liest eine private Allowlist und delegiert an `private.sf_assert_aal2()`. Tabellenzugriffe, Storage, Realtime und nicht gelistete RPCs werden dadurch nicht verändert. Rollen- und Mandantenprüfungen in den geschützten Funktionen bleiben zusätzlich bestehen.

## Aktivierungsstufen

| Stufe | Bereich | RPCs | Ausgangswert |
|---|---|---:|---|
| 2 | Benutzer und Rechte | 4 | aus |
| 3 | Personalakte | 8 | aus |
| 4 | DATEV, Audit und Monatsberichte | 9 | aus |
| 5 | QR-Sicherheitskonfiguration | 6 | aus |

Insgesamt sind 27 sensible RPCs exakt einer Stufe zugeordnet. Eine Stufe wird erst durch eine eigene geprüfte Aktivierungsmigration eingeschaltet. Änderungen per Dashboard ohne Migration sind nicht vorgesehen.

## Freigabe- und Testfolge

1. Neue Grundlagenmigration und Anwendung auf einer datenlosen Wegwerf-Umgebung anwenden.
2. Prüfen, dass alle 27 Einträge vorhanden und zunächst deaktiviert sind.
3. Je Stufe nur in der Wegwerf-Umgebung aktivieren: `aal1` muss mit `MFA_REQUIRED` scheitern; `aal2` muss zur bereits vorhandenen Rollen- und Mandantenprüfung gelangen.
4. IONOS-Vorschau mit dem echten `OWNER`-Konto öffnen und einen persönlichen Authenticator einrichten. QR-Code, Secret und Einmalcode werden ausschließlich vom Kontoinhaber verarbeitet.
5. Produktiv rein lesend bestätigen, dass das echte `OWNER`-Konto mindestens einen verifizierten Faktor besitzt. Das getrennte fiktive Abnahmekonto wird nicht als Produktivvoraussetzung gezählt.
6. Stufe 2 separat produktiv aktivieren und Benutzerverwaltung mit AAL1/AAL2 prüfen; danach Stufen 3 bis 5 einzeln wiederholen.
7. Bei jeder Stufe Zeitpunkt, Konto-Rolle, Testfall und Ergebnis protokollieren. Keine Echtdaten für Negativtests verwenden.

## Branch-Abnahme vom 14.09.2026

Nach ausdrücklicher Kostenbestätigung wurde der datenlose, nicht dauerhafte Branch
`aal2-staged-gate-test-2026-09-14` kurzzeitig angelegt. Darauf wurden ausschließlich
die gemeinsame AAL2-Prüfung und die deaktiviert startende Stufensteuerung angewendet.

- 27/27 RPCs waren vorhanden und anfangs deaktiviert.
- Stufe 2: 4/4 AAL1-Ablehnungen und 4/4 AAL2-Freigaben am Guard.
- Stufe 3: 8/8 AAL1-Ablehnungen und 8/8 AAL2-Freigaben am Guard.
- Stufe 4: 9/9 AAL1-Ablehnungen und 9/9 AAL2-Freigaben am Guard.
- Stufe 5: 6/6 AAL1-Ablehnungen und 6/6 AAL2-Freigaben am Guard.
- Nicht gelistete Tabellen-/RPC-Pfade: 2/2 unverändert durchgelassen.
- Service-Role-Pfad und PostgREST-Registrierung: jeweils bestanden.
- Gesamtergebnis: 12/12 Gruppen und 59/59 Einzelassertions bestanden.
- Ein echter anonymer Data-API-Aufruf mit formal gültiger fiktiver UUID wurde vor
  der RPC-Ausführung mit HTTP 400, Code `P0001` und Nachricht `MFA_REQUIRED`
  abgewiesen. Es wurden keine Geschäftsdaten geschrieben.
- Der neue Advisor-Infohinweis zur privaten Allowlist wurde durch eine explizite
  Deny-All-RLS-Policy beseitigt. Die 35 bekannten Security-Definer-Hinweise und
  drei bekannten QR-Tabellenhinweise blieben unverändert; sie gehören zum bereits
  separat geprüften Ausgangsbestand.
- Abschlusskontrolle vor Löschung: 0 Auth-Benutzer, 0 Unternehmen, 0 aktive
  AAL2-Schalter, 27 konfigurierte RPCs und eine private Deny-All-Policy.
- Der Branch wurde unmittelbar danach gelöscht. Die Branch-Liste enthielt
  anschließend nur noch `main`.

## Rückfall

Die jeweilige Stufe lässt sich durch eine neue Migration wieder auf `enabled=false` setzen. Ein vollständiger Rückfall setzt zusätzlich `pgrst.db_pre_request` für die Rolle `authenticator` zurück und lädt die PostgREST-Konfiguration neu. Faktor-Geheimnisse werden dabei nicht verändert. Bereits ausgestellte Zugriffstoken können bis zu ihrem Ablauf gültig bleiben; bei einem Sicherheitsvorfall sind deshalb zusätzlich die betroffenen Sitzungen global zu widerrufen.

## Noch notwendige Freigaben

- Die produktive Aktivierung jeder AAL2-Stufe benötigt eine ausdrückliche Freigabe nach bestandenem Branch- und Vorschautest.
