# SchichtFunk – Produktivnachweis Löschautomatisierung

Stand: 14.09.2026

## Aktivierter Umfang

Im produktiven Supabase-Projekt `zbvloohfjleadjnqhbbh` in Frankfurt wurden die Datenschutzmigrationen V1 bis V9 installiert und in der Migrationshistorie als angewendet erfasst. Aktiv sind:

- private, idempotente Löschaufträge mit Legal-Hold- und Fristprofilprüfung;
- reguläre Zwei-Personen-Freigabe sowie `SOLE_OWNER_DELAYED` mit zwei AAL2-Sitzungen, 24 Stunden Abkühlfrist und 7 Tagen Bestätigungsfenster;
- getrennte Phasen `ACCESS` und `ERASURE`;
- Widerruf von Auth-Sitzungen, Sperrung von Mitarbeiterzugang, Einladungen, Push- und QR-Zuordnungen;
- fristgebundene Redaktion von Kontakt-, Notfallkontakt- und kurzlebigen Freitextdaten;
- ein externer Auth-/Storage-Worker mit idempotenten Wiederholungs- und `BLOCKED`-Zuständen;
- Supabase-Cron-Job `schichtfunk-privacy-lifecycle-worker` alle 15 Minuten, höchstens zehn Aufträge je Aufruf.

Auth-Konten und Personalakten-Dateien werden nicht allein durch die Aktivierung pauschal gelöscht. Diese beiden Kategorien bleiben standardmäßig deaktiviert und werden nur berücksichtigt, wenn ein wirksam freigegebenes Kunden-Fristprofil `deleteAuthAccount` bzw. `deletePersonnelDocuments` ausdrücklich auf `true` setzt. Die jeweils zugehörige Tagesfrist wird in den Gesamtfälligkeitstermin einbezogen. Geänderte Storage-Manifeste, weitere Kontozuordnungen, Managementrollen, Legal Holds oder technische Fehler sperren den Auftrag.

## Schutz der Ausführung

- Die Bedienfunktion `privacy-lifecycle` verlangt ein gültiges Benutzer-JWT; ein anonymer Produktionsaufruf wurde mit HTTP 401 abgewiesen.
- Der Hintergrundworker akzeptiert ausschließlich ein separates 256-Bit-Geheimnis. Es liegt als Edge-Function-Secret und verschlüsselt in Supabase Vault; es wurde nicht in Repository, Browser oder Protokoll geschrieben.
- Die produktiven Worker-RPCs sind für `anon` und `authenticated` nicht ausführbar und ausschließlich `service_role` zugewiesen.
- Öffentliche RPC-Wrapper sind `SECURITY INVOKER`; privilegierte Implementierungen liegen im nicht exponierten Schema `private` mit festem leerem `search_path`.
- Auth-Sitzungswiderruf und Datenbank-Zugriffssperre laufen atomar. Externe Fehler führen nicht zu einem Erfolgsstatus, sondern zu `BLOCKED`.
- Der einzige aktive OWNER sowie eine Mandantenlöschung bleiben technisch ausgeschlossen.

## Produktivabnahme

| Kontrolle | Ergebnis |
|---|---|
| lokaler Regressionstest | 33/33 Testdateien bestanden |
| vorheriger V6-Wegwerfbranch | 22/22 neue und 41/41 bestehende Datenbankprüfungen bestanden |
| Produktivschema vor Aktivierung | 0 Löschaufträge, 0 Fristprofile, 0 Legal Holds |
| direkter autorisierter Worker-Leerlauf | HTTP 200, `ok=true`, 0 verarbeitet |
| anonymer Worker-Aufruf | HTTP 401 |
| anonymer Lifecycle-Aufruf | HTTP 401 |
| ACL Worker- und Erasure-RPCs | `anon=false`, `authenticated=false`, `service_role=true` |
| echter Cron-Lauf | 14.09.2026 06:36 UTC erfolgreich |
| HTTP-Ergebnis des Cron-Laufs | Status 200, kein Timeout, 0 verarbeitet |
| endgültiger Zeitplan | aktiv, `*/15 * * * *` |
| Datenwirkung der Abnahme | 0 Aufträge, 0 bearbeitet, 0 Nutzdatenänderungen |
| Security Advisor | ausschließlich die bekannten 35 allowlist-geprüften Bestandswarnungen; keine neue Worker-Warnung |

Der erste autorisierte Leerlauftest wurde korrekt mit `Service role required` abgewiesen, weil die vorbereitete Prüfung nur das ältere einzelne Rollenfeld las. V9 unterstützt sowohl dieses Feld als auch das aktuelle verifizierte JWT-Claims-JSON und bleibt bei fehlenden oder ungültigen Claims geschlossen. Der Wiederholungstest sowie der echte Cron-Lauf bestanden danach.

## Betrieb und Kosten

Der Job läuft viermal pro Stunde, also ungefähr 2.880-mal in 30 Tagen. Dafür wurde kein zusätzlicher Tarif und kein weiterer Preview-Branch gebucht. Aufrufe und Datenverkehr werden auf die vorhandenen Supabase-Pro-Inklusivmengen angerechnet; erst eine Überschreitung der vertraglichen Inklusivmengen könnte variable Mehrkosten verursachen.

Die Cron-Ausführung folgt der aktuellen Supabase-Dokumentation zu `pg_cron`, `pg_net` und Vault: https://supabase.com/docs/guides/functions/schedule-functions

Status: 🟢 **LÖSCHAUTOMATISIERUNG PRODUKTIV AKTIV; 15-MINUTEN-JOB UND GESAMTER AUFRUFWEG BESTANDEN. KEIN LÖSCHAUFTRAG VORHANDEN UND KEINE NUTZDATEN VERÄNDERT.**
