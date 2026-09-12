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

## Rechtliche Einordnung im Datenschutztext

- Öffentliche Website / eigene Vertrags- und Supportprozesse: SchichtFunk-Betreiber als Verantwortlicher.
- Kundenseitig verarbeitete Beschäftigtendaten: jeweiliges Kundenunternehmen bzw. Arbeitgeber als Verantwortlicher; SchichtFunk als Auftragsverarbeiter, soweit vertraglich vereinbart.
- Krankheitsangaben werden als besondere Kategorie personenbezogener Daten nach Art. 9 DSGVO behandelt.
- Für Beschäftigtendaten wird auf Art. 6 DSGVO, § 26 BDSG und – soweit Gesundheitsdaten betroffen sind – Art. 9 DSGVO / § 26 Abs. 3 BDSG hingewiesen, wobei die konkrete Rechtsgrundlage vom jeweiligen Arbeitgeber festgelegt wird.
- PWA-/Browser-Speicher wird als technisch erforderliche Speicherung beschrieben; nicht notwendige Analyse-/Marketing-Cookies sind derzeit nicht vorgesehen.
- Auto-Planung und Störfall-Autopilot werden als unterstützende regelbasierte Funktionen beschrieben; keine ausschließlich automatisierte Entscheidung mit Rechtswirkung nach dem aktuellen Produktstand.

## Auftragsverarbeiter / Anbieterunterlagen

### Vercel
- DPA: https://vercel.com/legal/dpa
- Subprozessoren/Trust Center: https://security.vercel.com
- Zu dokumentieren: tatsächlich gebuchter Plan, wirksame Einbeziehung des DPA/AVV, Subprozessoren und Drittlandtransferprüfung.

### Supabase
- DPA: https://supabase.com/downloads/docs/Supabase%2BDPA%2B231211.pdf
- Produktivregion: eu-central-1.
- Zu dokumentieren: wirksame Einbeziehung des DPA/AVV, aktuelle Subprozessoren, Drittlandtransferprüfung und technische Aufbewahrungs-/Backup-Konfiguration.

## Noch offen – Punkt 9 bleibt IN ARBEIT

1. Supabase Auth „Leaked Password Protection“ aktivieren. Der Security Advisor meldet die Funktion weiterhin als deaktiviert.
2. AVV/DPA-Nachweis für Vercel und Supabase verbindlich dokumentieren; tatsächlichen Vercel-Plan und die vertragliche Geltung des DPA prüfen.
3. Weitere Auftragsverarbeiter/Subprozessoren dokumentieren, insbesondere E-Mail-Provider und – soweit einschlägig – Browser-/OS-Push-Infrastruktur.
4. Lösch- und Aufbewahrungskonzept mit konkreten Fristen/Kriterien pro Datenkategorie und Mandantenprozess finalisieren.
5. TOM-Dokumentation (technische und organisatorische Maßnahmen) als Betreiberunterlage finalisieren.
6. Verzeichnis von Verarbeitungstätigkeiten (VVT) für die Verarbeitungsvorgänge, bei denen der Betreiber selbst Verantwortlicher ist, und Auftragsverarbeitungsübersicht finalisieren.
7. DSFA-Schwellenprüfung dokumentieren, insbesondere wegen systematischer Beschäftigtendatenverarbeitung, Arbeitszeiterfassung und Gesundheits-/Krankheitsdaten. Falls die Prüfung ein voraussichtlich hohes Risiko ergibt, vollständige DSFA durchführen.
8. Backup-/Restore-Konzept und regelmäßigen Wiederherstellungstest dokumentieren.
9. Logging-/Monitoring- und Incident-Response-Aufbewahrung sowie Datenschutzverletzungsprozess nach Art. 33/34 DSGVO dokumentieren.
10. Prüfen, ob Registerangaben, USt-IdNr. oder weitere Impressumspflichten für den Betreiber einschlägig sind; falls ja, Impressum ergänzen.

## Gesamtstatus

Roadmap-Punkt 9: 🟠 **In Arbeit**.

Der öffentliche rechtliche Grundauftritt und die produktbezogene Datenschutzerklärung sind umgesetzt. Für eine vollständige Compliance-Freigabe fehlen noch die oben aufgeführten organisatorischen und vertraglichen Nachweise sowie die Aktivierung der Supabase-Leaked-Password-Protection.
