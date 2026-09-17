# SchichtFunk – Roadmap-Punkt 9
## Recht, Datenschutz, Hosting & Veröffentlichung

Stand: 17.09.2026

## Bereits umgesetzt / verifiziert

- Betreiberangaben aus der vorübergehenden SchichtFunk-Startseite übernommen:
  - Alexander Kirchner
  - Neue Straße 23
  - 06632 Gröst
  - Deutschland
  - info@schichtfunk.de
- Produktive Impressumsseite angelegt (`/impressum`).
- Vollständige produktbezogene Datenschutzerklärung angelegt (`/datenschutz`).
- Rechtliche Links werden auf der öffentlichen SchichtFunk-Seite und im Managerbereich eingeblendet.
- Produktive Sicherheitsheader vorhanden: Content-Security-Policy, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy und Permissions-Policy.
- Öffentliche Analyse-/Marketingtracker wurden im aktuellen Repository-Stand nicht festgestellt.
- Supabase Pro ist für die Organisation `Security_Plattform` aktiv; Spend Cap ist eingeschaltet und das Produktivprojekt `SchichtFunk` ist `ACTIVE_HEALTHY` in Region `eu-central-1` (Frankfurt).
- IONOS Deploy Now ist als Primärhosting für die statische SchichtFunk-Webanwendung/PWA eingerichtet und technisch abgenommen. Die Umschaltung von `www.schichtfunk.de` bleibt ein separater, ausdrücklich freizugebender Schritt.
- Vercel bleibt ausschließlich als technischer Rückfallstand erhalten. Für den IONOS-Primärbetrieb ist kein Vercel-Pro-Upgrade erforderlich.
- Der zuvor anonym ausführbare SECURITY-DEFINER-RPC `manager_import_month_matrix` wurde für `anon` gesperrt; die entsprechende Supabase-Security-Advisor-Warnung ist danach verschwunden.
- Die Datenschutzerklärung bildet den tatsächlichen Funktionsumfang ab: Benutzerkonten, Rollen, Mitarbeiterstammdaten, Dienstplanung, Abwesenheiten/Krankheitsdaten, Zeiterfassung, QR, Stundenkonto, Feiertage, Schichtänderungen, Tausch, Marktplatz, Auto-Planung, Störfall-Autopilot, Push, PWA/Browser-Speicher, Demo und DATEV-LODAS-Export.
- Vollständige Betreiberunterlage `documentation/avv-dpa-subprocessors-2026-09-12.md` für direkte Auftragsverarbeiter, DPA-Lage, Unterauftragsverarbeiter und Drittlandtransfers angelegt.
- Supabase Auth „Leaked Password Protection“ aktiviert und als erledigt verifiziert.
- Produktions-Sicherheit/MFA/AAL2 (Roadmap 9.4) technisch umgesetzt und praktisch abgenommen.

## Rechtliche Einordnung im Datenschutztext

- Öffentliche Website / eigene Vertrags- und Supportprozesse: SchichtFunk-Betreiber als Verantwortlicher.
- Kundenseitig verarbeitete Beschäftigtendaten: jeweiliges Kundenunternehmen bzw. Arbeitgeber als Verantwortlicher; SchichtFunk als Auftragsverarbeiter, soweit vertraglich vereinbart.
- Krankheitsangaben werden als besondere Kategorie personenbezogener Daten nach Art. 9 DSGVO behandelt.
- Für Beschäftigtendaten wird auf Art. 6 DSGVO, § 26 BDSG und – soweit Gesundheitsdaten betroffen sind – Art. 9 DSGVO / § 26 Abs. 3 BDSG hingewiesen, wobei die konkrete Rechtsgrundlage vom jeweiligen Arbeitgeber festgelegt wird.
- PWA-/Browser-Speicher wird als technisch erforderliche Speicherung beschrieben; nicht notwendige Analyse-/Marketing-Cookies sind derzeit nicht vorgesehen.
- Auto-Planung und Störfall-Autopilot werden als unterstützende regelbasierte Funktionen beschrieben; keine ausschließlich automatisierte Entscheidung mit Rechtswirkung nach dem aktuellen Produktstand.

## Auftragsverarbeiter / AVV-DPA-Prüfung

### IONOS
- IONOS Deploy Now ist als primäre Auslieferungsplattform für die statische Webseite/PWA vorgesehen.
- IONOS-Staging, statischer Build, Sicherheitsheader, PWA-Funktionen und Supabase-Anbindung wurden technisch abgenommen.
- Die produktive Domain `www.schichtfunk.de` ist noch nicht auf IONOS umgeschaltet; die DNS-/Domain-Umschaltung erfolgt erst nach ausdrücklicher Betreiberfreigabe.
- Nach der Umschaltung werden HTTPS, Login, PWA-Installation, Push-Neuregistrierung und Testzustellung erneut geprüft.

### Vercel
- Tatsächlicher Teamplan: **Hobby**.
- Vercel ist nicht mehr als Primärhosting vorgesehen, sondern ausschließlich als technischer Rückfallstand.
- Für den geplanten geschäftlichen Betrieb über IONOS ist **kein Vercel-Pro-Upgrade erforderlich**.
- Mit dem Hobby-Tarif ist eine kommerzielle Rückschaltung auf Vercel nicht freigegeben.
- Nur falls Vercel später wieder kommerziell produktiv aktiviert werden soll, muss vorher eine geeignete Tarif-/DPA-Grundlage hergestellt werden; ein Upgrade erfolgt nicht vorsorglich.

### Supabase
- Organisation `Security_Plattform`: **Pro**, Spend Cap aktiviert.
- Produktivprojekt: `SchichtFunk`, Region **eu-central-1 (Frankfurt)**.
- Supabase bestätigt die automatische Einbeziehung des DPA in die Nutzungsbedingungen; eine separate Unterschrift ist nicht erforderlich.
- DPA, SCC, TIA und Unterauftragsverarbeiter sind dokumentiert.
- SchichtFunk-Verarbeitungsangaben einschließlich Gesundheitsdaten („Krank“), Betroffenenkategorien, Rollenlage und zuständiger Aufsichtsbehörde sind in der AVV/DPA-Unterlage dokumentiert.

### Weitere direkte Auftragsverarbeiter
- Kein eigenständiger Analyse-/Marketinganbieter festgestellt.
- Keine direkte Sentry-, Stripe-, Resend-, Mailgun-, SendGrid- oder Postmark-Anbindung im aktuellen Repository festgestellt.
- Supabase-Plattformkommunikation ist über die Supabase-Unterauftragsverarbeiterkette abzudecken.
- Browser-/OS-Push-Infrastruktur wird als technischer Intermediär/Empfänger in der Datenschutzerklärung beschrieben; derzeit kein separat von SchichtFunk beauftragter AVV-Anbieter.

### Teilstatus AVV/DPA + Auftragsverarbeiter

- Auftragsverarbeiter-/Subprozessorenübersicht: 🟢 dokumentiert und geprüft.
- IONOS-AVV: 🟢 für das vorgesehene Primärhosting dokumentiert.
- Vercel-DPA: 🟡 nur für eine mögliche spätere kommerzielle Rückschaltung relevant; kein Blocker für IONOS.
- Supabase-DPA: 🟢 automatische Einbeziehung sowie DPA-/SCC-/TIA-Nachweise dokumentiert.

## 9.4 Produktions-Sicherheit / MFA / AAL2

Status: 🟢 **Abgeschlossen und produktiv verifiziert**.

Festgelegte Richtlinie:

- MFA wird nicht bei jeder Anmeldung verlangt.
- Normale Anmeldung sowie Lese- und Listenfunktionen bleiben mit AAL1 nutzbar.
- Für kritische Admin-Aktionen verlangt SchichtFunk unmittelbar vor der Ausführung eine MFA-Bestätigung und AAL2.

Technische Umsetzung:

- Serverseitige AAL2-Durchsetzung über den Supabase/Postgres-Gateway-Guard.
- 13 kritische Admin-RPCs sind geschützt, unter anderem Benutzer-/Rollenänderungen, Einladungen, DATEV-Freigaben, Monatsabschluss und Wiederöffnung, QR-Terminalverwaltung sowie der vollständige Dienstplan-Reset.
- Die Weboberfläche verwendet einen zentralen Step-up-Mechanismus: Bei `MFA_REQUIRED` wird die MFA-Bestätigung geöffnet und die Aktion erst danach einmalig wiederholt.
- Der allgemeine Sitzungsstart fordert kein AAL2 mehr an.
- Cache-Versionen der sicherheitsrelevanten Webmodule wurden angehoben und produktiv ausgerollt.

Produktive Abnahme am 17.09.2026:

- Passwortanmeldung öffnet SchichtFunk ohne MFA.
- „Benutzer & Rechte“ und die Benutzerliste laden ohne MFA.
- Ein geschützter Einladungsversuch öffnet die MFA-Sicherheitsbestätigung.
- Der Test wurde in der MFA-Abfrage abgebrochen; es wurde keine Einladung angelegt.
- Produktions-Deployment ist aktiv; keine SchichtFunk-Anwendungsfehler wurden festgestellt.

## Noch offen – Punkt 9 bleibt IN ARBEIT

1. **`www.schichtfunk.de` nach ausdrücklicher Freigabe per DNS auf IONOS umschalten und anschließend HTTPS, Login, PWA sowie Push erneut prüfen.**
2. Lösch- und Aufbewahrungskonzept mit konkreten Fristen/Kriterien pro Datenkategorie und Mandantenprozess finalisieren.
3. TOM-Dokumentation (technische und organisatorische Maßnahmen) als Betreiberunterlage finalisieren.
4. Verzeichnis von Verarbeitungstätigkeiten (VVT) für die Verarbeitungsvorgänge, bei denen der Betreiber selbst Verantwortlicher ist, und Auftragsverarbeitungsübersicht finalisieren.
5. DSFA-Schwellenprüfung dokumentieren, insbesondere wegen systematischer Beschäftigtendatenverarbeitung, Arbeitszeiterfassung und Gesundheits-/Krankheitsdaten. Falls die Prüfung ein voraussichtlich hohes Risiko ergibt, vollständige DSFA durchführen.
6. Backup-/Restore-Konzept und regelmäßigen Wiederherstellungstest dokumentieren.
7. Logging-/Monitoring- und Incident-Response-Aufbewahrung sowie Datenschutzverletzungsprozess nach Art. 33/34 DSGVO dokumentieren.
8. Prüfen, ob Registerangaben, USt-IdNr. oder weitere Impressumspflichten für den Betreiber einschlägig sind; falls ja, Impressum ergänzen.

Hinweis: Ein Vercel-Pro-Upgrade ist kein offener Pflichtpunkt. Es wird nur erforderlich, wenn Vercel später wieder kommerziell produktiv genutzt werden soll.

## Gesamtstatus

Roadmap-Punkt 9: 🟠 **In Arbeit**.

Der öffentliche rechtliche Grundauftritt, die produktbezogene Datenschutzerklärung und die Anbieter-AVV/DPA-Nachweise für IONOS und Supabase sind umgesetzt. Punkt 9 bleibt bis zur ausdrücklich freigegebenen IONOS-Domainumschaltung mit anschließender Produktionsnachprüfung sowie den übrigen rechtlichen und betrieblichen Abschlussarbeiten in Arbeit. Vercel Pro ist für das IONOS-Primärhosting nicht erforderlich.
