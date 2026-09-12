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

## 1. Vercel Inc. – Webhosting / Serverless-Funktionen

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

### Erforderliche Maßnahme

**Vor kommerziellem Produktivbetrieb muss das Vercel-Team mindestens auf Pro umgestellt werden.** Erst danach kann der AVV/DPA-Nachweis für Vercel als wirksam dokumentiert werden. Der Anbieter weist Pro ausdrücklich als Tarif für professionelle Entwickler, Freelancer und Unternehmen aus.

### Unterauftragsverarbeiter / Drittlandtransfer

- Aktuelle offizielle Liste: https://security.vercel.com
- Das Vercel-DPA erteilt eine allgemeine Genehmigung für Unterauftragsverarbeiter und verpflichtet Vercel zu vergleichbaren Datenschutzpflichten gegenüber diesen.
- Für EWR-Drittlandtransfers enthält das DPA die EU-Standardvertragsklauseln (SCC), einschließlich Modul 2 Controller→Processor und Modul 3 Processor→Processor je nach Rollenlage.
- Vercel verlangt für Benachrichtigungen über neue Unterauftragsverarbeiter eine Anmeldung über `privacy@vercel.com` bzw. den jeweils mitgeteilten Mechanismus. Die Einwendungsfrist beträgt laut DPA fünf Kalendertage.
- Die Unterauftragsverarbeiterliste ist dynamisch und wird deshalb nicht als statische abschließende Kopie in SchichtFunk geführt; maßgeblich ist jeweils der Anbieterstand im Vercel Trust Center. Änderungen sind im jährlichen bzw. anlassbezogenen Auftragsverarbeiter-Review nachzuziehen.

### Status Vercel

🟠 **NICHT ABGESCHLOSSEN – Vertragsblocker: aktueller Hobby-Plan.**

---

## 2. Supabase Inc. – Backend, Datenbank, Auth, Realtime und Edge Functions

### Tatsächlich festgestellter Kontostand

- Organisation: `Security_Plattform`
- Organisations-ID: `iovtxoshcpbqkxieiovd`
- Aktueller Plan: **Free**
- Produktivprojekt: `SchichtFunk`
- Projekt-Ref: `zbvloohfjleadjnqhbbh`
- Projektstatus: `ACTIVE_HEALTHY`
- Region: **eu-central-1 (Frankfurt)**

Die gewählte spezifische Region bestimmt laut Supabase die Region der primären Projektdaten. `eu-central-1` entspricht Central EU / Frankfurt.

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

## 3. Weitere direkte Auftragsverarbeiter von SchichtFunk

Im aktuell geprüften SchichtFunk-Repository wurden **keine eigenständig angebundenen Analyse-/Marketingdienste, Sentry-Integration, Stripe-Zahlungsabwicklung, Resend/Mailgun/SendGrid/Postmark-Direktanbindung oder vergleichbare zusätzliche SaaS-Auftragsverarbeiter** festgestellt.

Authentifizierungs-E-Mails und vergleichbare Supabase-Plattformkommunikation sind – soweit sie über Supabase erfolgen – über dessen Unterauftragsverarbeiterkette (u. a. Postmark) abzudecken.

Web-Push wird über standardisierte Browser-/Betriebssystem-Push-Infrastruktur an den vom Gerät bereitgestellten Push-Endpunkt zugestellt. Diese Infrastruktur wird in der Datenschutzerklärung als möglicher technischer Empfänger/Intermediär beschrieben; sie ist derzeit **kein separat von SchichtFunk beauftragter SaaS-Auftragsverarbeiter mit eigenem SchichtFunk-AVV**.

GitHub wird für Quellcode/Deployment verwendet. Produktive Beschäftigten- oder Arbeitszeitdaten werden nach dem geprüften Architekturstand nicht als Anwendungsdaten in GitHub gespeichert; GitHub wird deshalb nicht als direkter Auftragsverarbeiter für SchichtFunk-Kundendaten in dieser Liste geführt.

## 4. Ergebnis / Freigabestatus dieses Teilpunkts

### Auftragsverarbeiter- und Unterauftragsverarbeiterübersicht

🟢 **DOKUMENTIERT UND GEPRÜFT.**

### AVV/DPA-Vertragsnachweise

🟠 **NOCH NICHT VOLLSTÄNDIG ABGESCHLOSSEN**, weil zwei externe Betreiberhandlungen erforderlich sind:

1. **Vercel: Hobby → mindestens Pro umstellen**, damit die geschäftliche Nutzung tariflich zulässig ist und das veröffentlichte Pro-/Enterprise-DPA für SchichtFunk greift.
2. **Supabase-DPA mit den oben dokumentierten SchichtFunk-Angaben unterzeichnen bzw. wirksam annehmen und als Vertragsnachweis archivieren.**

Erst nach diesen beiden Nachweisen darf der Teilpunkt „AVV/DPA + Auftragsverarbeiter“ auf 🟢 gesetzt werden.

## Prüfintervall

- mindestens jährlich,
- zusätzlich bei neuem Infrastruktur-/E-Mail-/Analyse-/Push-/Zahlungsanbieter,
- bei Änderung der DPA/AVV-Fassung,
- bei Änderung der Unterauftragsverarbeiterlisten,
- bei Wechsel von Hostingregionen oder wesentlichen Datenflüssen.
