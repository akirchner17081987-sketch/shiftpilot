# SchichtFunk – Sicherheits- und Betriebsnachweisregister

Stand: 13.09.2026  
Dokumentstatus: Betreiberunterlage, Version 1.0  
Prüfumgebung: Zweig `codex/ionos-migration`; keine Änderung an Produktionsdaten oder produktiven Einstellungen

## 1. Zweck und Bewertungsmaßstab

Dieses Register ordnet die in den SchichtFunk-TOM beschriebenen Kontrollen konkreten Nachweisen zu. Es unterscheidet:

- **Live-Nachweis:** gegen die öffentlich erreichbare IONOS-Vorschau oder eine Anbieteroberfläche geprüft;
- **technischer Nachweis:** reproduzierbarer Build, Test oder Quellcode-Prüfung;
- **Prozessnachweis:** freigegebener Ablauf oder dokumentiertes Planspiel;
- **Anbieternachweis:** vertragliche oder technische Zusicherung eines Auftragsverarbeiters;
- **offen:** noch kein ausreichender Betriebsnachweis.

Ein dokumentierter Entwurf oder ein statischer Test ersetzt keinen echten Wiederanlauf, keine kundenspezifische DSFA und keine dauerhaft überwachte Betriebsorganisation.

## 2. Nachweismatrix

| Kontrollbereich | Nachweis | Ergebnis am 13.09.2026 | Restgrenze |
|---|---|---|---|
| Reproduzierbarer IONOS-Build | `npm run build`; Vollständigkeits- und Größenprüfung durch `scripts/build-static.mjs` | bestanden; 2.156.091 Byte (2,06 MiB), damit unter 50 MiB | erneuter Lauf vor jeder Freigabe erforderlich |
| Statische Regression | `npm test` einschließlich Datenschutz-, Auth-, RLS-/RPC-, QR-, Push-, DATEV- und Restore-Prüfungen | 32/32 Testdateien bestanden; 0 fehlgeschlagen | vor sicherheitsrelevanten Freigaben erneut ausführen |
| IONOS-Migrationskontrollen | `npm run test:ionos` | bestanden; Edge-Function-Umschaltung, HMAC-Schutz, Routing, Header und Buildkonfiguration geprüft | kein Nachweis der IONOS-internen Betriebsprozesse |
| Abhängigkeiten | `npm audit --audit-level=high` gegen `package-lock.json` | 0 bekannte Schwachstellen zum Prüfzeitpunkt | Datenbank ändert sich; bei Releases erneut prüfen |
| Öffentliche Verfügbarkeit | HTTP-Prüfung von `/`, `/impressum`, `/datenschutz`, Service Worker, Manifest und einer unbekannten SPA-Route auf `home-5021411544.app-ionos.space` | alle sechs Ziele HTTP 200; korrekte Inhaltstypen; SPA-Fallback aktiv | keine 24/7-Verfügbarkeitsmessung oder Alarmierung |
| Webschutz | derselbe Live-Abruf | CSP, HSTS, `nosniff`, `DENY` und Referrer-Policy auf allen sechs Zielen vorhanden | keine externe Penetrationsprüfung |
| PWA-Aktualität | Live-Abruf plus `.htaccess` und `schichtfunk-sw.js` | HTML, Manifest und Service Worker mit `no-cache, no-store, must-revalidate`; API-/QR-Antworten werden nicht durch den Service Worker gecacht | Browser-/OS-Verhalten bleibt geräteabhängig |
| Supabase-Authentifizierung | Security Advisor, Auth-Konfiguration, `auth-hardening-runbook-2026-09-13.md` und `mfa-session-recovery-test-2026-09-13.md` | Leaked Password Protection aktiv; zwei synthetische Rollen bestanden TOTP, Ersatzfaktor, Falschcode, Faktorverlust sowie `others`-/`global`-Widerruf; 0 aktive Refresh-Tokens, Branch gelöscht | organisatorische Echtkonten-Einführung und breitere serverseitige AAL2-Erzwingung offen |
| Mandantentrennung und privilegierte RPCs | `security-definer-allowlist-2026-09-13.md`, `security-definer-cross-tenant-test-2026-09-13.md`, Allowlist-Drift- und Regressionstest | 35 Funktionen exakt erfasst; 35/35 Fremdmandantenprüfungen auf datenlosem Wegwerf-Branch bestanden; Rollback und Löschung bestätigt | bei neuen oder geänderten privilegierten RPCs vollständig wiederholen |
| Datenbank- und Storage-Restore | `backup-storage-restore-pruefung-2026-09-13.md` und `privacy-testbranch-protocol-2026-09-13.md` | tägliche DB-Backups sichtbar; logischer DB-Restore 4/4; privater Storage-Zyklus bytegleich, anschließend 0 Testobjekte | physischer Tagesbackup-Restore und dauerhafter Storage-Export offen |
| Änderungen und Rückfall | Git-Historie, IONOS-Testzweig und `ionos-deploy-now-migration-2026-09-12.md` | Änderungen versioniert; IONOS-Vorschau vor Domainumschaltung; Vercel technisch erhalten | Vercel Hobby ist nicht für kommerziellen Rückfall freigegeben |
| Datenschutzvorfall | `incident-response-runbook-2026-09-13.md` | Ablauf, Schweregrade, 72-Stunden-Entscheidungsweg, fiktives Planspiel und technischer Zwei-Konten-Sitzungswiderruf dokumentiert | Alarmierung, Vertretung und Schlüsselrotationsdrill offen |
| Logging und Monitoring | `logging-monitoring-retention-2026-09-13.md` | Logquellen, Zugriffsgrenzen, Prüfauslöser und Ziel-Alarme dokumentiert | Anbieterfristen, Alarmwege und kundenbezogene Aufbewahrung noch zu bestätigen |
| Löschfreigabe im Ein-OWNER-Betrieb | `ein-owner-loeschfreigabe-2026-09-14.md`, `privacy-sole-owner-testbranch-protocol-2026-09-14.md`, V6-Migration und DB-Test | 22/22 neue und 41/41 bestehende Datenbankprüfungen bestanden; Rollback, ACL-Grenze, Edge-401, 0 Zeitpläne, 0 Restdaten und Branch-Löschung bestätigt | Auth-/Storage-Worker, Langfristredaktion, Zeitplanung und Produktivfreigabe stehen aus |
| Auftragsverarbeiter | `avv-dpa-evidence-register-2026-09-12.md` | IONOS-AVV sowie Supabase-DPA/SCC/TIA und Unterauftragnehmer dokumentiert | regelmäßige Änderungsprüfung und IONOS-Produktlogfrist offen |

## 3. Live-Prüfprotokoll IONOS-Vorschau

Prüfzeit: 13.09.2026, 17:36:23 UTC. Es wurden ausschließlich öffentliche GET-Abrufe ausgeführt; keine Anmeldung, kein Schreibzugriff und keine Produktivdaten waren beteiligt.

| Pfad | Status | Typ | Größe | Cache-Regel |
|---|---:|---|---:|---|
| `/` | 200 | `text/html` | 198.925 Byte | `no-cache, no-store, must-revalidate` |
| `/impressum` | 200 | `text/html` | 2.931 Byte | `no-cache, no-store, must-revalidate` |
| `/datenschutz` | 200 | `text/html` | 22.456 Byte | `no-cache, no-store, must-revalidate` |
| `/schichtfunk-sw.js` | 200 | `text/javascript` | 3.772 Byte | `no-cache, no-store, must-revalidate` |
| `/site.webmanifest` | 200 | `application/manifest+json` | 1.220 Byte | `no-cache, no-store, must-revalidate` |
| `/nicht-vorhandene-spa-route` | 200 | `text/html` | 198.925 Byte | `no-cache, no-store, must-revalidate` |

Auf allen Antworten waren Content-Security-Policy, HSTS, X-Content-Type-Options, X-Frame-Options und Referrer-Policy vorhanden. Der unbekannte Pfad lieferte bytegleich die App-Shell und bestätigt damit den SPA-Fallback.

## 4. Reproduzierbarkeit

Die folgenden Prüfungen sind vor einer Produktivfreigabe oder nach sicherheitsrelevanten Änderungen erneut auszuführen:

```text
npm ci
npm audit --audit-level=high
npm test
npm run test:ionos
npm run build
```

Die Ausgabe darf keine Zugangsdaten enthalten. Testergebnisse gehören in die Git-/Release-Historie; Screenshots oder Exportdateien mit Beschäftigtendaten gehören nicht in das Repository.

## 5. Offene Nachweise nach Priorität

1. MFA für echte privilegierte Konten organisatorisch freigeben und sensible RPCs stufenweise serverseitig auf AAL2 verpflichten.
2. Dauerhaften separaten Export des privaten Personalakten-Storage einrichten und Wiederherstellbarkeit regelmäßig prüfen.
3. Physischen Tagesbackup-Restore nur in einer ausdrücklich freigegebenen, isolierten Umgebung durchführen; niemals ungeprüft im Produktivprojekt.
4. Alarmierung, Vertretung, Bereitschaftszeiten und Aufbewahrung der Betriebs-/Sicherheitslogs festlegen und testen.
5. IONOS-Deploy-Now-spezifische Logfrist schriftlich bestätigen.
6. Betreibergeräte, Festplattenverschlüsselung, Patchstand und sichere Wiederherstellung organisatorisch nachweisen, ohne Gerätekennungen oder Geheimnisse in Git abzulegen.

## 6. Quellen

- Supabase Security: https://supabase.com/docs/guides/security
- Supabase Backups: https://supabase.com/docs/guides/platform/backups
- DSGVO Artikel 32 bis 34: https://eur-lex.europa.eu/eli/reg/2016/679/deu
- BSI, Behandlung von Sicherheitsvorfällen: https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Cyber-Sicherheitslage/Reaktion/Vorfallunterstuetzung/vorfallsunterstuetzung.html

Status: 🟡 **KERN-NACHWEISE EINSCHLIESSLICH 35/35 FREMDMANDANTEN- UND ZWEI-KONTEN-MFA-/SITZUNGSTEST REPRODUZIERBAR VORHANDEN; LIVE-ALARMIERUNG UND PHYSISCHER WIEDERANLAUF BLEIBEN OFFEN.**
