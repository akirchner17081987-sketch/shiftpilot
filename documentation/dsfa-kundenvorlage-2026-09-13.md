# Datenschutz-Folgenabschätzung – SchichtFunk-Kundenvorlage

Stand: 13.09.2026

Dokumentstatus: vorbereitete Vollvorlage nach Art. 35 Abs. 7 DSGVO; erst nach Kundenergänzung, Prüfung durch die datenschutzbeauftragte Person und Freigabe gültig

## 1. Dokumentkontrolle

| Feld | Eintrag |
|---|---|
| verantwortliches Kundenunternehmen | `[Firmenname, Rechtsform, Anschrift]` |
| Projekt/Einführung | `[Bezeichnung]` |
| Verantwortliche Fachstelle | `[Name/Funktion]` |
| Datenschutzbeauftragte Person des Kunden | `[Kontakt]` |
| Datenschutzbeauftragte Person SchichtFunk | `[nach Benennung]` |
| Beschäftigtenvertretung/Betriebsrat | `[vorhanden/nicht vorhanden; Beteiligung]` |
| Standorte und Beschäftigtenzahl | `[Anzahl/Orte]` |
| Pilotbeginn / Produktivbeginn | `[Datum]` |
| DSFA-Version / Freigabedatum | `[Version/Datum]` |
| nächste Prüfung | `[Datum; spätestens jährlich]` |

## 2. Ergebnis und Freigabegrenze

SchichtFunk verbindet Beschäftigtenstammdaten, Dienstplanung, Abwesenheiten einschließlich „Krank“, Zeiterfassung/QR, Stundenkonto, Personalakte, Audit- und DATEV-Vorbereitungsdaten. Wegen systematischer Beschäftigtenbeobachtung, besonderer Datenkategorien, Datenverknüpfung und möglicher Auswirkungen auf Einsatz und Vergütung wird vor dem Echtbetrieb eine vollständige DSFA durchgeführt.

Diese Vorlage ist keine Freigabe. Der Echtbetrieb bleibt gesperrt, solange mindestens eines der folgenden Felder offen ist:

- konkrete Zwecke und Rechtsgrundlagen des Kunden;
- Beschäftigtenzahl, Standorte und tatsächlicher Funktionsumfang;
- Betriebsrats-/Personalvertretungsbeteiligung;
- kundenspezifisches Lösch- und Fristprofil;
- Stellungnahme der datenschutzbeauftragten Person;
- Wirksamkeitsnachweise für MFA, Mandantentrennung, Offboarding und Restore;
- schriftliche Entscheidung des Verantwortlichen über verbleibende Risiken.

## 3. Beschreibung der Verarbeitung

### 3.1 Zwecke

| Zweck | aktiviert? | verantwortliche Begründung |
|---|---|---|
| Dienst- und Einsatzplanung | `[ja/nein]` | `[Kunde]` |
| Veröffentlichung und Bestätigung von Schichten | `[ja/nein]` | `[Kunde]` |
| Arbeitszeit-, Pausen- und QR-Erfassung | `[ja/nein]` | `[Kunde]` |
| Stundenkonto und Monatsabschluss | `[ja/nein]` | `[Kunde]` |
| Abwesenheitsverwaltung | `[ja/nein]` | `[Kunde]` |
| Personalakte/Qualifikationen | `[ja/nein]` | `[Kunde]` |
| DATEV-LODAS-Vorbereitung | `[ja/nein]` | `[Kunde]` |
| Schichttausch/Störfallvorschläge | `[ja/nein]` | `[Kunde]` |
| Push-Benachrichtigungen | `[ja/nein; freiwillig]` | `[Kunde]` |

Verbotene Zwecke: verdeckte Leistungs- oder Verhaltensbewertung, Bewegungsprofil, GPS-Ortung, biometrische Kontrolle, Diagnoseerfassung, ausschließlich automatisierte Personalentscheidung sowie zweckfremde Weitergabe.

### 3.2 Betroffene und Daten

Betroffene: Beschäftigte, Bewerber nur sofern ausdrücklich ergänzt, ehemalige Beschäftigte innerhalb zulässiger Fristen, Manager/Disponenten und Supportkontakte.

| Datenkategorie | Beispiele | Schutzbedarf |
|---|---|---|
| Konto/Rolle | E-Mail, Auth-ID, Mitgliedschaft, Rolle | hoch |
| Stammdaten | Name, Personalnummer, Kontakt, Beschäftigung | hoch |
| Dienstplan | Einsatz, Ort, Zeit, Bestätigung, Änderungen | hoch |
| Arbeitszeit | Soll/Ist, Pausen, QR-Buchung, Korrektur | sehr hoch |
| Abwesenheit | Art, Zeitraum, Status; „Krank“ | sehr hoch / Art. 9 |
| Personalakte | Notfallkontakt, Qualifikation, Dokument, Notiz | sehr hoch |
| Lohnvorbereitung | Stundenkonto, Lohnart, Exportnachweis | sehr hoch |
| Audit/Sicherheit | Akteur, Ereignis, Vorher/Nachher, Zeitpunkt | sehr hoch |
| Push | Endpunkt/Schlüssel, neutrale Nachricht | hoch |

Diagnosen, medizinische Unterlagen und freie Krankheitsdetails sind nicht vorgesehen. Der Kunde dokumentiert, welche Freitextfelder deaktiviert oder organisatorisch beschränkt werden.

### 3.3 Datenfluss

1. Browser/iPhone-PWA lädt statische Dateien über IONOS Deploy Now.
2. Nutzer authentisieren sich direkt bei Supabase Auth in Frankfurt.
3. Fachzugriffe laufen über Supabase Data API/RPC; RLS und serverseitige Rollenprüfungen begrenzen Mandant und Funktion.
4. Personalakten-Dateien liegen in einem privaten Supabase-Storage-Bucket und werden nur über autorisierte Pfade/kurzlebige Zugriffe verwendet.
5. Supabase Edge Functions bearbeiten Demo-, Push- und künftig freigegebene Datenschutzabläufe; der Service-Schlüssel bleibt serverseitig.
6. Web Push wird nur nach freiwilliger Browserfreigabe verwendet; Sperrbildschirmtexte bleiben neutral.
7. DATEV-Dateien werden im Browser erzeugt/heruntergeladen; SchichtFunk speichert nicht dauerhaft die vollständige Exportdatei.
8. Datenbankbackups werden täglich erzeugt; Storage-Objekte benötigen einen separaten Sicherungsweg.

Empfänger/Auftragsverarbeiter und Drittlandbezüge werden aus `avv-dpa-subprocessors-2026-09-12.md` übernommen und kundenspezifisch bestätigt.

## 4. Rechtsgrundlagen und Transparenz

Der Kunde trägt als Arbeitgeber die Verantwortung für die konkrete Rechtsgrundlage. Pro Zweck ist auszufüllen:

| Zweck/Daten | Rechtsgrundlage | Erforderlichkeit | Kollektivregelung/Einwilligung | Information an Beschäftigte |
|---|---|---|---|---|
| Planung | `[Art. 6 / § 26 BDSG]` | `[Begründung]` | `[falls vorhanden]` | `[Dokument/Datum]` |
| Arbeitszeit/QR | `[Rechtsnorm]` | `[Begründung]` | `[falls vorhanden]` | `[Dokument/Datum]` |
| Krankheit | `[Art. 9 + § 26 Abs. 3 BDSG]` | `[Begründung]` | `[falls vorhanden]` | `[Dokument/Datum]` |
| Personalakte | `[Rechtsnorm]` | `[Begründung]` | `[falls vorhanden]` | `[Dokument/Datum]` |
| Lohn/DATEV | `[Rechtsnorm]` | `[Begründung]` | `[falls vorhanden]` | `[Dokument/Datum]` |
| freiwilliger Push | `[Einwilligung/technische Zustimmung]` | `[Begründung]` | `[Widerruf]` | `[Dokument/Datum]` |

Eine Beschäftigteneinwilligung wird nicht pauschal als Grundlage verwendet; ihre Freiwilligkeit ist im Abhängigkeitsverhältnis gesondert zu belegen.

## 5. Notwendigkeit und Verhältnismäßigkeit

Für jede aktivierte Funktion beantwortet der Kunde:

1. Welches konkrete Problem wird gelöst?
2. Warum reichen weniger personenbezogene Daten nicht aus?
3. Welche Felder/Freitexte werden nicht benötigt und deaktiviert?
4. Welche Personengruppen benötigen welche Rolle?
5. Welche Entscheidung bleibt zwingend bei einem Menschen?
6. Wie kann ein Beschäftigter Fehler sehen, melden und korrigieren lassen?
7. Welche mildere Alternative wurde geprüft und warum verworfen?
8. Wann entfällt der Zweck und welche bestätigte Löschfrist gilt?

SchichtFunk erzeugt Planungsvorschläge, Compliancehinweise und Störfallkandidaten. Der Kunde bestätigt, dass daraus keine automatische Entscheidung über Vergütung, Sanktion, Kündigung oder sonstige erhebliche Folge ohne menschliche Prüfung entsteht.

## 6. Risikobewertung

Skala: Eintrittswahrscheinlichkeit und Schwere 1–4, Produkt 1–3 niedrig, 4–7 mittel, 8–11 hoch, 12–16 sehr hoch. Werte sind kundenspezifisch zu bestätigen.

| Risiko für Beschäftigte | Ausgang | Maßnahmen/Nachweis | Rest | Verantwortlich/Termin |
|---|---:|---|---:|---|
| Zugriff aus falschem Mandanten | 3×4=12 | RLS, RPC-Allowlist, Fremdmandantentest | `[ ]` | `[ ]` |
| Zugriff mit falscher Rolle | 3×4=12 | Rollenmatrix, Negativtests, Rechteprüfung | `[ ]` | `[ ]` |
| Kontenübernahme | 3×4=12 | Leaked-Password-Schutz, TOTP, `aal2`, Sitzungswiderruf | `[ ]` | `[ ]` |
| Offenlegung von Krankheitsdaten | 3×4=12 | Minimierung, OWNER/ADMIN, keine Diagnosen, Audit | `[ ]` | `[ ]` |
| Offenlegung der Personalakte | 3×4=12 | privater Bucket, kurzlebiger Zugriff, MFA | `[ ]` | `[ ]` |
| falsche QR-/Zeitzuordnung | 3×4=12 | Schicht-/Zeitfenster, Korrektur, Managerfreigabe | `[ ]` | `[ ]` |
| Benachteiligung durch Planungsvorschlag | 2×4=8 | menschliche Entscheidung, Erklärung, keine Scores | `[ ]` | `[ ]` |
| übermäßige Überwachung/Zweckänderung | 3×4=12 | klare Verbote, Betriebsrat, Auswertungsgrenzen | `[ ]` | `[ ]` |
| sensible Push-Anzeige | 3×3=9 | freiwillig, neutraler Inhalt, Abschaltmöglichkeit | `[ ]` | `[ ]` |
| unvollständige Löschung/Storage-Waise | 3×4=12 | Dry-Run, Vier Augen, Legal Hold, Abgleich, Nachweis | `[ ]` | `[ ]` |
| Datenverlust/zu alter Restore | 2×4=8 | tägliche DB-Sicherung, Storage-Backup, Restore-Test | `[ ]` | `[ ]` |
| Wiederkehr gelöschter Daten aus Backup | 2×4=8 | Sperrliste, Restore-Nachlauf, Backup-Auslauffrist | `[ ]` | `[ ]` |
| Drittland-/Unterauftragnehmerrisiko | 2×4=8 | DPA/SCC/TIA, Frankfurt, Änderungsprüfung | `[ ]` | `[ ]` |
| fehlende Korrektur/Auskunft | 2×4=8 | Portal, Supportprozess, Export und Fristen | `[ ]` | `[ ]` |

Ein verbleibendes hohes Risiko erfordert zusätzliche Maßnahmen; lässt es sich nicht senken, ist vor Verarbeitung Art. 36 DSGVO zu prüfen.

## 7. Technische und organisatorische Maßnahmen

Die kundenbezogene Prüfung verweist auf die TOM und ergänzt mindestens:

- Rollenfreigabe und regelmäßige Rezertifizierung;
- MFA-Pflicht für OWNER/ADMIN und besonders sensible Aktionen;
- dokumentiertes On-/Offboarding inklusive Sitzungs-, Push-, Auth-, Storage- und Datenbankbezug;
- Freitext- und Krankheitsdatenrichtlinie;
- vieräugige Löschfreigabe, Fristprofil und Legal Hold;
- Backup-/Storage-Restore-Test mit RPO/RTO;
- Incident Response und Art.-33/34-Eskalation;
- Schulung der Manager und Beschäftigteninformation;
- Lieferanten-/Unterauftragnehmerprüfung;
- jährliche Wirksamkeits- und Berechtigungsprüfung.

Nachweise: `tom-2026-09-12.md`, `vvt-2026-09-12.md`, `loesch-und-aufbewahrungskonzept-2026-09-12.md`, `security-definer-allowlist-2026-09-13.md`, `auth-hardening-runbook-2026-09-13.md`, `backup-storage-restore-pruefung-2026-09-13.md` sowie kundenspezifische Testprotokolle.

## 8. Betroffenenrechte und Beteiligung

| Thema | Kundenprozess/Nachweis |
|---|---|
| Information Art. 13/14 | `[Dokument, Ausgabe, Datum]` |
| Auskunft und Datenkopie | `[Anlaufstelle, Frist, Export]` |
| Berichtigung/Korrektur Zeitdaten | `[Workflow]` |
| Löschung/Einschränkung | `[Weisung, Frist, Legal Hold]` |
| Widerspruch/Beschwerde | `[Anlaufstelle]` |
| menschliche Überprüfung | `[zuständige Rolle]` |
| Betriebsrat/Personalvertretung | `[Stellungnahme/Vereinbarung]` |
| Datenschutzbeauftragte Person | `[Stellungnahme, Datum]` |

## 9. Maßnahmenplan vor Freigabe

| Maßnahme | Status | Nachweis |
|---|---|---|
| Kundendaten und Rechtsgrundlagen ergänzt | 🔴 | `[ ]` |
| DSB-Stellungnahme liegt vor | 🔴 | `[ ]` |
| Betriebsrat beteiligt/Entbehrlichkeit dokumentiert | 🔴 | `[ ]` |
| Leaked-Password-Schutz und MFA abgenommen | 🔴 | TOTP/App-Fluss und gemeinsame `aal2`-Serverprüfung vorbereitet; Zwei-Konten-, Recovery- und Aktivierungstest offen |
| 35-RPC-Allowlist-Verhaltenstest bestanden | 🟡 | Liste/Drifttest vorhanden, Testbranch offen |
| Lösch-/Offboarding-Test vollständig bestanden | 🟡 | V3-Dry-Run inventarisiert Fach-, Storage- und Auth-Verknüpfungen einschließlich Fremdschlüsselwirkung; statischer/fiktiver Test vorhanden, echte Wegwerf-DB offen |
| DB- und Storage-Restore bestanden | 🔴 | tägliche DB-Backups und lokaler Storage-Hashvergleich nachgewiesen; echter Wegwerf-Restore und separater Storage-Export offen |
| AVV/DPA/Unterauftragnehmer bestätigt | 🟢/kundenspezifisch | vorhandene Betreiberunterlage + Kundenfreigabe |
| Beschäftigteninformation freigegeben | 🔴 | `[ ]` |

## 10. Stellungnahmen und Entscheidung

Datenschutzbeauftragte Person:

`[Stellungnahme, empfohlene Änderungen, Datum, Kontakt/Unterschrift]`

Betriebsrat/Personalvertretung:

`[Stellungnahme/Vereinbarung oder begründete Nichtanwendbarkeit]`

Entscheidung des Verantwortlichen:

- `[ ]` freigegeben;
- `[ ]` freigegeben mit Auflagen;
- `[ ]` nicht freigegeben;
- `[ ]` vorherige Konsultation nach Art. 36 erforderlich.

Begründung, akzeptierte Restrisiken, Maßnahmenverantwortliche und Reviewdatum:

`[vollständiger Eintrag]`

## 11. Änderungs- und Wiederholungsanlässe

Die DSFA wird mindestens jährlich und zusätzlich bei neuem sensiblen Datenfeld, GPS/Biometrie, automatisierter Entscheidung, neuer Auswertung, wesentlicher Skalierung, Anbieter-/Regionenwechsel, Sicherheitsvorfall, geänderter Rechtsgrundlage oder nachlassender Maßnahmenwirksamkeit geprüft.

Quellen: Art. 35/36 DSGVO, § 26 und § 38 BDSG, EDSA-Leitlinien zur DSFA und DSK-Muss-Liste. Die konkrete rechtliche Bewertung und Freigabe obliegen dem verantwortlichen Kunden unter Einbeziehung seiner datenschutzbeauftragten Person.
