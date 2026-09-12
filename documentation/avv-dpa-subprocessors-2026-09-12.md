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

- Offizielle IONOS-Information zum AVV: https://www.ionos.de/hilfe/mein-konto/vertraege/auftragsverarbeitung-avv/
- Nach dieser Anbieterinformation ist der AVV bei ab dem 19.07.2022 abgeschlossenen Verträgen Bestandteil der IONOS-AGB. Der aktuelle Deploy-Now-Vertrag wurde danach geschlossen.
- Für den belastbaren Betreiber-Nachweis sind Buchungsbestätigung, die zum Vertrag gehörenden AGB-/AVV-Dokumente und deren Versionsstand zu archivieren.
- Vor Produktivfreigabe sind zusätzlich die konkret für Deploy Now geltenden Angaben zu Serverprotokollen, Löschfristen, Hostingstandorten und Unterauftragsverarbeitern anhand der Vertrags-/Produktunterlagen festzuhalten. Allgemeine Angaben zu anderen IONOS-Hostingprodukten werden nicht ungeprüft auf Deploy Now übertragen.

### Datenkategorien und Zweck

IONOS liefert ausschließlich die statischen SchichtFunk-Dateien/PWA aus. Dabei können insbesondere IP-Adresse, Zeitstempel, angeforderte Ressource, Browser-/Geräteinformationen sowie technische Sicherheits- und Fehlerdaten verarbeitet werden. Produktive Beschäftigten-, Dienstplan-, Arbeitszeit- und Abwesenheitsdaten liegen weiterhin bei Supabase und werden nicht in den statischen IONOS-Build aufgenommen.

### Status IONOS

🟡 **TECHNISCH VORBEREITET – Vertragsnachweise und produktspezifische Detailprüfung noch zu archivieren.**

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

## 3. Supabase Inc. – Backend, Datenbank, Auth, Realtime und Edge Functions

### Tatsächlich festgestellter Kontostand

- Organisation: `Security_Plattform`
- Organisations-ID: `iovtxoshcpbqkxieiovd`
- Aktueller Plan: **Free**
- Produktivprojekt: `SchichtFunk`
- Projekt-Ref: `zbvloohfjleadjnqhbbh`
- Projektstatus: `ACTIVE_HEALTHY`
- Region: **eu-central-1 (Frankfurt)**

Die gewählte spezifische Region bestimmt laut Supabase die Region der primären Projektdaten. `eu-central-1` entspricht Central EU / Frankfurt.

Die vormals bei Vercel ausgeführten Demo-Endpunkte `demo-auth` und `demo-analytics` sind nun als Supabase Edge Functions bereitgestellt. Ihre produktive Aktivierung setzt die sichere Übernahme bzw. Rotation der Demo-Geheimnisse voraus; es werden keine Standardzugangsdaten verwendet.

### AVV/DPA-Lage

- Aktuelles DPA: https://supabase.com/downloads/docs/Supabase%2BDPA%2B260317.pdf
- Supabase stellt ein DPA für Kunden bereit, die es für Datenschutzanforderungen benötigen; eine Beschränkung des DPA ausschließlich auf einen kostenpflichtigen Tarif ist in den geprüften Anbieterunterlagen nicht ausgewiesen.
- Das DPA sieht eine Kundenunterschrift bzw. sonstige wirksame Zustimmung vor. Für einen belastbaren Nachweis wird die **unterzeichnete Fassung** als Betreiberunterlage empfohlen.

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

### Supabase-Unterauftragsverarbeiter – DPA Schedule 3, geprüfter Anbieterstand 2026

Die aktuelle DPA-Anlage nennt insbesondere:

1. Supabase Pte. Ltd – Support
2. Active Campaign, LLC d/b/a Postmark – Kommunikation/Support
3. Amazon Web Services, Inc – Hosting
4. Atlassian Corporation Plc – Statusseite
5. Baintrust Data, Inc – Monitoring/Tracing
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
18. OpenAI, LLC – Natural-Language-Processing/Generation im Rahmen von Supabase-Diensten
19. PandaDoc, Inc – Kommunikation/Support
20. Slack Technologies, LLC – Kommunikation/Support
21. Upstash, Inc – serverloses Datenhosting
22. Vercel, Inc – Hosting

Diese Liste beschreibt die von Supabase allgemein autorisierten Unterauftragsverarbeiter. Nicht jeder Anbieter muss in jedem SchichtFunk-Datenfluss tatsächlich auf Kundendaten zugreifen. Maßgeblich bleiben die aktuelle DPA-Anlage sowie die tatsächlich aktivierten Supabase-Funktionen.

### Drittlandtransfers

Supabase sieht für internationale Übermittlungen vertragliche Transfermechanismen einschließlich EU-Standardvertragsklauseln vor. Das primäre SchichtFunk-Projekt ist in Frankfurt (`eu-central-1`) angesiedelt; Support-, Sicherheits- oder Unterauftragsverarbeitung kann dennoch außerhalb des EWR stattfinden und ist deshalb im DPA-/Subprocessor-Review mitzuführen.

### Status Supabase

🟡 **TECHNISCH/DOKUMENTARISCH GEPRÜFT – Vertragsnachweis noch zu unterzeichnen/archivieren.**

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

🟠 **NOCH NICHT VOLLSTÄNDIG ABGESCHLOSSEN**, weil externe Betreiberhandlungen erforderlich sind:

1. **IONOS: Buchungsbestätigung und die konkret einbezogene AGB-/AVV-Fassung archivieren; Deploy-Now-Protokollierung und Unterauftragsverarbeiter produktspezifisch dokumentieren.**
2. **Supabase-DPA mit den oben dokumentierten SchichtFunk-Angaben unterzeichnen bzw. wirksam annehmen und als Vertragsnachweis archivieren.**
3. **Vercel nur bei tatsächlich gewünschter kommerzieller Rückschaltung auf eine geeignete Tarif-/DPA-Grundlage umstellen.**

Erst nach den für die tatsächlich eingesetzte Produktions- und Rückfallarchitektur erforderlichen Nachweisen darf der Teilpunkt „AVV/DPA + Auftragsverarbeiter“ auf 🟢 gesetzt werden.

## Prüfintervall

- mindestens jährlich,
- zusätzlich bei neuem Infrastruktur-/E-Mail-/Analyse-/Push-/Zahlungsanbieter,
- bei Änderung der DPA/AVV-Fassung,
- bei Änderung der Unterauftragsverarbeiterlisten,
- bei Wechsel von Hostingregionen oder wesentlichen Datenflüssen.
