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
- IONOS Deploy Now Starter ist als künftiges Primärhosting eingerichtet; Projekt-ID `7bc70ac7-ec3b-4e7b-bae5-569c957e8514` stellt den geprüften Zweig `codex/ionos-migration` unter `home-5021411544.app-ionos.space` bereit. Die produktive Domain bleibt bis zur vollständigen Abnahme unverändert.
- Der reproduzierbare statische Build umfasst aktuell 2.152.260 Byte (2,05 MiB) und liegt damit deutlich unter dem Starter-Limit von 50 MB pro statischem Projekt.
- Die beiden bislang Vercel-spezifischen Demo-Endpunkte `demo-auth` und `demo-analytics` wurden als Supabase Edge Functions bereitgestellt, mit neu erzeugten Geheimnissen aktiviert und über die IONOS-Vorschau geprüft.
- Der zuvor anonym ausführbare SECURITY-DEFINER-RPC `manager_import_month_matrix` wurde für `anon` gesperrt; die entsprechende Supabase-Security-Advisor-Warnung ist danach verschwunden.
- Die Datenschutzerklärung bildet den tatsächlichen Funktionsumfang ab: Benutzerkonten, Rollen, Mitarbeiterstammdaten, Dienstplanung, Abwesenheiten/Krankheitsdaten, Zeiterfassung, QR, Stundenkonto, Feiertage, Schichtänderungen, Tausch, Marktplatz, Auto-Planung, Störfall-Autopilot, Push, PWA/Browser-Speicher, Demo und DATEV-LODAS-Export.
- Vollständige Betreiberunterlage `documentation/avv-dpa-subprocessors-2026-09-12.md` für direkte Auftragsverarbeiter, DPA-Lage, Unterauftragsverarbeiter und Drittlandtransfers angelegt.
- TOM Version 1.0, VVT Version 1.0, Lösch-/Aufbewahrungskonzept Version 1.0 und DSFA-Schwellenprüfung Version 1.0 sind als zusammenhängende Betreiberunterlagen dokumentiert.
- Die DSFA-Schwellenprüfung ist abgeschlossen. Für den Beschäftigtendaten-Echtbetrieb ist vor dem ersten kommerziellen Echtkunden eine vollständige kundenspezifische DSFA erforderlich.
- Die 35 vom Security Advisor gemeldeten öffentlichen `SECURITY DEFINER`-RPCs wurden am 13.09.2026 gegen eine exakte Allowlist geprüft: keine anonyme Ausführung, feste Suchpfade, keine Autorisierung über Benutzer-Metadaten und kein dynamisches SQL. Die neue Drift-Abfrage wurde gegen das Live-Schema ausgeführt und lieferte null Befunde; ein Regressionstest liegt im Repository.
- Für Löschung/Offboarding liegt eine noch nicht produktiv ausgerollte private V1–V5-Grundlage mit idempotenter Warteschlange, Kunden-Fristprofil, Legal Holds, Vier-Augen-Freigabe und vollständiger Vorschau vor. `ACCESS` sperrt den Zugang sofort; `ERASURE` wird getrennt nach Frist und Legal-Hold-Prüfung ausgeführt. Auth-Referenzen werden nach `RESTRICT/NO ACTION`, `CASCADE` und `SET NULL` getrennt; fremde Mandantenzugänge bleiben erhalten. Der Wegwerf-Testbranch bestand 41/41 Lifecycle-/Offboarding-/MFA-Prüfungen. Auth-Admin-/Personalakten-Storage-Schritt, Langfristredaktion und Zeitplanung sind bewusst noch nicht produktiv aktiv.
- Die Supabase-Backupseite weist tägliche physische Sicherungen bis 13.09.2026 nach. Auf dem Wegwerf-Testbranch bestanden ein logischer Datenbank-Restore (4/4) und ein echter privater Storage-Export/Lösch-/Restorezyklus mit bytegleichem SHA-256 und 0 Restobjekten. Der Branch wurde nach der Leerstandskontrolle gelöscht; anschließend war nur noch `main` vorhanden. Ein physischer Tagesbackup-Restore bleibt wegen seines abweichenden Risiko-/Kostenprofils offen.
- TOTP-MFA und die 15-Minuten-Begrenzung reiner AAL1-Sitzungen sind in Supabase aktiv. Die IONOS-Vorschau enthält seit Commit `ff20020` Einrichtung, Faktorenverwaltung und den Login-Challenge-Schritt für App-Authenticator; Build, Deployment sowie öffentliche Auslieferung der neuen Datei wurden bestätigt. Die Datenschutzfreigabe verlangt bereits serverseitig `aal2`; zusätzlich ist eine gemeinsame, noch nicht angeschlossene Datenbankprüfung für sensible RPCs samt Stufen- und Negativtestplan vorbereitet. Der echte Konten-/Gerätetest, Recovery und die Ausweitung auf Personalakte, Benutzerverwaltung, DATEV und Sicherheitskonfiguration stehen aus. Leaked-Password-Schutz und sichere Passwortänderung sind weiterhin aus.
- Die Entscheidungsvorlage zur datenschutzbeauftragten Person empfiehlt wegen Unabhängigkeit/Interessenkonflikt eine externe Lösung. Eine Benennung, ein Vertrag und eine Behördenmeldung wurden nicht vorgenommen und benötigen Nutzerentscheidung.
- Eine vollständige kundenspezifische DSFA-Vorlage mit Datenfluss, Zweck-/Rechtsgrundlagenmatrix, Risikoregister, Maßnahmenplan, Beteiligungs- und Freigabefeldern ist vorbereitet. Sie wird erst mit Pilotkundendaten, DSB-Stellungnahme und Testnachweisen freigabefähig.

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
- Nach der offiziellen IONOS-Vertragsinformation ist der AVV für seit dem 19.07.2022 geschlossene Verträge Bestandteil der IONOS-AGB; für den im September 2026 gebuchten Deploy-Now-Vertrag ist keine gesonderte Vereinbarung erforderlich.
- Maßgeblicher AVV Version 1.3 (03/2026), Leistungsbeschreibung Version 3.0 (03/2026), TOM Version 1.0 und Unterauftragnehmerliste Version 4.5 (04/2026) sind mit Abrufstand und SHA-256-Prüfsummen dokumentiert.
- Die allgemeine Hosting-Leistungsbeschreibung nennt eine Logfile-Frist von maximal sieben Tagen. Da Deploy Now dort nicht namentlich aufgeführt ist, bleibt die produktspezifische Bestätigung dieser Frist als transparenter Prüfhinweis bestehen.

### Vercel
- Tatsächlicher Teamplan geprüft: **Hobby**.
- Vercel Terms: Hobby ist auf persönliche/nicht-kommerzielle Nutzung beschränkt.
- Aktuelles Vercel-DPA gilt laut Anbieter für **Pro und Enterprise**.
- Ergebnis: Vercel bleibt zunächst als technische Rückfallumgebung bestehen, darf mit dem aktuellen Hobby-Plan aber nicht als kommerziell genutztes Produktivhosting aktiviert werden. Eine tatsächliche Rückschaltung für Geschäftsbetrieb setzt daher vorher eine geeignete Vertrags-/Tarifgrundlage (derzeit mindestens Pro) oder eine andere freigegebene Rückfallplattform voraus.
- DPA: https://vercel.com/legal/dpa
- Unterauftragsverarbeiter: https://security.vercel.com
- DPA enthält EU-SCCs und Regelungen zur Unterauftragsverarbeitung.

### Supabase
- Organisation geprüft: `Security_Plattform`, aktueller Plan: **Pro**; Spend Cap aktiviert.
- Produktivprojekt: `SchichtFunk`, Region **eu-central-1 (Frankfurt)**.
- Aktuelles DPA geprüft: https://supabase.com/legal/customer-resources/data-processing-addendum – Version 1 vom 01.08.2026.
- Im angemeldeten Organisationsbereich `Legal Documents` bestätigt Supabase die automatische Einbeziehung des DPA in die Terms of Service für alle Organisationen; eine separate Unterschrift ist nicht erforderlich.
- SchichtFunk-Verarbeitungsangaben einschließlich Gesundheitsdaten („Krank“), Betroffenenkategorien, Rollenlage und zuständiger Aufsichtsbehörde sind in der AVV/DPA-Unterlage dokumentiert.
- Aktuelle Supabase-Unterauftragsverarbeiterliste vom 01.06.2026 und TIA vom 14.03.2025 sind dokumentiert.

### Weitere direkte Auftragsverarbeiter
- Kein eigenständiger Analyse-/Marketinganbieter festgestellt.
- Keine direkte Sentry-, Stripe-, Resend-, Mailgun-, SendGrid- oder Postmark-Anbindung im aktuellen Repository festgestellt.
- Supabase-Plattformkommunikation ist über die Supabase-Unterauftragsverarbeiterkette abzudecken.
- Browser-/OS-Push-Infrastruktur wird als technischer Intermediär/Empfänger in der Datenschutzerklärung beschrieben; derzeit kein separat von SchichtFunk beauftragter AVV-Anbieter.

### Teilstatus AVV/DPA + Auftragsverarbeiter

- Auftragsverarbeiter-/Subprozessorenübersicht: 🟢 dokumentiert und geprüft.
- IONOS-AVV: 🟢 AGB-Einbeziehung und aktuelle AVV-Anlagen mit Versions-/Prüfsummennachweis dokumentiert.
- Vercel-DPA: 🟡 für die inaktive Rückfallumgebung dokumentiert; kommerzielle Aktivierung mit Hobby ausgeschlossen.
- Supabase-DPA: 🟢 automatische Einbeziehung im angemeldeten Pro-Organisationsbereich bestätigt; DPA, SCC, TIA und Unterauftragsverarbeiter dokumentiert.
- Nachweisregister: `documentation/avv-dpa-evidence-register-2026-09-12.md`.

## Noch offen – Punkt 9 bleibt IN ARBEIT

1. Supabase Auth „Leaked Password Protection“ aktivieren. Der Security Advisor meldet die Funktion weiterhin als deaktiviert.
2. Für einen möglichen produktiven Vercel-Rollback vor Aktivierung eine kommerziell zulässige Tarif-/DPA-Grundlage herstellen; kein Upgrade ohne ausdrückliche Freigabe.
3. Lösch- und Aufbewahrungskonzept technisch fertigstellen: Die V1–V5-Grundlage und erste Datenbankausführung sind auf dem Wegwerf-Testbranch geprüft. Offen bleiben Audit-/Monatssnapshot-Redaktion, Auth-Admin-/Personalakten-Storage-Koordination, Zeitplanung und kundenspezifische Langfristfristen; keine Produktivaktivierung ohne gesonderte Freigabe.
4. TOM-Härtung abschließen: Allowlist-Negativtests auf der Wegwerf-Testumgebung ausführen, vorbereiteten MFA-Appfluss mit zwei sicheren Konten abnehmen, `aal2` auf weitere sensible Servergrenzen ausweiten sowie Leaked-Password-Schutz nach Regressionstest aktivieren.
5. Für die Datenschutzbeauftragten-Rolle wurde Option B (interne Person) ausgewählt. Vor dem ersten kommerziellen Echtkunden konkrete Person, Fachkunde, Ressourcen und Interessenkonflikt prüfen; erst nach ausdrücklicher Freigabe benennen, Kontaktdaten veröffentlichen/der Aufsicht mitteilen sowie VVT-Kundenblatt und vollständige kundenspezifische DSFA ergänzen/freigeben. Datenschutzbeauftragte Person und gegebenenfalls Betriebsrat des Kunden einbeziehen.
6. Der logische DB- und private Storage-Restore auf der bestätigten Wegwerf-Testumgebung ist dokumentiert bestanden. Noch offen: physischer Tagesbackup-Restore und dauerhaft betriebener separater Personalakten-Storage-Export.
7. Logging-/Monitoring- und Incident-Response-Aufbewahrung sowie Datenschutzverletzungsprozess nach Art. 33/34 DSGVO dokumentieren und testen.
8. IONOS-Deploy-Now-spezifische Logfrist bestätigen.
9. Prüfen, ob Registerangaben, USt-IdNr. oder weitere Impressumspflichten für den Betreiber einschlägig sind; falls ja, Impressum ergänzen.

## Gesamtstatus

Roadmap-Punkt 9: 🟠 **In Arbeit**.

Der öffentliche rechtliche Grundauftritt, die produktbezogene Datenschutzerklärung, AVV/DPA, VVT, TOM, Löschkonzept und DSFA-Schwellenprüfung sind dokumentiert. Punkt 9 bleibt wegen der technischen Löschumsetzung, Sicherheits-Härtung, vollständigen kundenspezifischen DSFA, Restore-/Incident-Nachweisen und Betreiberangaben in Arbeit. Vercel Pro ist für das geplante IONOS-Primärhosting nicht erforderlich, wohl aber vor einer kommerziellen Aktivierung des Vercel-Rollbacks.
