# Mehrunternehmen: Entwurf der Datenbankumstellung

Status: in Arbeit. Keine der Dateien ist als Produktionsmigration freigegeben.

## Ziel und Reihenfolge

1. Den konkreten Produktionsschema-Stand und vorhandene Signaturen vor der Migration erneut erfassen. Bestehende Änderungen nicht durch ältere Entwürfe ersetzen.
2. Unternehmensbezogene Identität und lesende/schreibende Portalendpunkte zusammenstellen und gegen dieselbe Schema-Baseline testen. Alte Endpunkte ohne Unternehmensangabe müssen eindeutig bleiben oder bei Mehrdeutigkeit sicher ablehnen.
3. Einladungsfunktionen einschließlich Einzel-Einladung, gemeinsamer Einladung, bestätigt/nicht bestätigt, Erneuerung, Widerruf, Teamleiterprofil und Parallelzugriff gemeinsam integrieren. `single-invite-claim-candidate.sql` ersetzt die gleichnamige Funktion aus `production-candidate-not-for-deployment.sql`; die Reihenfolge ist verbindlich zu prüfen, nicht beide blind kombinieren.
4. `legacy-employee-identity-fail-closed-candidate.sql` mit den unternehmensbezogenen RLS- und Portaländerungen gemeinsam testen. Der Entwurf gibt bei mehreren aktiven Profilen ohne Unternehmenskontext NULL zurück. Alle Aufrufer und Benutzerabläufe müssen dabei überprüft werden; dieser Entwurf allein ist keine Freigabe der Mehrfachprofile.
5. Erst zusammen mit den geprüften Identitäts- und RLS-Änderungen den globalen Eindeutigkeitsindex atomar durch die Eindeutigkeit je Unternehmen ersetzen. `employee-identity-index-candidate.sql` ist bis dahin ausdrücklich nicht anzuwenden.
6. Die vollständige Kombination auf einem produktionsgleichen, isolierten Testschema mit fiktiven Daten testen: bestehende Einzelprofilkonten, mehrere Unternehmen, Rollenwechsel, Schreibaktionen, parallele Sitzungen, Widerruf, QR, Einzel- und Mehrfacheinladungen sowie negative Berechtigungsfälle.
7. Datenbankmigration und passenden Portalstand gemeinsam mit getestetem Rückfallplan vorbereiten. Ein Rückbau auf globale Eindeutigkeit ist nicht möglich, solange Konten mehrere Profile besitzen; solche Daten dürfen nicht automatisch gelöscht werden.

## Bisher geprüft

- `tests/multi-company-legacy-identity.test.mjs` prüft den isolierten Identitätsentwurf auf ein Profil, Mehrdeutigkeit, gesperrte/inaktive/gelöschte Profile und eingeschränkte Rollen.
- Die in `integration-status.md` dokumentierten QA- und Portaleinzeltests sind keine Prüfung der vollständigen Migrationskombination.
