# SchichtFunk – Incident-Response- und Datenschutzverletzungsprozess

Stand: 13.09.2026  
Dokumentstatus: Betreiberunterlage, Version 1.0  

## 1. Zweck und Geltungsbereich

Dieses Runbook gilt für Sicherheitsereignisse und mögliche Verletzungen des Schutzes personenbezogener Daten bei SchichtFunk, IONOS Deploy Now, Supabase, den Edge Functions, der PWA, Push-Zustellung, Betreibergeräten und der nur inaktiv vorgehaltenen Vercel-Rückfallumgebung.

SchichtFunk kann je nach Verarbeitung Verantwortlicher oder Auftragsverarbeiter sein. Als Auftragsverarbeiter informiert SchichtFunk den betroffenen Kunden nach Bekanntwerden einer Datenschutzverletzung **unverzüglich** und unterstützt ihn. Der Kunde entscheidet als Verantwortlicher über Meldungen an die Aufsichtsbehörde und betroffene Personen. Für eigene Verarbeitungen trifft SchichtFunk diese Entscheidung selbst. Die möglichst binnen 72 Stunden liegende Frist aus Artikel 33 DSGVO beginnt für den Verantwortlichen mit dessen Kenntnis; interne Zielzeiten dürfen diese gesetzliche Bewertung nicht verzögern.

## 2. Rollen und Erreichbarkeit

| Rolle | Besetzung / Kanal | Aufgabe |
|---|---|---|
| Vorläufige Einsatzleitung und Technik | Alexander Kirchner, `info@schichtfunk.de` | Annahme, Eindämmung, Anbieterkoordination, Lageprotokoll |
| Datenschutzkontakt SchichtFunk | `info@schichtfunk.de` | Datenschutzbewertung, Kundeninformation, Dokumentation |
| Vertretung | **noch zu benennen** | Handlungsfähigkeit bei Nichterreichbarkeit |
| Datenschutzbeauftragte Person | Auswahl nach Option B derzeit zurückgestellt | unabhängige Beratung und Überwachung nach späterer Benennung |
| Kundenkontakt | gemäß Kunden-AVV, Anlage 4 | Weisungen, Risikobewertung und Meldeentscheidung des Kunden |

Bis eine überwachte Alarmierung und Vertretung eingerichtet sind, wird **keine 24/7-Reaktionsbereitschaft behauptet**. Anbieterstatusseiten und Sicherheitsmeldungen sind zusätzlich zum Postfach zu beobachten.

## 3. Schweregrade

| Stufe | Beispiel | Erstreaktion |
|---|---|---|
| P1 kritisch | bestätigter Fremdzugriff, Mandantentrennung verletzt, aktive Schlüsselkompromittierung, erheblicher Datenverlust | sofortige Eindämmung; Einsatzleitung und betroffene Kunden unverzüglich informieren |
| P2 hoch | begründeter Verdacht auf unbefugten Zugriff, Ausfall zentraler Funktionen, fehlerhafte Berechtigungsänderung | Bearbeitung sofort beginnen; binnen einer Stunde klassifizieren und eskalieren |
| P3 mittel | begrenzter Fehlversand, nicht ausgenutzte Fehlkonfiguration, wiederholte verdächtige Anmeldung | am selben Arbeitstag bewerten und beheben |
| P4 niedrig | folgenloses Ereignis oder Verbesserungshinweis | geordnet dokumentieren und im normalen Änderungsprozess behandeln |

Bei Unsicherheit ist zunächst die höhere Stufe anzunehmen. Gesundheits-, Personalakten-, Arbeitszeit- und Authentifizierungsdaten erhöhen den Schutzbedarf.

## 4. Ablauf ab Kenntniszeitpunkt T0

### T0 bis T+15 Minuten – aufnehmen und sichern

1. Zeitpunkt, Meldekanal, meldende Person und unveränderte Erstbeschreibung erfassen.
2. Incident-ID `SF-INC-YYYYMMDD-NNN` vergeben und ein zugriffsbeschränktes Lageprotokoll beginnen.
3. Keine verdächtigen Dateien öffnen und keine Beweise überschreiben; relevante Zeitstempel, Anbieterereignisse und Audit-IDs sichern.
4. P1/P2 vorläufig klassifizieren und die Einsatzleitung informieren.

### T+15 bis T+60 Minuten – eindämmen und Kunden informieren

1. Betroffene Konten oder Mitgliedschaften deaktivieren und Sitzungen widerrufen, soweit technisch erforderlich.
2. Betroffene Schlüssel, QR-Tokens oder Push-Geheimnisse nach Abhängigkeitsprüfung rotieren.
3. Gefährdete Funktion eingrenzen; bei Integritätszweifel Schreibzugriffe stoppen oder einen bekannten sicheren Anwendungsstand bereitstellen.
4. Als Auftragsverarbeiter den betroffenen Kunden unverzüglich mit den bereits verfügbaren Fakten informieren. Fehlende Angaben werden gekennzeichnet und nachgereicht.
5. Anbieterfälle bei IONOS oder Supabase eröffnen, wenn deren Infrastruktur betroffen sein kann; Ticketnummern im Lageprotokoll erfassen.

### T+1 bis T+4 Stunden – Umfang und Risiko bewerten

1. Betroffene Mandanten, Personen, Datenarten, Zeiträume und ungefähre Datensatzanzahl ermitteln.
2. Vertraulichkeit, Integrität und Verfügbarkeit getrennt bewerten.
3. Wahrscheinliche Folgen und bereits getroffene Abhilfen dokumentieren.
4. Prüfen, ob besondere Datenkategorien, Zugangsdaten, Personalakten oder lohnrelevante Daten betroffen sind.
5. Wiederanlaufweg festlegen: Fehlerbehebung, sauberes Redeployment, logischer Restore, Storage-Restore oder – nur nach ausdrücklicher Freigabe – physischer Anbieter-Restore.

### Spätestens vor Ablauf von 72 Stunden – dokumentierte Meldeentscheidung

- Der Verantwortliche dokumentiert, ob eine Meldung an die Aufsichtsbehörde erforderlich ist.
- Bei voraussichtlichem hohem Risiko prüft der Verantwortliche zusätzlich die unverzügliche Benachrichtigung betroffener Personen nach Artikel 34 DSGVO.
- Unvollständige Informationen dürfen schrittweise nachgereicht werden; eine fehlende Einzelangabe ist kein Grund, die Erstmeldung unnötig zu verzögern.
- SchichtFunk liefert als Auftragsverarbeiter die verfügbaren technischen Tatsachen und Maßnahmen, trifft aber nicht anstelle des Kunden dessen Rechtsentscheidung.

## 5. Mindestinhalt des Lageprotokolls

- Incident-ID, Kenntniszeitpunkt, Meldekanal und Bearbeitende;
- System, Mandant und betroffene Funktion;
- Kategorien und ungefähre Zahl betroffener Personen und Datensätze;
- Ereignisablauf in UTC und lokaler Zeit;
- gesicherte Audit-/Anbieterreferenzen, Hashes und relevante Versionsstände;
- Eindämmungs-, Wiederherstellungs- und Präventionsmaßnahmen;
- Risikobewertung sowie Kunden-/Behörden-/Betroffenenentscheidung;
- Kommunikationszeitpunkte, Empfänger und freigegebener Inhalt;
- Abschluss, Wirksamkeitsprüfung, Restaufgaben und Verantwortliche.

Protokolle dürfen keine unnötigen Vollkopien von Personalakten oder Gesundheitsdaten enthalten. Geheimnisse, Zugriffstoken und vollständige Authentifizierungsdaten werden niemals in Git, Tickets oder E-Mails übernommen.

## 6. Vorlage für die erste Kundeninformation

```text
Betreff: SchichtFunk – vorläufige Information zu einem Datenschutz-/Sicherheitsereignis [Incident-ID]

Kenntniszeitpunkt: [Datum/Uhrzeit/Zeitzone]
Betroffene SchichtFunk-Funktion bzw. Systeme: [Angabe]
Derzeit bekannte Datenarten und Personengruppen: [Angabe oder „noch in Prüfung“]
Derzeit bekannter Umfang: [Angabe oder „noch in Prüfung“]
Bereits getroffene Eindämmungsmaßnahmen: [Angabe]
Mögliche Folgen: [Angabe oder „noch in Prüfung“]
Nächste Aktualisierung: [Zeitpunkt]
Kontakt: info@schichtfunk.de

Diese Meldung ist vorläufig. Fehlende Informationen werden ohne unangemessene Verzögerung nachgereicht.
```

## 7. Wiederanlauf und Abschluss

1. Wiederanlauf nur aus einem bekannten, geprüften Stand; vor Freigabe Build, Regression, Mandantentrennung und betroffene Kernfunktion prüfen.
2. Bei Restore die in `backup-storage-restore-pruefung-2026-09-13.md` beschriebenen Datenbank- und Storage-Grenzen beachten.
3. Wiederhergestellte Systeme auf überfällige Löschungen, zurückgesetzte Anmeldedaten, RLS/Grants, Edge Functions, Auth- und Realtime-Einstellungen prüfen.
4. Ursache, Wirksamkeit der Maßnahmen und Wiederholungsrisiko dokumentieren.
5. Folgeaufgaben mit Frist und Verantwortlichen verfolgen; Runbook und TOM bei Bedarf aktualisieren.

## 8. Dokumentiertes Planspiel vom 13.09.2026

### Szenario

Rein fiktive Annahme: Ein Kunden-Admin meldet, dass seine Sitzung möglicherweise entwendet wurde und ein Dienstplanexport mit Namen, Arbeitszeiten und Krankheitsstatus eines zweiten Mandanten sichtbar gewesen sein könnte. Es wurden keine Produktionskonten verwendet, keine Nachricht versendet und keine Einstellung verändert.

### Durchlauf

| Prüfschritt | Erwartete Handlung | Ergebnis des Planspiels |
|---|---|---|
| Erstmeldung | Incident-ID, T0, Quelle und unveränderte Meldung erfassen | Prozessfeld vorhanden |
| Soforteinstufung | wegen möglicher Mandantentrennung und Gesundheitsbezug P1 | Entscheidung eindeutig |
| Eindämmung | Sitzung widerrufen, Konto/Mitgliedschaft sperren, Exportfunktion eingrenzen, Beweise sichern | technische Schritte benannt; echter Widerruf-Drill offen |
| Kundeninformation | beide möglicherweise betroffenen Verantwortlichen unverzüglich mit vorläufigen Fakten informieren | Vorlage und schrittweise Nachmeldung vorhanden |
| Umfang | Auditereignisse, Funktionsversion, Mandanten- und Datensatzumfang prüfen | Nachweisquellen benannt; zentrale Logzugriffsmatrix offen |
| Wiederanlauf | RLS/RPC-Grenze prüfen, bekannten Stand bereitstellen, gezielte Negativtests ausführen | Git-/Testweg vorhanden |
| Rechtsentscheidung | Risiko sowie Art.-33-/34-Entscheidung durch den jeweiligen Verantwortlichen dokumentieren | Verantwortungsgrenze korrekt abgebildet |
| Abschluss | Ursache, Abhilfe, Wirksamkeit und Folgemaßnahmen dokumentieren | Abschlusskriterien vorhanden |

### Ergebnis und offene Feststellungen

Der Papierablauf ist schlüssig und deckt Erkennung, Eindämmung, Kundeninformation, Bewertung, Wiederanlauf und Nachbereitung ab. Der Prozess gilt **nicht als vollständig betrieblich abgenommen**, bis folgende Feststellungen erledigt sind:

1. Vertretung und erreichbare Eskalationskette benennen.
2. Überwachte Alarmierung und definierte Bereitschaftszeiten einrichten.
3. Echten Sitzungswiderruf und Schlüsselrotation mit zwei sicheren Testkonten üben.
4. Zugriffswege und Aufbewahrung für IONOS-, Supabase-, Auth-, Edge-Function- und Anwendungsaudits tabellarisch festlegen.
5. Kundenkontakte aus Anlage 4 des jeweiligen AVV vor Produktivbeginn vollständig eintragen.

Das Planspiel ist nach wesentlichen Architekturänderungen und mindestens jährlich zu wiederholen. Ein technischer Drill darf nur mit fiktiven Daten und ausdrücklich freigegebener Testumgebung erfolgen.

## 9. Quellen

- DSGVO Artikel 33 und 34: https://eur-lex.europa.eu/eli/reg/2016/679/deu
- BSI Vorfallunterstützung: https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Cyber-Sicherheitslage/Reaktion/Vorfallunterstuetzung/vorfallsunterstuetzung.html
- Supabase Security: https://supabase.com/docs/guides/security
- Supabase Backups: https://supabase.com/docs/guides/platform/backups

Status: 🟡 **RUNBOOK UND PAPIER-PLANSPIEL DOKUMENTIERT; ALARMIERUNG, VERTRETUNG UND TECHNISCHER SITZUNGS-/SCHLÜSSEL-DRILL OFFEN.**

