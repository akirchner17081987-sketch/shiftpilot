# SchichtFunk – 9.3 Datenschutz-/Löschbetrieb Abschlussnachweis

Stand: 16.09.2026

## Status

Der technische Datenschutz-/Löschbetrieb ist für den produktiven Supabase-Stand vollständig vorbereitet. Es wurden keine produktiven Beschäftigten-, Arbeitszeit-, Abwesenheits-, DATEV- oder Monatsabschlussdaten verändert.

## Produktiv umgesetzt

- Privacy-Lifecycle V1–V9 mit idempotenter Warteschlange, Legal Holds, Dry-Run, AAL2-Freigabe, Ein-OWNER-Schutz, Auth-/Storage-Worker und 15-Minuten-Zeitplan.
- Retention-Governance V10: serverseitig validierte Fristprofile und service-role-only Statusgrenze.
- Long-Term-Redaction V11: kontrollierte Langfristredaktion für Audit-Klarinhalte und geschlossene Monats-Snapshots.
- Audit-Identität bleibt unveränderlich; nur personenbezogene Klarinhalte dürfen nach Fristablauf durch den eng begrenzten Privacy-Pfad entfernt werden.
- DATEV-bezogene Audits verwenden eine eigene längere Frist.
- Monatsabschluss-Snapshots werden nach Ablauf der freigegebenen Frist auf einen Metadaten-Nachweis reduziert; der Monatsabschluss selbst bleibt erhalten.
- Jeder produktive Redaktionslauf verlangt ein freigegebenes Fristprofil und stoppt bei aktivem Legal Hold.
- Redaktionsläufe sind idempotent je Fristprofil/Tag und speichern nur Mengen/Metadaten, keine entfernten Klarinhalte.
- Der bestehende `privacy-worker` wurde auf Version 4 erweitert und prüft neben fälligen Offboarding-Aufträgen auch fällige Langfristredaktionen.

## Dry-Run / Sicherheitsprüfung

Kandidatenprofil für die technische Vorschau:

- Kontakt-/Offboarding-Fenster: 30 Tage
- Dienstplanung: 3 Jahre
- Abwesenheiten: 3 Jahre
- Zeitnachweise: 3 Jahre
- Personalstamm: 3 Jahre
- allgemeines Audit: 3 Jahre
- Monats-Snapshots: 6 Jahre
- DATEV-Audit: 6 Jahre
- Auth-Konto automatisch löschen: aus
- Personalakten-Storage automatisch löschen: aus

Dry-Run am 16.09.2026:

- Audit-Cutoff: 01.01.2023
- DATEV-Audit-Cutoff: 01.01.2020
- Monats-Snapshot-Cutoff: 01.01.2020
- fällige Audit-Redaktionen: 0
- fällige Monats-Snapshot-Redaktionen: 0
- aktive Legal Holds: 0
- `execution_enabled=false`

Der echte Worker-Aufruf nach Deployment von Version 4 lieferte HTTP 200 mit 0 Offboarding-Aufträgen und 0 Langfristredaktionen.

## Unverändertheitsnachweis

Vor und nach Migration/Worker-Prüfung:

- Audit-Ereignisse: 12.135
- Audit-Inhalts-Hash: `a882926769e5c8102adbbbcb7e9dbc6944aa3e7b63636904d93415328fd2d1fe`
- Monatsabschlüsse: 1
- Monatsabschluss-Inhalts-Hash: `f34928133241c355c6213d69368ee41550fd3200d3e02d1656747f2278111d9c`

Damit wurden durch die technische Aktivierung keine produktiven Fachdaten verändert.

## Berechtigungsgrenzen

Die neuen Preview-, Execute- und Batch-RPCs sowie die Nachweistabelle sind für `anon` und `authenticated` nicht direkt ausführbar/lesbar. Zugriff besteht nur für `service_role`. Die tatsächliche Ausführung verweigert ohne freigegebenes Retention-Profil mit `Approved retention profile required`.

## Noch erforderliche betriebliche Freigabe

Für den Mandanten SchichtFunk ist bewusst noch kein Retention-Profil freigegeben. Das Profil muss über den geschützten Ein-OWNER-Prozess bestätigt werden. Dafür gelten weiterhin zwei AAL2-Bestätigungen aus unterschiedlichen Sitzungen, mindestens 24 Stunden Abkühlfrist und ein Bestätigungsfenster von sieben Tagen. Diese Freigabe wird nicht per direktem SQL umgangen.

Bis zu dieser Freigabe kann der Worker keine fachliche Langfristredaktion ausführen. Dadurch ist der technische Betrieb fail-closed.

## Bewertung

Technische Umsetzung 9.3: 🟢 abgeschlossen.
Betriebliche Fristprofil-Freigabe des aktuellen Mandanten: 🟡 ausstehender geschützter Betreiber-Schritt.

Die kundenspezifische Wahl der konkreten Fristen bleibt Bestandteil des Kunden-Onboardings/AVV und ist keine technische Lücke des Löschsystems.
