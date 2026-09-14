# SchichtFunk – Roadmap-Punkt 9
## Recht, Datenschutz, Hosting & Veröffentlichung

Stand: 14.09.2026

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
- **Supabase Pro: ✅ erledigt.** Der Pro-Tarif ist für die Organisation `Security_Plattform` aktiv, der Spend Cap ist eingeschaltet und das Produktivprojekt `SchichtFunk` ist `ACTIVE_HEALTHY` in Region `eu-central-1` (Frankfurt).
- IONOS Deploy Now Starter ist als Primärhosting eingerichtet; Projekt-ID `7bc70ac7-ec3b-4e7b-bae5-569c957e8514` stellt den geprüften Zweig `codex/ionos-migration` unter `home-5021411544.app-ionos.space` bereit. Alexander Kirchner hat das Deployment am 13.09.2026 vollständig für den Produktivbetrieb abgenommen. Die produktive Domain bleibt bis zu einer separaten ausdrücklichen DNS-/Domain-Umschaltanweisung unverändert.
- Der reproduzierbare statische Build umfasst aktuell 2.153.075 Byte (2,05 MiB) und liegt damit deutlich unter dem Starter-Limit von 50 MB pro statischem Projekt.
- Die beiden bislang Vercel-spezifischen Demo-Endpunkte `demo-auth` und `demo-analytics` wurden als Supabase Edge Functions bereitgestellt, mit neu erzeugten Geheimnissen aktiviert und über die IONOS-Vorschau geprüft.
- Der zuvor anonym ausführbare SECURITY-DEFINER-RPC `manager_import_month_matrix` wurde für `anon` gesperrt; die entsprechende Supabase-Security-Advisor-Warnung ist danach verschwunden.
- Die Datenschutzerklärung bildet den tatsächlichen Funktionsumfang ab: Benutzerkonten, Rollen, Mitarbeiterstammdaten, Dienstplanung, Abwesenheiten/Krankheitsdaten, Zeiterfassung, QR, Stundenkonto, Feiertage, Schichtänderungen, Tausch, Marktplatz, Auto-Planung, Störfall-Autopilot, Push, PWA/Browser-Speicher, Demo und DATEV-LODAS-Export.
- Vollständige Betreiberunterlage `documentation/avv-dpa-subprocessors-2026-09-12.md` für direkte Auftragsverarbeiter, DPA-Lage, Unterauftragsverarbeiter und Drittlandtransfers angelegt.
- TOM Version 1.0, VVT Version 1.0, Lösch-/Aufbewahrungskonzept Version 1.0 und DSFA-Schwellenprüfung Version 1.0 sind als zusammenhängende Betreiberunterlagen dokumentiert.
- Die DSFA-Schwellenprüfung ist abgeschlossen. Für den Beschäftigtendaten-Echtbetrieb ist vor dem ersten kommerziellen Echtkunden eine vollständige kundenspezifische DSFA erforderlich.
- Die 35 vom Security Advisor gemeldeten öffentlichen `SECURITY DEFINER`-RPCs wurden am 13.09.2026 gegen eine exakte Allowlist geprüft: keine anonyme Ausführung, feste Suchpfade, keine Autorisierung über Benutzer-Metadaten und kein dynamisches SQL. Die Drift-Abfrage gegen das Live-Schema lieferte null Befunde. Anschließend bestanden 35/35 fachliche Fremdmandanten-Negativtests auf dem datenlosen Wegwerf-Branch `rpc-cross-tenant-test-2026-09-13`; Rollback, 0 Restobjekte und Branch-Löschung wurden bestätigt. Produktion blieb unverändert.
- Für Löschung/Offboarding sind V1–V9 mit idempotenter Warteschlange, Kunden-Fristprofil, Legal Holds, Zwei-Personen-Freigabe, vollständiger Vorschau, Auth-/Storage-Worker und 15-Minuten-Zeitplan produktiv aktiv. Für den Betrieb mit genau einem echten OWNER gilt `SOLE_OWNER_DELAYED`: zwei AAL2-Bestätigungen aus unterschiedlichen Sitzungen, 24 Stunden Abkühlfrist, 7 Tage Bestätigungsfenster, unveränderte Vorschau und harte Sperren gegen die Löschung des einzigen OWNER oder des Mandanten. Dies ist keine Vier-Augen-Kontrolle. Auf dem datenlosen Wegwerf-Testbranch bestanden 22/22 neue und 41/41 bestehende Datenbankprüfungen; der Produktiv-Schedulerlauf endete mit HTTP 200, 0 Aufträgen und 0 Datenänderungen. `ACCESS` sperrt den Zugang nach gültiger Bestätigung; `ERASURE` wird getrennt nach Frist und Legal-Hold-Prüfung ausgeführt. Auth- und Personalakten-Storage-Löschung bleiben standardmäßig aus und verlangen ausdrücklich bestätigte Profilregeln. Langfristredaktion und konkrete Kunden-Fristprofile bleiben offen.
- Die Supabase-Backupseite weist tägliche physische Sicherungen bis 13.09.2026 nach. Auf dem Wegwerf-Testbranch bestanden ein logischer Datenbank-Restore (4/4) und ein echter privater Storage-Export/Lösch-/Restorezyklus mit bytegleichem SHA-256 und 0 Restobjekten. Der Branch wurde nach der Leerstandskontrolle gelöscht; anschließend war nur noch `main` vorhanden. Ein physischer Tagesbackup-Restore bleibt wegen seines abweichenden Risiko-/Kostenprofils offen.
- TOTP-MFA und die 15-Minuten-Begrenzung reiner AAL1-Sitzungen sind in Supabase aktiv. Die IONOS-Vorschau enthält seit Commit `ff20020` Einrichtung, Faktorenverwaltung und den Login-Challenge-Schritt für App-Authenticator; Build, Deployment sowie öffentliche Auslieferung der neuen Datei wurden bestätigt. Auf einem datenlosen Wegwerf-Branch bestanden ein OWNER- und ein Mitarbeiter-Testkonto 12/12 Hosted-Auth-Gruppenprüfungen zu TOTP, Falschcode, Ersatzfaktor, Faktorverlust sowie `others`-/`global`-Sitzungswiderruf; danach bestanden 0 aktive Refresh-Tokens und der Branch wurde gelöscht. Die Datenschutzfreigabe verlangt bereits serverseitig `aal2`. Für 27 weitere sensible RPCs sind eine stufenweise Steuerung, eine zentrale Data-API-Grenze und die verpflichtende App-Einrichtung für `OWNER`/`ADMIN` umgesetzt. Die vier Stufen bestanden auf einem datenlosen Wegwerf-Branch 59/59 Assertions sowie einen echten Data-API-Negativtest; anschließend wurden 0 Benutzer, 0 Unternehmen und 0 aktive Schalter bestätigt und der Branch gelöscht. Die präzisierte Produktivprüfung vom 14.09.2026 ergab genau einen echten OWNER für `SchichtFunk`; nach der persönlichen Einrichtung wurde für ihn um 05:23:54 UTC ein verifizierter TOTP-Faktor rein lesend bestätigt. Nach ausdrücklicher Freigabe wurde Stufe 2 für vier RPCs der Benutzer- und Rechteverwaltung produktiv aktiviert und ohne Geschäftsdatenänderung erfolgreich kontrolliert; Stufen 3 bis 5 bleiben aus. Der zweite zuvor technisch mitgezählte OWNER gehört zu einem getrennten, ausdrücklich fiktiven Abnahmemandanten und ist keine Produktivvoraussetzung. Leaked Password Protection wurde am 13.09.2026 produktiv aktiviert und durch das Verschwinden der Advisor-Warnung verifiziert; sichere Passwortänderung und Pflicht zur Eingabe des aktuellen Passworts bleiben separat aus.
- Für die datenschutzbeauftragte Person wurde Option B (geeignete interne Person) als Richtung gewählt. Die Auswahl und Benennung der konkreten Person wurde am 13.09.2026 auf Nutzerwunsch vorerst zurückgestellt. Es erfolgten weder Benennung noch Vertrag, Veröffentlichung oder Behördenmeldung.
- Eine vollständige kundenspezifische DSFA-Vorlage mit Datenfluss, Zweck-/Rechtsgrundlagenmatrix, Risikoregister, Maßnahmenplan, Beteiligungs- und Freigabefeldern ist vorbereitet. Sie wird erst mit Pilotkundendaten, DSB-Stellungnahme und Testnachweisen freigabefähig.
- Eine editierbare SchichtFunk-Kunden-AVV-Vorlage nach Art. 28 DSGVO ist erstellt. Sie enthält die Verarbeitung, TOM, Unterauftragsverarbeiter, kundenbezogene Löschfristen sowie Weisungs- und Kontaktrollen als Anlagen. Vor dem Einsatz sind die gelb markierten Kundendaten, Fristen, die aktuelle TOM-/Unterauftragnehmerlage und der konkrete Vertrag rechtlich zu prüfen; ein kundenspezifisch abgeschlossener AVV liegt damit noch nicht vor.
- Ein versioniertes Sicherheits- und Betriebsnachweisregister verknüpft die TOM mit reproduzierbaren Tests, Anbieter-/Restorebelegen und einem öffentlichen IONOS-Livecheck. 32/32 Testdateien, IONOS-Migrationssuite, 2,06-MiB-Build und Abhängigkeitsprüfung bestanden; sechs öffentliche IONOS-Routen lieferten die erwarteten Sicherheits- und Cache-Header.
- Der Incident-Response- und Datenschutzverletzungsprozess einschließlich Schweregraden, unverzüglicher Kundeninformation, 72-Stunden-Entscheidungsweg, Wiederanlauf, fiktivem Papier-Planspiel und technischem Zwei-Konten-Sitzungswiderruf ist dokumentiert. Die Prüfungen änderten keine Produktionsdaten; Vertretung, überwachte Alarmierung und ein Schlüsselrotationsdrill bleiben offen.
- Eine Logging-/Monitoring- und Aufbewahrungsmatrix trennt vorhandene Anwendungsaudits, Supabase-/IONOS-/GitHub-Nachweise, verbindliche Prüfauslöser und geplante Alarme von noch nicht bestätigten Anbieterfristen und kundenbezogenen Löschfristen.

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
- Finale Nachprüfung vom 13.09.2026: 🟢 offizielle IONOS-/Supabase-Nachweise erneut erreichbar und versioniert geprüft; unveränderliche PDF-Nachweise sowie Supabase-DPA bytegleich, aktueller Supabase-Pro-/Frankfurt-Projektstatus bestätigt. Vercel Hobby bleibt von einer kommerziellen Rückfallschaltung ausgeschlossen.

## Noch offen – Punkt 9 bleibt IN ARBEIT

### Bewusst zurückgestellt

- **Konkrete interne DSB-Person benennen:** derzeit pausiert. Der Punkt wird vor dem ersten kommerziellen Beschäftigtendaten-Echtbetrieb wieder aufgenommen; bis dahin bleibt die kundenspezifische DSFA in diesem Teil vorläufig.

### Nächste Arbeiten

1. Für einen möglichen produktiven Vercel-Rollback vor Aktivierung eine kommerziell zulässige Tarif-/DPA-Grundlage herstellen; kein Upgrade ohne ausdrückliche Freigabe.
2. Lösch- und Aufbewahrungskonzept technisch fertigstellen: V1–V9, Ein-OWNER-Regel, Auth-/Storage-Worker und 15-Minuten-Zeitplan sind produktiv aktiviert und im Leerlauf abgenommen. Offen bleiben Audit-/Monatssnapshot-Langfristredaktion und die kundenspezifische Freigabe konkreter Fristprofile; Auth- und Storage-Löschung bleiben bis dahin standardmäßig ausgeschaltet.
3. TOM-Härtung fortsetzen: Der technische Zwei-Konten-MFA-/Recovery-/Sitzungswiderruf-Test, die persönliche MFA-Einrichtung des einzigen echten OWNER, 59/59 Branch-Assertions und die produktive Aktivierung von Stufe 2 sind abgeschlossen. Pflicht-UI und AAL2-Steuerung für 27 sensible RPCs sind umgesetzt. Offen bleibt die einzeln freizugebende Produktivaktivierung der Stufen 3 bis 5. Die 35/35 fachlichen Fremdmandanten-Negativtests sind abgeschlossen.
4. Kundenspezifische DSFA bis auf den pausierten DSB-Personenschritt vorbereiten: Pilotkundendaten, konkrete Verarbeitung, Rechtsgrundlagen, Betriebsrat/Personalvertretung, Kundenfristen, Risiken und Maßnahmen ergänzen. Die formelle DSFA-Freigabe erfolgt erst nach Wiederaufnahme der DSB-Prüfung.
5. Der logische DB- und private Storage-Restore auf der bestätigten Wegwerf-Testumgebung ist dokumentiert bestanden. Noch offen: physischer Tagesbackup-Restore und dauerhaft betriebener separater Personalakten-Storage-Export.
6. Das dokumentierte Incident-Response-Verfahren betrieblich vervollständigen: Vertretung, überwachte Alarmierung, Bereitschaftszeiten und Logzugriffs-/Aufbewahrungsmatrix festlegen sowie einen Schlüsselrotationsdrill durchführen. Der Sitzungswiderruf-Drill ist abgeschlossen.
7. IONOS-Deploy-Now-spezifische Logfrist bestätigen.
8. Prüfen, ob Registerangaben, USt-IdNr. oder weitere Impressumspflichten für den Betreiber einschlägig sind; falls ja, Impressum ergänzen.
9. Die vorhandene Kunden-AVV-Vorlage für den ersten Echtkunden vervollständigen, rechtlich prüfen lassen und beiderseitig abschließen.

## Gesamtstatus

Roadmap-Punkt 9: 🟠 **In Arbeit**.

Der öffentliche rechtliche Grundauftritt, die produktbezogene Datenschutzerklärung, Anbieter-AVV/DPA, Kunden-AVV-Vorlage, VVT, TOM, Löschkonzept und DSFA-Schwellenprüfung sind dokumentiert. Punkt 9 bleibt wegen des kundenspezifischen Vertragsabschlusses, der technischen Löschumsetzung, Sicherheits-Härtung, vollständigen kundenspezifischen DSFA, Restore-/Incident-Nachweisen und Betreiberangaben in Arbeit. Vercel Pro ist für das geplante IONOS-Primärhosting nicht erforderlich, wohl aber vor einer kommerziellen Aktivierung des Vercel-Rollbacks.
