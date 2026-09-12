# SchichtFunk – Roadmap-Punkt 9
## Recht, Datenschutz, Hosting & Veröffentlichung

Stand: 12.09.2026

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

## Noch offen – Punkt 9 bleibt IN ARBEIT

1. Supabase Auth „Leaked Password Protection“ aktivieren. Der Security Advisor meldet die Funktion weiterhin als deaktiviert.
2. **Vercel Hobby → mindestens Pro umstellen und danach DPA-Geltung als Vertragsnachweis archivieren.**
3. **Supabase-DPA unterzeichnen/wirksam annehmen und archivieren.**
4. Lösch- und Aufbewahrungskonzept mit konkreten Fristen/Kriterien pro Datenkategorie und Mandantenprozess finalisieren.
5. TOM-Dokumentation (technische und organisatorische Maßnahmen) als Betreiberunterlage finalisieren.
6. Verzeichnis von Verarbeitungstätigkeiten (VVT) für die Verarbeitungsvorgänge, bei denen der Betreiber selbst Verantwortlicher ist, und Auftragsverarbeitungsübersicht finalisieren.
7. DSFA-Schwellenprüfung dokumentieren, insbesondere wegen systematischer Beschäftigtendatenverarbeitung, Arbeitszeiterfassung und Gesundheits-/Krankheitsdaten. Falls die Prüfung ein voraussichtlich hohes Risiko ergibt, vollständige DSFA durchführen.
8. Backup-/Restore-Konzept und regelmäßigen Wiederherstellungstest dokumentieren.
9. Logging-/Monitoring- und Incident-Response-Aufbewahrung sowie Datenschutzverletzungsprozess nach Art. 33/34 DSGVO dokumentieren.
10. Prüfen, ob Registerangaben, USt-IdNr. oder weitere Impressumspflichten für den Betreiber einschlägig sind; falls ja, Impressum ergänzen.

## Gesamtstatus

Roadmap-Punkt 9: 🟠 **In Arbeit**.

Der öffentliche rechtliche Grundauftritt, die produktbezogene Datenschutzerklärung und die Auftragsverarbeiter-/Subprozessorendokumentation sind umgesetzt. Der AVV/DPA-Teil kann erst nach Vercel-Pro-Upgrade und Supabase-DPA-Vertragsnachweis endgültig grün gesetzt werden.
