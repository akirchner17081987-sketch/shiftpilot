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
- Supabase-Produktivprojekt ist `ACTIVE_HEALTHY` in Region `eu-central-1`.
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

### Vercel
- Tatsächlicher Teamplan geprüft: **Hobby**.
- Vercel Terms: Hobby ist auf persönliche/nicht-kommerzielle Nutzung beschränkt.
- Aktuelles Vercel-DPA gilt laut Anbieter für **Pro und Enterprise**.
- Ergebnis: Für den vorgesehenen geschäftlichen SchichtFunk-Produktivbetrieb muss der Vercel-Tarif **mindestens auf Pro** angehoben werden. Bis dahin ist der Vercel-AVV/DPA-Nachweis nicht freigabefähig.
- DPA: https://vercel.com/legal/dpa
- Unterauftragsverarbeiter: https://security.vercel.com
- DPA enthält EU-SCCs und Regelungen zur Unterauftragsverarbeitung.

### Supabase
- Organisation geprüft: `Security_Plattform`, aktueller Plan: **Free**.
- Produktivprojekt: `SchichtFunk`, Region **eu-central-1 (Frankfurt)**.
- Aktuelles DPA geprüft: https://supabase.com/downloads/docs/Supabase%2BDPA%2B260317.pdf
- Das DPA wird in den geprüften Anbieterunterlagen nicht auf einen bestimmten kostenpflichtigen Plan begrenzt, verlangt aber einen wirksamen Vertragsabschluss/Unterschriftsnachweis.
- SchichtFunk-Verarbeitungsangaben einschließlich Gesundheitsdaten („Krank“), Betroffenenkategorien, Rollenlage und zuständiger Aufsichtsbehörde sind in der AVV/DPA-Unterlage vorausgefüllt/dokumentiert.
- Aktuelle Supabase-Unterauftragsverarbeiter aus Schedule 3 sind dokumentiert.

### Weitere direkte Auftragsverarbeiter
- Kein eigenständiger Analyse-/Marketinganbieter festgestellt.
- Keine direkte Sentry-, Stripe-, Resend-, Mailgun-, SendGrid- oder Postmark-Anbindung im aktuellen Repository festgestellt.
- Supabase-Plattformkommunikation ist über die Supabase-Unterauftragsverarbeiterkette abzudecken.
- Browser-/OS-Push-Infrastruktur wird als technischer Intermediär/Empfänger in der Datenschutzerklärung beschrieben; derzeit kein separat von SchichtFunk beauftragter AVV-Anbieter.

### Teilstatus AVV/DPA + Auftragsverarbeiter

- Auftragsverarbeiter-/Subprozessorenübersicht: 🟢 dokumentiert und geprüft.
- Vercel-DPA: 🟠 blockiert durch aktuellen Hobby-Plan; Upgrade mindestens auf Pro erforderlich.
- Supabase-DPA: 🟡 fachlich vorbereitet; Unterschrift/wirksame Annahme und Archivierung als Vertragsnachweis erforderlich.

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

1. **Vercel Hobby → mindestens Pro umstellen und danach DPA-Geltung als Vertragsnachweis archivieren.**
2. **Supabase-DPA unterzeichnen/wirksam annehmen und archivieren.**
3. Lösch- und Aufbewahrungskonzept mit konkreten Fristen/Kriterien pro Datenkategorie und Mandantenprozess finalisieren.
4. TOM-Dokumentation (technische und organisatorische Maßnahmen) als Betreiberunterlage finalisieren.
5. Verzeichnis von Verarbeitungstätigkeiten (VVT) für die Verarbeitungsvorgänge, bei denen der Betreiber selbst Verantwortlicher ist, und Auftragsverarbeitungsübersicht finalisieren.
6. DSFA-Schwellenprüfung dokumentieren, insbesondere wegen systematischer Beschäftigtendatenverarbeitung, Arbeitszeiterfassung und Gesundheits-/Krankheitsdaten. Falls die Prüfung ein voraussichtlich hohes Risiko ergibt, vollständige DSFA durchführen.
7. Backup-/Restore-Konzept und regelmäßigen Wiederherstellungstest dokumentieren.
8. Logging-/Monitoring- und Incident-Response-Aufbewahrung sowie Datenschutzverletzungsprozess nach Art. 33/34 DSGVO dokumentieren.
9. Prüfen, ob Registerangaben, USt-IdNr. oder weitere Impressumspflichten für den Betreiber einschlägig sind; falls ja, Impressum ergänzen.

## Gesamtstatus

Roadmap-Punkt 9: 🟠 **In Arbeit**.

Der öffentliche rechtliche Grundauftritt, die produktbezogene Datenschutzerklärung und die Auftragsverarbeiter-/Subprozessorendokumentation sind umgesetzt. Der AVV/DPA-Teil kann erst nach Vercel-Pro-Upgrade und Supabase-DPA-Vertragsnachweis endgültig grün gesetzt werden.
