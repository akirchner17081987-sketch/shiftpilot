# SchichtFunk – GitHub Betriebs- und Workflow-Nachweis

Stand: 16.09.2026
Dokumentstatus: Betreiberunterlage, Version 1.1

## 1. Repository-Grundzustand

Repository: `akirchner17081987-sketch/shiftpilot`

- Sichtbarkeit: öffentlich.
- Default-Branch: `main`.
- IONOS-Migrations- und Abnahmezweig: `codex/ionos-migration`.
- Pull Request #16 führt den IONOS-/Supabase-Abnahmestand gegen `main`.

Das öffentliche Repository darf keine Service-Role-Schlüssel, privaten Schlüssel, Passwörter, TOTP-Seeds, produktiven Exportdateien oder Beschäftigten-/Kundendokumente enthalten. Der im Healthcheck verwendete Supabase-Schlüssel ist ausschließlich der veröffentlichbare Publishable Key.

## 2. Branch-Schutz – live geprüfter Stand

Die GitHub-Branch-API meldete am 16.09.2026 für `main`:

- `protected: false`;
- Protection `enabled: false`;
- keine verpflichtenden Status-Checks.

Die Rulesets-API lieferte für das Repository eine leere Liste. Damit ist aktuell kein Repository-Ruleset als zusätzlicher Schutz nachgewiesen.

**Bewertung:** Das ist ein offener Betriebs-Hardening-Punkt. Vor der finalen kommerziellen Freigabe soll `main` mindestens gegen versehentliche Direktänderungen geschützt werden. Zielkonfiguration:

1. Änderungen an `main` nur über Pull Request;
2. erfolgreiche Build-/Regression-/IONOS-Prüfungen als erforderliche Checks;
3. Force-Push und Branch-Löschung sperren;
4. Administrator-Bypass nur für dokumentierten Notfallweg;
5. Notfalländerungen anschließend über regulären PR-/Nachweisweg nachführen.

Die aktuelle Connector-Berechtigung kann den Branch-Schutz lesen, bietet aber keinen freigegebenen Schreibvorgang für diese Repository-Einstellung. Deshalb wird der Schutz nicht automatisiert behauptet oder umgangen.

## 3. Synthetisches Monitoring über GitHub Actions

`.github/workflows/operational-health-watch.yml` führt ausschließlich lesende Prüfungen gegen die IONOS-Vorschau und Supabase Auth Health aus. Der Workflow besitzt nur `contents: read`.

Der produktionsnahe Positivtest prüft:

- IONOS-Startseite inkl. Sicherheitsheader;
- PWA-Manifest;
- Service Worker;
- Datenschutzseite;
- Supabase Auth Health.

Ein separater Negativtest verwendet ausschließlich den absichtlich geschlossenen lokalen Runner-Port `127.0.0.1:9` und verändert weder IONOS noch Supabase.

## 4. Aufbewahrung des Monitoring-Nachweises

Der Healthcheck schreibt pro Lauf eine JSON-Nachweisdatei `artifacts/operational-health.json`. Der Workflow lädt diese Datei als GitHub-Actions-Artefakt hoch und setzt explizit:

`retention-days: 30`

Der Nachweis enthält ausschließlich technische Endpunkt-URLs, Zeitstempel, HTTP-Status, Laufzeiten und Prüfergebnis. Er enthält keine Beschäftigten-/Kundendaten und keine geheimen Schlüssel.

Die Funktion wurde nicht nur konfiguriert, sondern am 16.09.2026 live über GitHub Actions verifiziert:

- Workflow: `SchichtFunk: Operational Health Watch`
- Run: `35051715937`
- Commit: `a0c91083305a7bc5036779781e37d0da5368e446`
- Ergebnis: `success`
- Artefakt: `schichtfunk-operational-health-35051715937`
- Größe: 512 Byte
- erstellt: 16.09.2026 03:25:15 UTC
- Ablauf: 16.10.2026 03:25:14 UTC
- GitHub-Digest: `sha256:a3ac5bcf006decf17422b85331f00af13a3a9dc36eaeae21ad31ef3e27d5e1d2`

Damit ist die tatsächliche 30-Tage-Artefaktaufbewahrung für einen erfolgreichen Health-Lauf als Anbieter-/Live-Nachweis bestätigt und nicht nur als Workflow-Konfiguration dokumentiert.

Fehlläufe erzeugen ebenfalls den JSON-Nachweis, soweit der Runner den Check bis zur Berichtserstellung ausführen kann. Damit steht neben der GitHub-Laufhistorie ein klar begrenzter technischer Nachweiszeitraum von 30 Tagen zur Verfügung.

## 5. Zeitplanung und Integrationsgrenze

Der Workflow ist für `workflow_dispatch`, relevante Pushes und einen 30-Minuten-Cron (`17,47 * * * *`) definiert. GitHub führt geplante Workflows nur vom Default-Branch aus. Solange der Workflow ausschließlich auf `codex/ionos-migration` liegt, funktionieren Push- und manuelle Läufe; die wiederkehrende Zeitplanung wird erst nach sicherer Integration in `main` produktiv wirksam.

Bis dahin läuft ergänzend der stündliche Betreiber-Condition-Watch. Dieser ist kein Ersatz für eine personelle 24/7-Bereitschaft.

## 6. Freigabestatus

🟢 Healthcheck technisch vorhanden und positiv/negativ getestet.

🟢 30-Tage-Health-Artefaktaufbewahrung live nachgewiesen.

🟡 30-Minuten-Cron wartet auf Integration in `main`.

🔴 `main` ist derzeit nicht branchgeschützt; keine Required Checks und kein Ruleset sind live nachgewiesen.

Status: 🟡 **WORKFLOW-/MONITORING-NACHWEIS TECHNISCH UND ÜBER EIN ECHTES GITHUB-ARTEFAKT BELEGT; BRANCH-SCHUTZ VOR FINALER KOMMERZIELLER FREIGABE NOCH EINZURICHTEN.**
