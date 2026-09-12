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
- IONOS Deploy Now Starter ist als künftiges Primärhosting vorgesehen; Repository, statischer Build (`dist`) und Staging-Konfiguration sind vorbereitet. Die produktive Domain bleibt bis zur Abnahme unverändert.
- Der reproduzierbare statische Build umfasst 2,04 MiB und liegt damit deutlich unter dem Starter-Limit von 50 MB pro statischem Projekt.
- Die beiden bislang Vercel-spezifischen Demo-Endpunkte `demo-auth` und `demo-analytics` wurden als Supabase Edge Functions in Frankfurt bereitgestellt. Sie sind ohne die noch zu übernehmenden/neu zu setzenden Demo-Geheimnisse absichtlich nicht nutzbar.
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

### IONOS
- IONOS Deploy Now ist als primäre Auslieferungsplattform für die statische Webseite/PWA vorgesehen; IONOS verarbeitet dabei technisch erforderliche Webzugriffs- und Sicherheitsdaten.
- Nach der offiziellen IONOS-Vertragsinformation ist der AVV für seit dem 19.07.2022 geschlossene Verträge Bestandteil der IONOS-AGB. Der im September 2026 gebuchte Deploy-Now-Vertrag fällt zeitlich in diesen Bereich; Vertragsunterlagen, maßgebliche AGB-/AVV-Fassung und Buchungsnachweis sind dennoch als Nachweis zu archivieren.
- Vor Produktivfreigabe sind die für Deploy Now tatsächlich geltenden Protokollierungs-, Lösch- und Unterauftragsverarbeiterangaben nochmals anhand der konkreten Vertrags-/Produktunterlagen zu prüfen.

### Vercel
- Tatsächlicher Teamplan geprüft: **Hobby**.
- Vercel Terms: Hobby ist auf persönliche/nicht-kommerzielle Nutzung beschränkt.
- Aktuelles Vercel-DPA gilt laut Anbieter für **Pro und Enterprise**.
- Ergebnis: Vercel bleibt zunächst als technische Rückfallumgebung bestehen, darf mit dem aktuellen Hobby-Plan aber nicht als kommerziell genutztes Produktivhosting aktiviert werden. Eine tatsächliche Rückschaltung für Geschäftsbetrieb setzt daher vorher eine geeignete Vertrags-/Tarifgrundlage (derzeit mindestens Pro) oder eine andere freigegebene Rückfallplattform voraus.
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
- IONOS-AVV: 🟡 zeitlich von der AGB-Einbeziehung erfasst; konkrete Vertragsfassung und Produktdetails noch zu archivieren/prüfen.
- Vercel-DPA: 🟡 für die inaktive Rückfallumgebung dokumentiert; kommerzielle Aktivierung mit Hobby ausgeschlossen.
- Supabase-DPA: 🟡 fachlich vorbereitet; Unterschrift/wirksame Annahme und Archivierung als Vertragsnachweis erforderlich.

## Noch offen – Punkt 9 bleibt IN ARBEIT

1. Supabase Auth „Leaked Password Protection“ aktivieren. Der Security Advisor meldet die Funktion weiterhin als deaktiviert.
2. **IONOS-Vertragsunterlagen einschließlich der für Deploy Now geltenden AGB-/AVV-Fassung, Protokollierungsfristen und Unterauftragsverarbeiter als Nachweis archivieren.**
3. **Supabase-DPA unterzeichnen/wirksam annehmen und archivieren.**
4. Für einen möglichen produktiven Vercel-Rollback vor Aktivierung eine kommerziell zulässige Tarif-/DPA-Grundlage herstellen; kein Upgrade ohne ausdrückliche Freigabe.
5. Lösch- und Aufbewahrungskonzept mit konkreten Fristen/Kriterien pro Datenkategorie und Mandantenprozess finalisieren.
6. TOM-Dokumentation (technische und organisatorische Maßnahmen) als Betreiberunterlage finalisieren.
7. Verzeichnis von Verarbeitungstätigkeiten (VVT) für die Verarbeitungsvorgänge, bei denen der Betreiber selbst Verantwortlicher ist, und Auftragsverarbeitungsübersicht finalisieren.
8. DSFA-Schwellenprüfung dokumentieren, insbesondere wegen systematischer Beschäftigtendatenverarbeitung, Arbeitszeiterfassung und Gesundheits-/Krankheitsdaten. Falls die Prüfung ein voraussichtlich hohes Risiko ergibt, vollständige DSFA durchführen.
9. Backup-/Restore-Konzept und regelmäßigen Wiederherstellungstest dokumentieren.
10. Logging-/Monitoring- und Incident-Response-Aufbewahrung sowie Datenschutzverletzungsprozess nach Art. 33/34 DSGVO dokumentieren.
11. Prüfen, ob Registerangaben, USt-IdNr. oder weitere Impressumspflichten für den Betreiber einschlägig sind; falls ja, Impressum ergänzen.

## Gesamtstatus

Roadmap-Punkt 9: 🟠 **In Arbeit**.

Der öffentliche rechtliche Grundauftritt, die produktbezogene Datenschutzerklärung und die Auftragsverarbeiter-/Subprozessorendokumentation sind umgesetzt. Der AVV/DPA-Teil kann erst nach Archivierung der konkreten IONOS-Vertragsunterlagen, wirksamem Supabase-DPA-Nachweis und Abschluss der übrigen Betreiberunterlagen endgültig grün gesetzt werden. Vercel Pro ist für das geplante IONOS-Primärhosting nicht erforderlich, wohl aber vor einer kommerziellen Aktivierung des Vercel-Rollbacks.
