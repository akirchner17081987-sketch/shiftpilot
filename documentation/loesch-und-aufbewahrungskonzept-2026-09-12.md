# SchichtFunk – Lösch- und Aufbewahrungskonzept

Stand: 14.09.2026

Dokumentstatus: Zielkonzept, Version 1.0

## 1. Zweck, Rollen und Grundsätze

Das Konzept setzt Speicherbegrenzung, Datenminimierung und Rechenschaftspflicht für SchichtFunk um. Für Kundendaten legt der jeweilige Arbeitgeber als Verantwortlicher die konkrete Rechtsgrundlage und Frist fest. SchichtFunk löscht als Auftragsverarbeiter nur nach dokumentierter Weisung bzw. nach den im AVV vereinbarten Regeln.

Es gilt:

1. Zweckfortfall, gesetzliche Mindest-/Höchstfristen und laufende Ansprüche werden vor Löschung geprüft.
2. „Löschen“ bedeutet Entfernung aus Live-Datenbank, Auth, Storage und erreichbaren Replikaten; Sicherungskopien laufen innerhalb ihres Schutzfensters aus und werden nicht für normale Nutzung wiederhergestellt.
3. Bei Rechtsstreit, Prüfung, Sicherheitsvorfall oder Behördenanfrage kann ein dokumentierter Legal Hold die Löschung für genau betroffene Daten aussetzen.
4. Freitexte, insbesondere bei Krankheit und Personalnotizen, sind besonders sparsam zu verwenden und frühestmöglich zu löschen.
5. Löschung, Sperrung, Anonymisierung und Export sind voneinander zu unterscheiden und zu protokollieren.

## 2. Rechtsquellen für die Fristentscheidung

- Art. 5 Abs. 1 lit. e und Art. 17 DSGVO: Speicherbegrenzung und Löschung.
- Art. 28 Abs. 3 lit. g DSGVO: Rückgabe/Löschung nach Ende der Auftragsverarbeitung, sofern keine gesetzliche Speicherung verlangt wird.
- § 16 Abs. 2 ArbZG: dort bezeichnete Arbeitszeitnachweise mindestens zwei Jahre.
- § 41 Abs. 1 EStG: Lohnkonten bis zum Ablauf des sechsten Kalenderjahres nach der letzten eingetragenen Lohnzahlung.
- § 28f SGB IV: Entgeltunterlagen bis zum Ablauf des auf die letzte Betriebsprüfung folgenden Kalenderjahres.
- § 147 AO und § 257 HGB: je nach Unterlagenart sechs, acht oder zehn Jahre.
- §§ 195, 199 BGB: regelmäßige Verjährung drei Jahre, grundsätzlich ab Schluss des maßgeblichen Jahres.

Nicht jeder SchichtFunk-Datensatz ist automatisch Lohnkonto, Buchungsbeleg oder Entgeltunterlage. Die längeren Fristen gelten nur, wenn der Kunde den konkreten Datensatz tatsächlich in dieser Funktion nutzt oder eine andere Rechtsgrundlage dies verlangt.

## 3. Fristenmatrix

„Zielwert“ ist die technische Standardregel, die vor Aktivierung mit dem Kundenblatt bestätigt oder begründet abweichend konfiguriert wird.

| Datenkategorie / technische Objekte | Auslöser | Zielwert | Besonderheit / Rechtsgrund |
|---|---|---|---|
| Öffentliche IONOS-Zugriffs-/Sicherheitslogs | Erhebung | Anbieterfrist; allgemeine Hostinganlage maximal 7 Tage | Deploy-Now-spezifische Zuordnung noch bestätigen |
| Supabase Plattformlogs | Erhebung | im Pro-Tarif 7 Tage zugänglich | nicht mit fachlichen Auditdaten verwechseln |
| Demo-Zugangstoken | Ausstellung | 60 Minuten | nur im Browser; serverseitig nicht als Sitzungstabelle gespeichert |
| Demo-Fehlversuchszustand | letzter Versuch | 15 Minuten | flüchtiger Edge-Function-Arbeitsspeicher bzw. signierter Fehlversuchstoken |
| Demo-Tagesaggregate | Ende des Monats | 14 Monate | nur erlaubte aggregierte Ereignisse ohne Benutzerkennung; danach löschen/zusammenfassen |
| Offene/abgelaufene Einladungen | Ablauf, Widerruf oder Annahme | 30 Tage danach | Token nur gehasht speichern; Missbrauchsnachweis bei Vorfall separat |
| Auth-Konto und Mitgliedschaft | Austritt/Kündigung/Weisung | Zugriff sofort deaktivieren; Live-Löschung grundsätzlich binnen 30 Tagen nach Export-/Prüffenster | Sitzungen widerrufen; abhängige Historie vorher klären |
| Push-Abonnement | Abmeldung, Kontoende oder nachgewiesene Ungültigkeit | unverzüglich; inaktive gültige Endpunkte spätestens nach 90 Tagen ohne Nutzung prüfen/löschen | Provider meldet ungültige Endpunkte, die beim Versand entfernt werden |
| In-App-Benachrichtigungen / Versandstatus | Erstellung bzw. Abschluss | 90 Tage | bei Nachweis-/Konfliktbezug in fachliches Audit überführen statt Nachricht dauerhaft halten |
| Mitarbeiterstammdaten | Ende Beschäftigung/Zweck | sofort deaktivieren; regelmäßig 3 Jahre ab Jahresende, danach löschen/anonymisieren | längere Frist nur für konkret begründete Felder/Dokumente |
| Kontaktdaten und Notfallkontakt | Ende Beschäftigung/Zweck | nach Austritt grundsätzlich binnen 30 Tagen löschen | sofern kein dokumentierter Restzweck besteht |
| Allgemeine Personalnotizen | Erstellung/Zweckfortfall | jährliche Prüfung; spätestens 12 Monate nach Erledigung, sofern kein Anspruchsnachweis | keine Vorratsspeicherung subjektiver Bewertungen |
| Qualifikationen/Erlaubnisse | Ablauf oder Ende Beschäftigung | bis Zweckfortfall, danach regelmäßig 3 Jahre ab Jahresende | branchenspezifische Nachweispflichten des Kunden können abweichen |
| Personalakten-Dokumente | Dokumentablauf oder Ende Beschäftigung | je Dokumentklasse; Standard 3 Jahre ab Jahresende | Lohn-/Steuer-/Handelsunterlagen ggf. 6/8/10 Jahre; `expires_on` ist Prüftermin, noch kein automatisches Löschen |
| Krankheits-Freitext/Notizen | Ende des konkreten Bearbeitungszwecks | spätestens 30 Tage nach Abschluss prüfen und löschen; Diagnosen sind nicht vorgesehen | besondere Kategorie, strengste Minimierung |
| Krankheitsart, Zeitraum und Status | Ende Kalenderjahr der Abwesenheit | regelmäßig 3 Jahre, dann löschen oder zu neutraler Abwesenheit anonymisieren | längere Speicherung nur bei konkretem Lohn-/Sozialversicherungsnachweis |
| Sonstige Abwesenheiten | Ende Kalenderjahr | regelmäßig 3 Jahre | kundenbezogene Tarif-/Urlaubs-/Anspruchsregeln können abweichen |
| Dienstplan und Veröffentlichungen | Ende Kalenderjahr des Dienstes | 3 Jahre | Anspruchs-/Organisationsnachweis; nicht lohnrelevante Details danach anonymisieren |
| Schichtänderungen, Tausch, Bestätigungen, Compliancebefunde, Störfälle | Abschluss/Jahresende | 3 Jahre | bei Lohn-/Gerichts-/Betriebsratsbezug dokumentierter Legal Hold oder längere Kundenfrist |
| Ist-Arbeitszeit und QR-Buchungen | Ende Kalenderjahr | Standard 3 Jahre; mindestens 2 Jahre, soweit § 16 Abs. 2 ArbZG einschlägig | wenn Bestandteil des Lohnkontos/Entgeltunterlage: bis 6 Jahre oder nach § 28f SGB IV |
| Stundenkonto, Monatsabschluss und Berichtssnapshot | Ende Kalenderjahr | 6 Jahre, wenn lohnabrechnungsrelevant; sonst 3 Jahre | geschlossene Monate müssen vor Ablauf unverändert nachweisbar bleiben |
| DATEV-Einstellungen und Lohnartenregeln | Vertrags-/Nutzungsende | 30 Tage nach Exportfenster | keine Beschäftigtendaten erforderlich, außer Zuordnung über Mandant |
| Generierte DATEV-Datei | Download | keine dauerhafte Serverspeicherung | Aufbewahrung der heruntergeladenen Datei ist Kundenpflicht; als Buchungsbeleg ggf. 8 Jahre |
| DATEV-Export-Audit (Monat, Zeilen, Hash) | Ende Kalenderjahr | 6 Jahre; 8 Jahre, wenn als Buchungsbeleg eingeordnet | keine vollständige Datei im Audit speichern |
| Fachliche Auditereignisse | Ereignis/Jahresende | 3 Jahre; 6 Jahre bei Zeit-/Lohn-/Sicherheitsnachweis | `old_values`/`new_values` können sensible Inhalte enthalten und müssen fristgerecht reduziert werden |
| Sicherheitsvorfallakte | Abschluss/Jahresende | 3 Jahre | Legal Hold/Behördenverfahren kann verlängern; Zugriff stark begrenzen |
| Legacy-Importmarker | bestätigter Import | 90 Tage, sofern kein Konflikt; spätestens bei Mandantenlöschung | lokale Quelldaten nach bestätigtem Import entfernen |
| Kunden-/Vertragskommunikation | Vertragsende/Jahresende | 3 Jahre | steuer-/handelsrechtlich relevante Unterlagen 6/8/10 Jahre nach Klassifikation |
| Mandant gesamt | Vertragsende/Weisung | Exportfenster höchstens 30 Tage; danach Live-Löschung | Backups laufen anschließend innerhalb des 7-Tage-Fensters aus |

## 4. Aktueller technischer Ist-Zustand

- Mandantenabhängige Tabellen verwenden überwiegend `ON DELETE CASCADE`; mehrere historische Tabellen verwenden bewusst `RESTRICT`. Eine sichere Mandantenlöschung braucht daher einen geordneten serverseitigen Ablauf und darf nicht durch einzelne Client-Löschungen ersetzt werden.
- Mitarbeiter mit Dienstplan-/Abwesenheitshistorie können in der Oberfläche nur deaktiviert werden. Eine endgültige Löschung ist derzeit nur bei fehlender Historie vorgesehen.
- `audit_events` ist technisch unveränderbar und gegen Löschung geschützt. Das kollidiert langfristig mit einer differenzierten Fristlöschung, wenn vollständige alte/neue Werte enthalten sind. Vor Echtbetrieb ist eine kontrollierte Archivierungs-, Redaktions- oder Löschfunktion mit eng begrenzter Betreiberrolle erforderlich.
- Bei Personalakten-Dokumenten löscht die Oberfläche zuerst Metadaten und danach das Storage-Objekt. Schlägt der zweite Schritt fehl, kann ein verwaistes Objekt verbleiben; ein regelmäßiger Abgleich zwischen Metadaten und Bucket ist erforderlich.
- Für `expires_on`-Felder existieren Erinnerungen, aber keine generische automatische Löschung.
- Supabase Auth-Konten, Storage-Objekte, Datenbankzeilen und Push-Abonnements werden nicht durch einen einzigen vorhandenen Offboardingprozess vollständig koordiniert.
- Supabase Pro hält täglich erzeugte Datenbankbackups sieben Tage vor. Storage-Objekte sind nicht Teil des Datenbankbackups.
- Die automatische Fristbearbeitung ist seit dem 14.09.2026 produktiv aktiviert. V1–V9 enthalten eine private, idempotente Freigabewarteschlange, versionierte Fristprofile, Legal Holds, vollständige Offboarding-Vorschau, Ein-OWNER-Doppelbestätigung und eine zweiphasige Ausführung. `ACCESS` deaktiviert den Mitarbeiterzugang sofort und entfernt Einladungen, Push-Endpunkte sowie QR-Pilotzuordnungen; `ERASURE` wird erst nach Kundenfrist und Legal-Hold-Prüfung claimbar und redigiert zunächst Kontakt-, Notfallkontakt- und kurzlebige Freitextdaten. Planungs-, Zeit-/Lohn-, Personalakten-, Audit- und Monatssnapshot-Nachweise bleiben bis zu ihrer jeweils freigegebenen Frist erhalten. Auth- und Storage-Löschung sind standardmäßig aus und verlangen ausdrückliche Profilregeln; veränderte Manifeste oder Kontozuordnungen sperren die Ausführung. Der 15-Minuten-Zeitplan bestand einen echten produktiven Leerlauf mit HTTP 200 und 0 Datenänderungen.

## 5. Soll-Löschprozess

### 5.1 Regelmäßiger Lauf

1. täglich abgelaufene Einladungen, ungültige Push-Endpunkte und rein technische Kurzzeitdaten bereinigen;
2. monatlich fällige Benachrichtigungen, Demo-Aggregate und Importmarker prüfen;
3. jährlich zum 31. Januar die im Vorjahr abgelaufenen fachlichen Fristen je Mandant prüfen;
4. Legal Holds und kundenspezifische Abweichungen vor der Löschung anwenden;
5. zunächst Prüfbericht mit Anzahl je Tabelle/Storage-Prefix erzeugen;
6. Freigabe durch Weisungsberechtigten des Kunden für Beschäftigtendaten;
7. Storage-Pfade aus dem unveränderlichen Prüfplan löschen und verifizieren, anschließend Datenbank in einer kurzen Transaktion redigieren/löschen; Push und Auth-Sitzungen koordinieren, Auth-Konto nur ohne verbleibende Mandantenzuordnung entfernen;
8. Erfolg und Abweichungen ohne gelöschte Klarinhalte protokollieren;
9. sieben Tage später prüfen, ob Backupfenster und verwaiste Storage-Objekte abgearbeitet sind.

### 5.2 Vertragsende / Mandantenlöschung

1. Weisungsberechtigung und Zielmandant zweifach prüfen.
2. Schreibzugriff sperren und Sitzungen/Einladungen widerrufen.
3. optionalen maschinenlesbaren Export bereitstellen; Downloadfrist höchstens 30 Tage.
4. alle Storage-Objekte des Mandanten löschen und Ergebnis zählen.
5. fachliche Daten in referenziell sicherer Reihenfolge löschen; Auth-Nutzer nur löschen, wenn keine andere zulässige Mandantenzuordnung besteht.
6. Push-Abonnements, private Dispatchdaten und Secrets mit Mandantenbezug entfernen.
7. Mandant und Mitgliedschaften löschen.
8. Löschbestätigung mit Zeitpunkt, Umfang, Abweichungen und erwartetem Backup-Auslauf erstellen.

### 5.3 Betroffenenrecht / Einzelfall

- Der Antrag wird grundsätzlich beim verantwortlichen Arbeitgeber bearbeitet.
- SchichtFunk unterstützt anhand von Auth-ID, Mitarbeiter-ID und Mandant, ohne mandantenübergreifend zu suchen.
- Vor Löschung werden gesetzliche Aufbewahrung, Rechte Dritter und Legal Hold geprüft.
- Wo Löschung noch nicht zulässig ist, wird der Datensatz gesperrt und der verbleibende Zweck dokumentiert.

## 6. Technische Umsetzungspunkte

### 6.1 Produktiver Zustandsautomat

`PENDING_APPROVAL` → `APPROVED` → `EXECUTING/ACCESS` → `ACCESS_REVOKED` → `EXECUTING/ERASURE` → `COMPLETED` oder `BLOCKED`

- Vorschau und Auftrag sind idempotent getrennt.
- Standardmäßig müssen Antrag und Freigabe von zwei unterschiedlichen aktiven OWNER/ADMIN stammen; beide schreibenden Schritte verlangen `aal2`.
- Ein freigegebenes, versioniertes Kunden-Fristprofil ist Pflicht.
- Allgemeine, mitarbeiterbezogene oder unmittelbar am Auftrag hinterlegte Legal Holds verhindern die Löschphase. Sie verhindern bewusst nicht die sofortige Zugriffssperre. Nach Ablauf einer zeitlich befristeten Sperre wird die Löschphase wieder claimbar.
- `FOR UPDATE SKIP LOCKED` verhindert, dass zwei Hintergrundarbeiter denselben Auftrag übernehmen.
- Ein Hintergrundarbeiter darf nur den von ihm übernommenen Auftrag abschließen.
- V1–V9 und der Auth-/Storage-Worker sind produktiv aktiv. Der Ausführungsweg ist nur für `service_role` erreichbar und wird alle 15 Minuten über ein getrenntes Vault-Geheimnis aufgerufen. Ohne kundenspezifisch freigegebenes Fristprofil und gültig bestätigten Auftrag wird nichts verarbeitet.
- Die V3-Vorschau zählt vor einer Auth-Löschung alle bekannten Benutzerverknüpfungen nach Fremdschlüsselwirkung. Eigentum an einem Mandanten, weitere Mitgliedschaften/Mitarbeiterprofile sowie `RESTRICT`-/`NO ACTION`- oder unerwartete `CASCADE`-Verknüpfungen verhindern die Freigabe des Auth-Schritts. `SET NULL`-Folgen werden als eigener Prüfschritt ausgewiesen.
- Historische `RESTRICT`-Beziehungen von Schichten, Änderungs-/Tauschanträgen, QR-Buchungen und Störfällen bestätigen, dass fachliche Nachweise nicht durch ein einfaches Löschen des Mitarbeiterstamms entfernt werden dürfen. Die spätere Ausführung muss je Datenklasse zwischen Aufbewahrung, kontrollierter Redaktion und Löschung entscheiden.

### 6.2 Ein-OWNER-Ausnahme mit kompensierenden Kontrollen

Hat ein Kundenunternehmen genau einen aktiven `OWNER` und keinen aktiven `ADMIN`, darf das reguläre Zwei-Personen-Verfahren nicht durch eine sofortige Selbstfreigabe ersetzt werden. Für Mitarbeiter-Offboarding ist stattdessen der dokumentierte Modus `SOLE_OWNER_DELAYED` vorgesehen:

- erste Bestätigung mit `aal2`, eingefrorener Löschvorschau und Sitzungsfingerabdruck;
- mindestens 24 Stunden Abkühlfrist und höchstens 7 Tage Bestätigungsfenster;
- zweite Bestätigung durch denselben OWNER nur nach neuer Anmeldung, erneutem `aal2` und abweichender `session_id`;
- erneute Prüfung von Rollenlage, Vorschau-Hash, Fristprofil, Fälligkeit und Legal Hold;
- unveränderliches Prüfprotokoll sowie Widerrufsmöglichkeit bis zur Ausführung;
- harte Sperre gegen automatische Mandantenlöschung und gegen Deaktivierung/Löschung des einzigen OWNER-Kontos.

Dies ist ausdrücklich keine Vier-Augen-Kontrolle, sondern eine kompensierende Ein-OWNER-Regel. Sobald eine zweite aktive freigabeberechtigte Person vorhanden ist, gilt wieder das Zwei-Personen-Verfahren. Details und technische Abnahmekriterien enthält `documentation/ein-owner-loeschfreigabe-2026-09-14.md`. V6 bestand auf dem datenlosen Wegwerf-Testbranch 22/22 neue und 41/41 bestehende Datenbankprüfungen; alle Testdaten wurden zurückgerollt und der Branch gelöscht. V1–V9 und der Zeitplan wurden danach mit ausdrücklicher Freigabe produktiv aktiviert; die Abnahme verarbeitete 0 Aufträge.

### 6.3 Geplante Ausführungsreihenfolge

1. Auftrag, Freigabe, Fristprofil und Legal Hold erneut prüfen.
2. Zugriff sofort sperren und offene Einladungen/Push-Sitzungen widerrufen.
3. im Prüfplan eingefrorene Storage-Objekte löschen und durch erneute Auflistung/Hash-Manifest bestätigen;
4. fachliche Live-Daten in kurzer Datenbanktransaktion löschen oder fristgerecht pseudonymisieren;
5. Auth-Sitzungen widerrufen und Auth-Konto nur löschen, wenn keine andere zulässige Mandantenzuordnung besteht;
6. Ergebnis ausschließlich mit Mengen, Hash-/Manifestnachweis, Zeitpunkten und Abweichungen dokumentieren;
7. fehlgeschlagene externe Schritte als `BLOCKED` wiederholbar machen, ohne bereits bestätigte Schritte doppelt auszuführen.

Vor produktiver Aktivierung der Standardfristen sind erforderlich:

- kundenspezifische Tabelle für Fristprofil, Freigabestatus und Legal Holds,
- serverseitiger Dry-Run mit Mengenbericht,
- eng berechtigte Löschfunktionen außerhalb der öffentlichen Data API,
- Redaktions-/Archivierungsweg für Auditdaten,
- atomarer bzw. wiederholbarer Abgleich von Personalakten-Metadaten und Storage-Objekten,
- koordinierte Löschung von Auth, Mitgliedschaft, Mitarbeiterverknüpfung und Push,
- Tests gegen ausschließlich fiktive Testmandanten,
- Nachweis, dass gelöschte Daten nicht durch normale Restoreprozesse wieder produktiv zugänglich gemacht werden.

## 7. Zuständigkeiten und Kontrolle

| Aufgabe | Verantwortlich |
|---|---|
| konkrete Rechtsgrundlage/Frist des Beschäftigtendatums | jeweiliges Kundenunternehmen |
| technische Standardregeln und sichere Löschwerkzeuge | SchichtFunk |
| Kundenfreigabe/Legal Hold | benannter Kunden-Owner bzw. Datenschutz-/Personalverantwortlicher |
| Auftragsverarbeiter-/Backupprüfung | SchichtFunk |
| jährliche Wirksamkeitsprüfung | SchichtFunk gemeinsam mit ausgewähltem Testkunden/Datenschutzberatung |

Status Löschkonzept: 🟡 **EIN-OWNER-FREIGABE, AUTH-/STORAGE-WORKER UND 15-MINUTEN-ZEITPLAN SIND PRODUKTIV AKTIV; BRANCH- UND PRODUKTIV-LEERLAUFPRÜFUNGEN SIND BESTANDEN. KUNDENSPEZIFISCHE FRISTPROFILE SOWIE DIE LANGFRISTREDAKTION VON AUDIT- UND MONATSSNAPSHOTS BLEIBEN VOR DER JEWEILIGEN NUTZUNG OFFEN.**

Quellen: Art. 5, 17 und 28 DSGVO (https://eur-lex.europa.eu/eli/reg/2016/679/oj), § 16 ArbZG (https://www.gesetze-im-internet.de/arbzg/__16.html), § 41 EStG (https://www.gesetze-im-internet.de/estg/__41.html), § 28f SGB IV (https://www.gesetze-im-internet.de/sgb_4/__28f.html), § 147 AO (https://www.gesetze-im-internet.de/ao_1977/__147.html), § 257 HGB (https://www.gesetze-im-internet.de/hgb/__257.html), §§ 195/199 BGB. Die konkrete arbeits-, tarif-, steuer- und sozialversicherungsrechtliche Einordnung muss der jeweilige Arbeitgeber prüfen.
