# SchichtFunk – IONOS Deploy Now Anfrage zu Logs und Aufbewahrung

Stand: 16.09.2026
Status: Versandfertige Betreiberanfrage; noch nicht an IONOS gesendet

## Anlass

Für den technischen Betriebsnachweis von SchichtFunk soll die produktspezifische Log- und Aufbewahrungsgrenze von IONOS **Deploy Now** belastbar dokumentiert werden.

Die öffentlich verfügbare IONOS-Dokumentation bestätigt:

- Deploy Now ist ein eigenständiges Hostingprodukt und wird von klassischem Web Hosting abgegrenzt;
- SiteAnalytics ist bei Deploy Now enthalten;
- in SiteAnalytics stehen Daten der letzten 12 Monate zur Analyse zur Verfügung;
- der Wiederherstellungs-/Backupweg für Deploy-Now-Projekte wird in der Produktvergleichstabelle über GitHub-Versionierung beschrieben.

Die IONOS-Hilfeseiten zu herunterladbaren Roh-Logdateien sind ausdrücklich für **Web Hosting** ausgewiesen. Deshalb werden deren Aussagen zu Rohlogs und Aufbewahrung nicht auf Deploy Now übertragen.

## Versandfertige Anfrage

**Betreff:** Deploy Now – Verfügbarkeit und Aufbewahrung technischer Zugriffs-/Serverlogs

Guten Tag,

wir betreiben eine statische PWA über IONOS Deploy Now und dokumentieren aktuell unseren Betriebs-, Sicherheits- und Datenschutzprozess. Bitte bestätigen Sie uns produktspezifisch für **Deploy Now** folgende Punkte:

1. Werden für ein statisches Deploy-Now-Projekt technische HTTP-Zugriffs-/Serverlogs geführt, die über die in SiteAnalytics sichtbaren Statistiken hinausgehen?
2. Falls ja: Wie lange werden diese Rohlogs bei IONOS aufbewahrt?
3. Können Kunden diese Rohlogs selbst einsehen oder exportieren? Falls ja: über welchen Bereich bzw. welche Schnittstelle?
4. Werden IP-Adressen oder andere Besucherkennungen in diesen Rohlogs anonymisiert bzw. gekürzt, und zu welchem Zeitpunkt erfolgt dies?
5. Ist das in SiteAnalytics dokumentierte Analysefenster von 12 Monaten unabhängig von der Aufbewahrung eventuell vorhandener Rohlogs zu verstehen?
6. Gibt es für Deploy Now eine dokumentierte Möglichkeit, Betriebs-/Zugriffslogs automatisiert an eine kundeneigene Logsenke zu exportieren oder weiterzuleiten?
7. Falls Deploy Now keine kundenzugänglichen Rohlogs bereitstellt: Können Sie dies bitte ausdrücklich bestätigen?

Es geht ausschließlich um die produktspezifische technische Dokumentation für Deploy Now; Aussagen zu klassischem IONOS Web Hosting sollen ausdrücklich nicht zugrunde gelegt werden.

Vielen Dank.

Freundliche Grüße
SchichtFunk

## Abnahmekriterium

Der Punkt gilt als belastbar geklärt, sobald eine IONOS-Antwort oder eine eindeutige produktspezifische IONOS-Dokumentation mindestens beantwortet:

- ob Deploy-Now-Rohlogs existieren,
- ob sie kundenzugänglich sind,
- deren Aufbewahrungsdauer,
- und die Abgrenzung zu SiteAnalytics.

Bis dahin bleibt die Rohlog-Aufbewahrung als transparente Anbietergrenze offen. Dies verhindert nicht das bereits aktive synthetische Verfügbarkeitsmonitoring und die 30-tägige technische GitHub-Health-Nachweisaufbewahrung.
