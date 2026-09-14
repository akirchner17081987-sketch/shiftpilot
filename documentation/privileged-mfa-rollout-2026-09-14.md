# SchichtFunk – verpflichtende MFA für privilegierte Konten

Stand: 14.09.2026  
Status: technisch vorbereitet; Produktivschutz noch nicht aktiviert

## Sicher festgestellter Ausgangszustand

- Das Produktivprojekt enthält zwei aktive `OWNER`-Konten und kein aktives `ADMIN`-Konto.
- Für keines der beiden `OWNER`-Konten war bei der letzten rein lesenden Prüfung ein bestätigter MFA-Faktor vorhanden.
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
4. IONOS-Vorschau mit beiden echten `OWNER`-Konten öffnen und je Konto einen persönlichen Authenticator einrichten. QR-Code, Secret und Einmalcode werden ausschließlich von der jeweiligen Person verarbeitet.
5. Produktiv rein lesend bestätigen, dass beide aktiven `OWNER`-Konten mindestens einen verifizierten Faktor besitzen.
6. Stufe 2 separat produktiv aktivieren und Benutzerverwaltung mit AAL1/AAL2 prüfen; danach Stufen 3 bis 5 einzeln wiederholen.
7. Bei jeder Stufe Zeitpunkt, Konto-Rolle, Testfall und Ergebnis protokollieren. Keine Echtdaten für Negativtests verwenden.

## Rückfall

Die jeweilige Stufe lässt sich durch eine neue Migration wieder auf `enabled=false` setzen. Ein vollständiger Rückfall setzt zusätzlich `pgrst.db_pre_request` für die Rolle `authenticator` zurück und lädt die PostgREST-Konfiguration neu. Faktor-Geheimnisse werden dabei nicht verändert. Bereits ausgestellte Zugriffstoken können bis zu ihrem Ablauf gültig bleiben; bei einem Sicherheitsvorfall sind deshalb zusätzlich die betroffenen Sitzungen global zu widerrufen.

## Noch notwendige Freigaben

- Beide echten `OWNER` müssen ihren persönlichen Authenticator selbst einrichten.
- Für einen weiteren kostenpflichtigen Supabase-Wegwerf-Branch ist vor Erstellung erneut die konkrete Preisbestätigung erforderlich.
- Die produktive Aktivierung jeder AAL2-Stufe benötigt eine ausdrückliche Freigabe nach bestandenem Branch- und Vorschautest.

