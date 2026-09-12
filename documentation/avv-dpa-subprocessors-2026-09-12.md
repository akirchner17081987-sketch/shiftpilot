# SchichtFunk – AVV/DPA- und Auftragsverarbeiterprüfung

Stand: 12.09.2026

## Zweck

Diese Betreiberunterlage dokumentiert die bei SchichtFunk aktuell eingesetzten wesentlichen Auftragsverarbeiter, die vertragliche AVV/DPA-Lage, Unterauftragsverarbeiter und Drittlandtransfer-Mechanismen. Sie ist Teil von Roadmap-Punkt 9 „Recht, Datenschutz, Hosting & Veröffentlichung“.

## Betreiber / Kunde der Infrastruktur-Anbieter

- Alexander Kirchner / SchichtFunk
- Neue Straße 23
- 06632 Gröst
- Deutschland
- Kontakt: info@schichtfunk.de

Für Beschäftigtendaten ist regelmäßig das jeweilige Kundenunternehmen bzw. der jeweilige Arbeitgeber Verantwortlicher; SchichtFunk ist insoweit Auftragsverarbeiter. Gegenüber den Infrastruktur-Anbietern ist SchichtFunk je nach Verarbeitung Controller/Business oder Processor/Service Provider für den jeweiligen Kunden.

## 1. IONOS SE – primäres statisches Webhosting / Deploy Now

### Tatsächlich festgestellter Kontostand

- IONOS Deploy Now Starter Membership wurde im September 2026 gebucht.
- GitHub-Konto und Repository `akirchner17081987-sketch/shiftpilot` sind verbunden.
- Vorgesehener Build: Plain Node.js 22, `npm ci`, `npm run build`, Veröffentlichungsverzeichnis `dist`.
- Der geprüfte statische Build ist 2,04 MiB groß und liegt unter dem Tariflimit von 50 MB.
- Die produktive Domain ist noch nicht auf Deploy Now umgestellt; zuerst erfolgt die Abnahme über die IONOS-Bereitstellungsadresse.

### AVV-/Vertragslage

- Offizielle IONOS-Information: https://www.ionos.de/hilfe/datenschutz/allgemeine-informationen-zur-datenschutzgrundverordnung-dsgvo/vereinbarung-zur-auftragsverarbeitung-avv-mit-ionos-abschliessen/
- IONOS bestätigt dort, dass der AVV seit dem 19.07.2022 Bestandteil der AGB ist und für danach geschlossene Verträge keine gesonderte Vereinbarung erforderlich ist. Der Deploy-Now-Vertrag wurde im September 2026 geschlossen.
- Maßgeblicher AVV: https://www.ionos.de/terms-gtc/avv/ – Version 1.3, Stand 03/2026. Ziffer 1.1 erfasst alle zur Vertragserfüllung ausgeführten Auftragsverarbeitungen, auch wenn der Einzelauftrag nicht ausdrücklich auf den AVV verweist; Ziffer 12.3 bezieht den AVV als Teil der Produkt-AGB ein.
- Archivierte Anlagen/Nachweise: Leistungsbeschreibungen Version 3.0 (03/2026), technische und organisatorische Maßnahmen Version 1.0 sowie genehmigte Subunternehmen Version 4.5 (04/2026). Abrufdaten, URLs, Dateigrößen und SHA-256-Prüfsummen stehen im Nachweisregister `documentation/avv-dpa-evidence-register-2026-09-12.md`.
- Die allgemeine Leistungsbeschreibung für Hosting nennt Inhaltsdaten der Website, Domain und Logfiles sowie eine maximale Logfile-Speicherung von sieben Tagen. Deploy Now wird in der Anlage nicht namentlich aufgeführt; deshalb wird diese Frist nicht ohne zusätzliche Produktbestätigung als verbindliche Deploy-Now-Spezialfrist ausgegeben.
- Die aktuelle Unterauftragnehmeranlage nennt Cloudflare für Hosting-Produkte (CDN, Standardvertragsklauseln). Weitere dort aufgeführte Dienstleister sind nur bei Nutzung der jeweils genannten Produkte relevant.

### Datenkategorien und Zweck

IONOS liefert ausschließlich die statischen SchichtFunk-Dateien/PWA aus. Dabei können insbesondere IP-Adresse, Zeitstempel, angeforderte Ressource, Browser-/Geräteinformationen sowie technische Sicherheits- und Fehlerdaten verarbeitet werden. Produktive Beschäftigten-, Dienstplan-, Arbeitszeit- und Abwesenheitsdaten liegen weiterhin bei Supabase und werden nicht in den statischen IONOS-Build aufgenommen.

### Status IONOS

🟢 **AVV UND ANLAGEN DOKUMENTIERT – automatische AGB-Einbeziehung für den 2026 geschlossenen Vertrag nachgewiesen. Die produktspezifische Deploy-Now-Zuordnung der allgemeinen Logfrist bleibt als Prüfhinweis dokumentiert.**

---

## 2. Vercel Inc. – vorübergehendes Webhosting / Rückfallumgebung

### Tatsächlich festgestellter Kontostand

- Vercel-Team: `Security_01`
- Team-ID: `team_XWlPcYecL2p340EVeWlbYXfX`
- Aktueller Plan: **Hobby**
- SchichtFunk-Projekt: `shiftpilot`
- Projekt-ID: `prj_DoqwIfAjhATUYUByVGGmqJoFrnwh`

### AVV/DPA-Lage

- Maßgebliches DPA: https://vercel.com/legal/dpa
- Stand des DPA: 17.03.2026 / wirksam ab 31.03.2026.
- Das veröffentlichte Vercel-DPA gilt laut Anbieter für **Pro- und Enterprise-Pläne**.
- Die Vercel Terms of Service beschränken den Hobby-Plan auf **persönliche bzw. nicht-kommerzielle Nutzung**.
- SchichtFunk ist als geschäftliche SaaS-Anwendung vorgesehen. Der aktuelle Hobby-Plan ist daher für den vorgesehenen Produktivbetrieb **nicht als endgültige Vertragsgrundlage geeignet**.

### Erforderliche Maßnahme bei Aktivierung des Rückfalls

Vercel bleibt während der kontrollierten Migration zunächst technisch erreichbar, soll nach Freigabe von IONOS aber nur noch als Rückfalloption dienen. **Vor einer erneuten kommerziellen Produktivschaltung über Vercel muss das Team mindestens auf Pro oder eine sonstige geeignete kommerzielle Vertragsgrundlage umgestellt werden.** Bis dahin ist Vercel nicht als freigegebener produktiver Rückfallweg zu aktivieren. Ein kostenpflichtiges Upgrade erfolgt nur nach ausdrücklicher Bestätigung des Betreibers.

### Unterauftragsverarbeiter / Drittlandtransfer

- Aktuelle offizielle Liste: https://security.vercel.com
- Das Vercel-DPA erteilt eine allgemeine Genehmigung für Unterauftragsverarbeiter und verpflichtet Vercel zu vergleichbaren Datenschutzpflichten gegenüber diesen.
- Für EWR-Drittlandtransfers enthält das DPA die EU-Standardvertragsklauseln (SCC), einschließlich Modul 2 Controller→Processor und Modul 3 Processor→Processor je nach Rollenlage.
- Vercel verlangt für Benachrichtigungen über neue Unterauftragsverarbeiter eine Anmeldung über `privacy@vercel.com` bzw. den jeweils mitgeteilten Mechanismus. Die Einwendungsfrist beträgt laut DPA fünf Kalendertage.
- Die Unterauftragsverarbeiterliste ist dynamisch und wird deshalb nicht als statische abschließende Kopie in SchichtFunk geführt; maßgeblich ist jeweils der Anbieterstand im Vercel Trust Center. Änderungen sind im jährlichen bzw. anlassbezogenen Auftragsverarbeiter-Review nachzuziehen.

### Status Vercel

🟡 **ALS INAKTIVE RÜCKFALLUMGEBUNG DOKUMENTIERT – kommerzielle Aktivierung mit Hobby nicht freigegeben.**

---

## 3. Supabase Pte. Ltd – Backend, Datenbank, Auth, Realtime und Edge Functions

### Tatsächlich festgestellter Kontostand

- Organisation: `Security_Plattform`
- Organisations-ID: `iovtxoshcpbqkxieiovd`
- Aktueller Plan: **Pro**, seit 12.09.2026; Spend Cap aktiviert
- Produktivprojekt: `SchichtFunk`
- Projekt-Ref: `zbvloohfjleadjnqhbbh`
- Projektstatus: `ACTIVE_HEALTHY`
- Region: **eu-central-1 (Frankfurt)**

Die gewählte spezifische Region bestimmt laut Supabase die Region der primären Projektdaten. `eu-central-1` entspricht Central EU / Frankfurt.

Die vormals bei Vercel ausgeführten Demo-Endpunkte `demo-auth` und `demo-analytics` sind als Supabase Edge Functions bereitgestellt, mit neu erzeugten Geheimnissen aktiviert und über die IONOS-Vorschau geprüft. Es werden keine Standardzugangsdaten verwendet.

### AVV/DPA-Lage

- Aktuelles DPA: https://supabase.com/legal/customer-resources/data-processing-addendum – Version 1, 01.08.2026.
- Das DPA ergänzt die Supabase Terms of Service, ist ab Wirksamwerden des Hauptvertrags gültig und umfasst je nach Rollenlage Controller→Processor bzw. Processor→Subprocessor. Die Annahme des Hauptvertrags hat nach DPA Ziffer 12.2 dieselbe Wirkung wie die Unterzeichnung der EU-Standardvertragsklauseln.
- Im angemeldeten Bereich `Organization Settings > Legal Documents` wurde am 12.09.2026 für die Pro-Organisation bestätigt, dass das DPA automatisch in die Terms of Service einbezogen ist, alle Organisationen dadurch geschützt sind und kein separat unterschriebener DPA erforderlich ist.
- DPA, aktuelle Unterauftragsverarbeiterliste und Transfer Impact Assessment sind mit Abrufstand und SHA-256-Prüfsummen im Nachweisregister dokumentiert.

### Für SchichtFunk einzutragende DPA-Verarbeitungsangaben

- Customer: Alexander Kirchner / SchichtFunk
- Address: Neue Straße 23, 06632 Gröst, Deutschland
- Contact: info@schichtfunk.de
- Customer role: Controller/business bzw. Processor/service provider für den Controller des jeweiligen Kunden, soweit einschlägig
- Betroffene Personen: Mitarbeiter/Beschäftigte der Kundenunternehmen, Manager/Administratoren/Inhaber, Kundenkontaktpersonen und berechtigte Benutzer
- Datenkategorien: Konto- und Kontaktdaten, Rollen/Berechtigungen, Mitarbeiterstammdaten, Dienstplan-/Schichtdaten, Verfügbarkeiten, Arbeitszeiten/Pausen/Stundenkonto, Abwesenheiten, Benachrichtigungen/Push-Endpunkte, Audit- und Sicherheitsdaten
- Besondere Kategorien: **gesundheitsbezogene Information „Krank“ / Krankheitsabwesenheit**; keine Diagnoseangaben als regulär vorgesehener Dateninhalt
- Frequenz: fortlaufend während der Nutzung
- Zweck: Bereitstellung der SchichtFunk-SaaS-Funktionen
- Zuständige Aufsichtsbehörde für eigene Betreiberverarbeitung: Landesbeauftragte für den Datenschutz Sachsen-Anhalt

### Supabase-Unterauftragsverarbeiter – offizielle Liste, Stand 01.06.2026

Die aktuelle DPA-Anlage nennt insbesondere:

1. Supabase, Inc. – Support
2. Active Campaign, LLC d/b/a Postmark – Kommunikation/Support
3. Amazon Web Services, Inc – Hosting
4. Atlassian Corporation Plc – Statusseite
5. Braintrust Data, Inc – Monitoring/Tracing
6. Clay Labs Inc. – Customer Insights
7. Clazar, Inc – Marketplace-Dienste
8. Cloudflare, Inc – Hosting/Netzwerkdienste
9. ConfigCat Kft. – Feature Flags
10. Google, LLC – Hosting
11. Fly.io, Inc – Hosting
12. FrontApp, Inc – Kommunikation/Support
13. Functional Software, Inc d/b/a Sentry – Fehlerüberwachung/Tracing
14. GitHub, Inc – Authentifizierung berechtigter Supabase-Nutzer
15. Hex Technologies, Inc – Datenanalyse
16. HubSpot, Inc – Kommunikation/Support
17. Notion Labs, Inc – Kommunikation/Support
18. Sublime Security Inc – E-Mail-Sicherheit
19. Latacora, LLC – Managed Security Service Provider
20. OpenAI, LLC – Natural-Language-Processing/Generation im Rahmen von Supabase-Diensten
21. PandaDoc, Inc – Kommunikation/Support
22. Slack Technologies, LLC – Kommunikation/Support
23. Upstash, Inc – serverloses Datenhosting
24. Vercel, Inc – Hosting

Diese Liste beschreibt die von Supabase allgemein autorisierten Unterauftragsverarbeiter. Nicht jeder Anbieter muss in jedem SchichtFunk-Datenfluss tatsächlich auf Kundendaten zugreifen. Maßgeblich bleiben die aktuelle DPA-Anlage sowie die tatsächlich aktivierten Supabase-Funktionen.

### Drittlandtransfers

Supabase sieht für internationale Übermittlungen vertragliche Transfermechanismen einschließlich EU-Standardvertragsklauseln vor. Das primäre SchichtFunk-Projekt ist in Frankfurt (`eu-central-1`) angesiedelt; Support-, Sicherheits- oder Unterauftragsverarbeitung kann dennoch außerhalb des EWR stattfinden und ist deshalb im DPA-/Subprocessor-Review mitzuführen.

### Status Supabase

🟢 **DPA, SCC-EINBEZIEHUNG, TIA UND UNTERAUFTRAGSVERARBEITER DOKUMENTIERT – keine separate Unterschrift erforderlich.**

---

## 4. Weitere direkte Auftragsverarbeiter von SchichtFunk

Im aktuell geprüften SchichtFunk-Repository wurden **keine eigenständig angebundenen Analyse-/Marketingdienste, Sentry-Integration, Stripe-Zahlungsabwicklung, Resend/Mailgun/SendGrid/Postmark-Direktanbindung oder vergleichbare zusätzliche SaaS-Auftragsverarbeiter** festgestellt.

Authentifizierungs-E-Mails und vergleichbare Supabase-Plattformkommunikation sind – soweit sie über Supabase erfolgen – über dessen Unterauftragsverarbeiterkette (u. a. Postmark) abzudecken.

Web-Push wird über standardisierte Browser-/Betriebssystem-Push-Infrastruktur an den vom Gerät bereitgestellten Push-Endpunkt zugestellt. Diese Infrastruktur wird in der Datenschutzerklärung als möglicher technischer Empfänger/Intermediär beschrieben; sie ist derzeit **kein separat von SchichtFunk beauftragter SaaS-Auftragsverarbeiter mit eigenem SchichtFunk-AVV**.

GitHub wird für Quellcode, Build-Automatisierung und Deployment verwendet. Produktive Beschäftigten- oder Arbeitszeitdaten werden nach dem geprüften Architekturstand nicht als Anwendungsdaten in GitHub gespeichert; GitHub wird deshalb nicht als direkter Auftragsverarbeiter für SchichtFunk-Kundendaten in dieser Liste geführt.

## 5. Ergebnis / Freigabestatus dieses Teilpunkts

### Auftragsverarbeiter- und Unterauftragsverarbeiterübersicht

🟢 **DOKUMENTIERT UND GEPRÜFT.**

### AVV/DPA-Vertragsnachweise

🟢 **FÜR DIE VORGESEHENE PRODUKTIONSARCHITEKTUR IONOS + SUPABASE DOKUMENTIERT.**

- IONOS: AVV-Einbeziehung über die AGB des 2026 geschlossenen Vertrags sowie aktuelle AVV-Anlagen nachgewiesen.
- Supabase: automatische DPA-Einbeziehung im angemeldeten Organisationsbereich bestätigt; aktuelle DPA-/SCC-, TIA- und Subprocessor-Nachweise dokumentiert.
- Vercel bleibt eine technisch erreichbare, aber nicht für kommerziellen Betrieb freigegebene Rückfallumgebung. Vor einer tatsächlichen kommerziellen Rückschaltung ist weiterhin eine Pro- oder sonstige geeignete Vertrags-/DPA-Grundlage erforderlich; ein Upgrade erfolgt nur nach ausdrücklicher Betreiberfreigabe.

## Prüfintervall

- mindestens jährlich,
- zusätzlich bei neuem Infrastruktur-/E-Mail-/Analyse-/Push-/Zahlungsanbieter,
- bei Änderung der DPA/AVV-Fassung,
- bei Änderung der Unterauftragsverarbeiterlisten,
- bei Wechsel von Hostingregionen oder wesentlichen Datenflüssen.
