# SchichtFunk – IONOS-Deploy-Now-Migrations- und Rückfallplan

Stand: 12.09.2026

## Zielarchitektur

- IONOS Deploy Now liefert ausschließlich den statischen SchichtFunk-Webauftritt und die PWA aus.
- Supabase bleibt das Backend für Datenbank, Authentifizierung, Realtime, Storage und Edge Functions; Projektregion ist `eu-central-1` (Frankfurt). Der Pro-Tarif ist seit dem 12.09.2026 für die Organisation aktiv; der Spend Cap ist eingeschaltet.
- Vercel bleibt während der Migration technisch als Rückfallstand erhalten. Mit dem aktuellen Hobby-Tarif ist eine kommerzielle Produktiv-Rückschaltung nicht freigegeben.
- Die IONOS-Domain- und E-Mail-Verträge bleiben organisatorisch unverändert. Eine DNS-/Domain-Umschaltung erfolgt erst nach dokumentierter Staging-Abnahme und ausdrücklicher Bestätigung.

## Deploy-Now-Build

- Repository: `akirchner17081987-sketch/shiftpilot`
- Deploy-Now-Projekt-ID: `7bc70ac7-ec3b-4e7b-bae5-569c957e8514`
- Prüfbasis/Zielzweig: `codex/ionos-migration`
- IONOS-Prüfadresse: https://home-5021411544.app-ionos.space/
- Laufzeit für den Build: Plain Node.js 22
- Abhängigkeiten: `npm ci`
- Build-Befehl: `npm run build`
- Veröffentlichungsverzeichnis: `dist`
- Geprüfte Größe: 2.135.798 Byte / 2,04 MiB, Zielwert unter 50 MB
- Die Dateiauswahl für `dist` ist ausdrücklich begrenzt; Quellcode, Tests, lokale Konfigurationen und Geheimnisse werden nicht veröffentlicht.

## Routing, PWA und Sicherheitsheader

- Apache-Regeln in `.htaccess` erzwingen HTTPS, liefern kurze Routen wie `/demo`, `/impressum` und `/datenschutz` aus und fallen für clientseitige Routen auf `index.html` zurück.
- HTML, Manifest und Service Worker werden nicht langfristig zwischengespeichert; statische Assets erhalten einen begrenzten Browser-Cache.
- Content-Security-Policy, HSTS, MIME-Schutz, Frame-Schutz, Referrer-Policy und Permissions-Policy werden auf IONOS über `.htaccess` gesetzt.
- `site.webmanifest`, Icons und `schichtfunk-sw.js` sind Bestandteil des statischen Builds.

## Serverlogik und Geheimnisse

- `demo-auth` und `demo-analytics` laufen als Supabase Edge Functions. Die bisherigen Vercel-Funktionen bleiben unverändert im Repository, damit der alte Vercel-Stand technisch rückfallfähig bleibt.
- Die Edge Functions verwenden kurzlebige HMAC-signierte Demo-Sitzungstoken, eine strenge Herkunftsliste und keine Standardzugangsdaten.
- Für die Demo-Abnahme wurden folgende Supabase-Geheimnisse am 12.09.2026 neu erzeugt und gesetzt:
  - `DEMO_USER_SHA256`
  - `DEMO_PASSWORD_SHA256`
  - `DEMO_SESSION_SECRET`
  - `DEMO_ANALYTICS_INGEST_SECRET`
  - `DEMO_ALLOWED_ORIGINS` mit der aktuellen IONOS-Prüfadresse und den vorgesehenen Produktionsdomains
- Geheimniswerte dürfen weder im Git-Repository noch in Build-Ausgaben oder dieser Dokumentation gespeichert werden.

## Staging-Abnahme vor Domain-Umschaltung

Folgende Punkte sind auf der IONOS-Bereitstellungsadresse zu prüfen und zu protokollieren:

1. Öffentliche Startseite, Navigation, Markenauftritt, Impressum und Datenschutz.
2. HTTPS, Sicherheitsheader, kurze Routen, direkte Browser-Aktualisierung auf Unterseiten und 404-/SPA-Verhalten.
3. Manifest, Installierbarkeit, Service-Worker-Registrierung, Cache-Aktualisierung und Offline-Verhalten.
4. Regulärer Login, Rollenwechsel sowie Abmeldung und Sitzungsablauf.
5. Managerbereich, Mitarbeiterportal, Dienstplan und Veröffentlichungsfluss.
6. Zeiterfassung einschließlich QR, Stundenkonto und Korrektur-/Freigabeabläufe.
7. Abwesenheiten, Urlaub und Krankheitsstatus mit korrekter Mandanten-/Rollenbegrenzung.
8. Push-Abonnement und Zustellung auf mindestens einem unterstützten Gerät/Browser.
9. DATEV-LODAS-Export einschließlich plausibler Testdatei ohne Änderung von Produktionsdaten.
10. Demo-Anmeldung, Demo-Sitzung, Analytics-RPC und Zurücksetzen der fiktiven Demodaten.
11. Browser-Konsole, Netzwerkfehler, mobile Darstellung und wesentliche Barrierefreiheitsprüfungen.

Die Abnahme erfolgt mit Test-/Demo-Konten in einem getrennten, ausdrücklich als fiktiv gekennzeichneten Testmandanten. Produktionsdaten werden nicht verändert.

## Freigabe und Umschaltung

Die Domain `www.schichtfunk.de` wird erst verbunden bzw. per DNS umgeschaltet, wenn alle Staging-Prüfungen bestanden sind, die rechtlichen Seiten den tatsächlichen Anbieterstand wiedergeben, die erforderlichen Demo-Geheimnisse gesetzt sind und der Betreiber die Umschaltung ausdrücklich bestätigt hat. Kostenpflichtige IONOS- oder Supabase-Upgrades werden ebenfalls nur nach ausdrücklicher Bestätigung vorgenommen.

## Rückfallplan

1. Vor der Umschaltung werden letzte funktionierende IONOS- und Vercel-Bereitstellungskennungen sowie die bisherigen DNS-Werte dokumentiert.
2. Bei einem Fehler wird zuerst die letzte funktionierende IONOS-Bereitstellung wiederhergestellt.
3. Nur wenn IONOS nicht rechtzeitig wiederherstellbar ist, kommt Vercel als zweiter Rückfallweg in Betracht. Vor kommerzieller Aktivierung muss dessen Tarif-/DPA-Grundlage freigegeben sein.
4. Supabase-Datenbank, Authentifizierung und Projektregion bleiben beim Hosting-Rückfall unverändert; es findet keine Datenmigration zurück zu Vercel statt.
5. DNS-Änderungen erfolgen kontrolliert und ausschließlich nach ausdrücklicher Freigabe. Die vorherigen Werte werden für die Rücknahme aufbewahrt.

## Aktueller Freigabestatus

- Deploy-Now-Projekt und automatische GitHub-Actions-Bereitstellung: eingerichtet; Build- und Deployment-Läufe erfolgreich.
- Statischer Build und 28 automatisierte lokale Funktions-/Regressionstestgruppen: bestanden.
- Öffentliche IONOS-Browserprüfung: 10 von 10 Desktop-/Mobiltests bestanden (Branding, PWA-Ressourcen, Login-Validierung, Supabase-Demo-Client, responsive Breite und Sicherheitsheader).
- Kurze Seitenrouten, tiefe PWA-Routen, HTTPS/HSTS, Cache-Regeln und 404-Verhalten für fehlende statische Assets: direkt auf IONOS geprüft.
- Isolierte Demo-Prüfungen mit simulierter Edge-Function-Freigabe: Manager-/Mitarbeiterwechsel, DATEV-Download, Arbeitszeiterfassung/Stundenkonto und weitere Demoabläufe wurden ohne Produktionsdaten erreicht. Ein gebündelter Kaltstart-Dauerlauf wurde wegen zeitweise stark schwankender Antwortzeiten der Vorschau nicht als alleiniger Freigabenachweis gewertet.
- Supabase Edge Functions: bereitgestellt und mit neu erzeugten Geheimnissen aktiviert. Live-Prüfung: Anmeldung HTTP 200, Sitzungsprüfung HTTP 200, Analytics HTTP 204; CORS erlaubt exakt die IONOS-Prüfadresse.
- Geschützte Echtkonto-Prüfungen: ein isolierter fiktiver Testmandant mit einem `OWNER`-Managerkonto und einem verknüpften `EMPLOYEE`-Konto wurde angelegt. Beide Anmeldungen, Rollen sowie die RLS-bedingte Sicht auf ausschließlich diesen Testmandanten wurden über die Live-API verifiziert. Die IONOS-Browserprüfung des Managers bestand in Desktop- und Mobilansicht für Inhaberrolle, Mandantenzuordnung, alle neun Kernbereiche, die isolierte Mitarbeiterliste und die Seitenbreite. Das Mitarbeiterportal bestand zusätzlich acht geschützte Desktop-/Mobilprüfungen gegen den isolierten Testmandanten. Kennwörter sind nicht im Repository oder in dieser Dokumentation gespeichert.
- Geschützte Demo auf IONOS: echte Anmeldung, Managerbereich, Mitarbeiterportal, Dienstplan, Mitarbeiter, Abwesenheiten, Zeiterfassung/QR-Einstieg, Stundenkonto, Lohnvorschau, DATEV und beide Marktplatzansichten geprüft. Ein dabei gefundener rekursiver RPC-Wrapperfehler wurde behoben und durch Desktop-/Mobiltests abgesichert.
- Vollständige IONOS-Staging-Abnahme: weitgehend bestanden; beide isolierten Testrollen sind im Browser abgenommen. Offen bleiben Push/PWA auf einem realen Gerät und der revisionssichere DPA-/AVV-Nachweis.
- Demo-Geheimnisse in Supabase: gesetzt; Klartextwerte sind nicht im Repository oder in dieser Dokumentation gespeichert.
- Supabase Pro: aktiv. Der DPA-/AVV-Nachweis und die Liste der Auftragsverarbeiter müssen noch revisionssicher archiviert werden.
- Domain-Umschaltung: gesperrt bis Staging-Abnahme und ausdrücklicher Betreiberfreigabe.
