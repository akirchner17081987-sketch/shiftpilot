# Portalversionen, Cache und Sitzungen – 07.11.2026

Arbeitszweig `codex/multi-company-migration-draft-20261106`. Keine produktive Bereitstellung oder Datenbankänderung.

## Befunde

- Der Service Worker lädt JavaScript und CSS zuerst aus dem Netz. Bei einem Netzfehler kann er eine ältere Cacheversion verwenden. Ein HTTP-Fehler wird dagegen unmittelbar zurückgegeben und löst keinen Cache-Fallback aus. Antworten mit `private` oder `no-store` ersetzen keinen Cacheeintrag.
- Die mit dem tatsächlichen Service-Worker-Quelltext ausgeführten simulierten Netz- und Cacheprüfungen bestätigen alte Cacheantwort, Netzaktualisierung, aktualisierten Cache, HTTP-503 und den Ausschluss von `private`/`no-store`. Die Umgebung simuliert Browser-APIs; sie ist kein echter Browsernachweis.
- Die bestehenden automatisierten Tests zu PWA, Portalinitialisierung und mehrdeutiger Altidentität sowie die zwei neuen Cachetests bestanden zusammen 26 Prüfungen.
- Das Mitarbeiterportal wählt die unternehmensbezogenen Aufrufe nur, wenn `__sfEmployeeMultiCompanyReady === true`. Im geprüften Arbeitszweig wurde in den durchsuchten Anwendungsdateien keine Aktivierungszuweisung gefunden; dies beweist nicht, dass keine externe Laufzeitkonfiguration existiert. Ohne Aktivierung wird der bisherige Pfad verwendet. Bei mehreren Profilen verweigert die geänderte Datenbank-Hilfsfunktion die nicht eindeutige Identität. Daraus kann ein Verfügbarkeitsproblem beim Mischen alter Portalversionen mit neuer Datenbank entstehen. Die Aktivierung darf nicht ungeprüft erfolgen.
- Frühere Prüfungen mit zwei unabhängig angemeldeten Sitzungen auf dem älteren QA-Zweig belegten deren beobachteten Unternehmenswechsel; sie belegen weder den jetzt migrierten Testzweig noch alle Cache- und Schreibpfade.

## Echter Browsertest vorbereitet, noch nicht bestanden

`node --test tests/browser/multi-company-cache-isolation.test.cjs` startet einen lokalen Server mit fiktiven Inhalten, testet den echten Service Worker und zwei Tab-Speicher. Der Test greift nicht auf externe Dienste oder Zugangsdaten zu. Optional kann `SF_QA_CHROMIUM` auf einen vorhandenen Chromium-Browser zeigen.

Ein Startversuch in der aktuellen Arbeitsumgebung scheiterte bereits beim Start des Chromium-Prozesses (`socket() failed: Operation not permitted`). Das ist kein gescheiterter Anwendungstest, aber auch kein erfolgreicher Browsernachweis. Der Test muss in einer geeigneten Umgebung ausgeführt und sein Ergebnis dokumentiert werden. Er überprüft generische `sessionStorage`-Trennung, nicht den vollständigen Portalwechsel mit echter Anmeldung.

Vor Freigabe bleiben ein echter Test von Alt- und Neuversion einschließlich Netzwerkabbruch, mehrerer Profile und Schreibvorgängen auf dem migrierten Testzweig, Prüfung des tatsächlich ausgelieferten IONOS-Standes sowie eine vollständige unabhängige Wiederherstellungsprobe offen. Der Migrationsentwurf bleibt gesperrt.
