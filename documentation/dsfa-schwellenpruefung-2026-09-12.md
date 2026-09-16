# SchichtFunk – DSFA-Schwellenprüfung

Stand: 12.09.2026

Dokumentstatus: Vorprüfung nach Art. 35 DSGVO, Version 1.0

## 1. Ergebnis

| Verarbeitung | Ergebnis |
|---|---|
| Öffentliche Website/PWA, technisch erforderliche Logs und Support | derzeit keine Pflicht zur vollständigen DSFA erkennbar; normale Risikoanalyse/TOM ausreichend |
| Isolierte Demo mit fiktiven Daten und aggregierten Nutzungsereignissen | derzeit keine Pflicht zur vollständigen DSFA erkennbar, sofern keine freien Inhalte/Benutzerprofile ergänzt werden |
| SchichtFunk-Echtbetrieb für Beschäftigtenverwaltung, Krankheit, Dienstplan, Arbeitszeit/QR, Stundenkonto, Personalakte und DATEV-Vorbereitung | **vollständige DSFA vor dem ersten kommerziellen Echtbetrieb erforderlich bzw. jedenfalls zwingend konservativ durchzuführen** |

Die Pflicht aus Art. 35 DSGVO trifft für Beschäftigtendaten regelmäßig den jeweiligen Kunden/Arbeitgeber als Verantwortlichen. SchichtFunk muss als Auftragsverarbeiter unterstützen und eine wiederverwendbare produktbezogene Risikobeschreibung, TOM und Nachweise bereitstellen. Diese Schwellenprüfung ist noch keine vollständige DSFA und keine Produktivfreigabe.

## 2. Geprüfter Verarbeitungskontext

SchichtFunk verbindet in einem Mandanten:

- Konten, Rollen und Mitarbeiterstammdaten,
- digitale Personalakte, Qualifikationen und interne Notizen,
- Dienstplanung, Verfügbarkeiten, Änderungen, Tausch und Bestätigungen,
- Abwesenheiten einschließlich der Gesundheitsinformation „Krank“,
- Ist-Arbeitszeiten, Pausen, QR-Terminalbuchungen und Stundenkonto,
- Monatsabschluss, Lohnvorschau und DATEV-LODAS-Vorbereitung,
- Audit-, Compliance-, Störfall- und Benachrichtigungsdaten,
- freiwillige Web-Push-Abonnements.

Auto-Planung und Störfall-Autopilot arbeiten regelbasiert und erzeugen Vorschläge. Nach aktuellem Produktstand trifft eine berechtigte Person die Entscheidung; es gibt keine ausschließlich automatisierte Entscheidung mit rechtlicher oder ähnlich erheblicher Wirkung.

## 3. Prüfung der gesetzlichen Fälle aus Art. 35 Abs. 3 DSGVO

| Fall | Bewertung |
|---|---|
| systematische und umfassende Bewertung auf Basis automatisierter Verarbeitung mit rechtlicher/ähnlicher Wirkung | derzeit nicht unmittelbar erfüllt, weil menschliche Freigabe vorgesehen ist; Funktionsänderungen können das Ergebnis ändern |
| umfangreiche Verarbeitung besonderer Kategorien | Krankheitsstatus ist Art.-9-relevant; aktueller Testumfang ist nicht groß. Das Produkt ist jedoch als mandantenfähiger SaaS-Dienst auf fortlaufende Nutzung ausgelegt, sodass Umfang und Skalierung vor jedem Echtkunden zu berücksichtigen sind |
| umfangreiche systematische Überwachung öffentlich zugänglicher Bereiche | nicht erfüllt; QR erfasst keine öffentlich zugängliche Fläche und keine Standortbewegungsprofile |

Das Nichtvorliegen eines einzelnen Beispiels aus Abs. 3 schließt die Pflicht nach der allgemeinen Regel des Art. 35 Abs. 1 nicht aus.

## 4. Neun Risikokriterien aus WP248/EDSA

| Kriterium | Trifft zu? | Begründung |
|---|---|---|
| Bewerten oder Einstufen | teilweise | Soll/Ist, Salden, Compliancebefunde, Qualifikationen und Verfügbarkeit können in Personalentscheidungen einfließen; SchichtFunk soll selbst kein Leistungs-Scoring erzeugen |
| automatisierte Entscheidung mit erheblicher Wirkung | nein, aktueller Stand | nur Vorschläge; menschliche Entscheidung erforderlich |
| systematische Überwachung | ja | fortlaufende Arbeitszeit-, QR-, Schicht-, Änderungs- und Auditaufzeichnung |
| vertrauliche/höchst persönliche Daten | ja | Krankheitsstatus, Personalakte, Notfallkontakte und interne Personalnotizen |
| Verarbeitung in großem Umfang | derzeit nein/skalierungsabhängig | heutiger Staging-/Testumfang klein; SaaS-Zielbetrieb kann Mandanten und Beschäftigte vervielfachen |
| Zusammenführen von Datensätzen | ja | Personal-, Plan-, Abwesenheits-, Zeit-, Audit- und Lohnvorbereitungsdaten werden je Person zusammengeführt |
| schutzbedürftige Betroffene | ja | Beschäftigte stehen in einem Abhängigkeitsverhältnis zum Arbeitgeber |
| innovative Technologie/Organisation | teilweise | PWA, Web Push, QR-Zeiterfassung und automatisierte Planungsvorschläge werden kombiniert; keine Biometrie/GPS |
| Verhinderung eines Rechts/Vertragszugangs | teilweise | fehlerhafte Zeit-, Abwesenheits- oder Berechtigungsdaten könnten Vergütung, Einsatz oder Zugang zum Portal beeinflussen |

Damit sind deutlich mehr als zwei der regelmäßig herangezogenen Kriterien erfüllt. Dies begründet die konservative Entscheidung für eine vollständige DSFA.

## 5. Abgleich mit der deutschen Muss-Liste

Die DSK-Liste Version 1.1 nennt unter Nr. 8 die umfangreiche Verarbeitung von Verhaltensdaten Beschäftigter, wenn sie zur Bewertung der Arbeitstätigkeit mit möglichen Rechtsfolgen oder ähnlich erheblichen Beeinträchtigungen eingesetzt werden kann. SchichtFunk zeichnet zwar Zeit und Arbeitsabläufe systematisch auf, verwendet aber keine GPS-/Bewegungsprofile und kein automatisches Leistungsscoring.

Der aktuelle kleine Testbetrieb erfüllt das Merkmal „umfangreich“ nicht sicher. Im geplanten SaaS-Echtbetrieb können Umfang, Verknüpfung und Nutzung durch Arbeitgeber die Schwelle jedoch erreichen. Die Muss-Liste ist zudem nicht abschließend. Das Ergebnis „vollständige DSFA erforderlich“ stützt sich deshalb zusätzlich auf Art. 35 Abs. 1 und die Kombination mehrerer EDSA-Kriterien.

## 6. Vorläufige Risikoanalyse

Bewertung: Eintrittswahrscheinlichkeit (E) und Schwere (S) jeweils 1–4; Risikowert `E × S`. 1–3 niedrig, 4–7 mittel, 8–11 hoch, 12–16 sehr hoch.

| Risiko für Betroffene | E/S vor Maßnahmen | Bestehende/erforderliche Maßnahmen | Restrisiko-Ziel |
|---|---:|---|---:|
| mandantenübergreifender oder unberechtigter Zugriff | 3/4 = 12 | RLS, `company_id`, Rollen, Testmandant; vollständige SECURITY-DEFINER-Allowlist und regelmäßige Isolationstests erforderlich | 1/4 = 4 |
| Offenlegung von Krankheits-/Personalaktendaten | 3/4 = 12 | OWNER/ADMIN-Beschränkung, privater Bucket, signierte URLs; Freitextminimierung, MFA und Zugriffsreviews erforderlich | 1/4 = 4 |
| übermäßige Beschäftigtenüberwachung oder Zweckänderung | 3/4 = 12 | keine GPS/Biometrie, menschliche Entscheidung; Kundenrichtlinie, Betriebsratsprüfung, klare Zweckbindung und Transparenz erforderlich | 2/3 = 6 |
| falsche Arbeitszeit/QR-Zuordnung mit Vergütungsfolge | 3/4 = 12 | serverseitige Zuordnung, Zeitfenster, veröffentlichte Schicht, Korrektur-/Freigabeworkflow; Einspruchsweg und regelmäßige Stichprobe erforderlich | 2/3 = 6 |
| automatischer Planungsvorschlag benachteiligt Beschäftigte | 2/4 = 8 | nur Vorschlag, menschliche Freigabe, Regelbefunde; Erklärbarkeit, keine verdeckten Scores, dokumentierte Entscheidung erforderlich | 1/3 = 3 |
| unvollständige Löschung bzw. verwaiste Storage-Datei | 3/4 = 12 | Löschkonzept vorhanden; koordinierter Löschlauf, Storage-Abgleich und Nachweis noch umzusetzen | 1/4 = 4 |
| kompromittiertes Konto | 3/4 = 12 | Passwort-Hashing, Rollen, TLS; Leaked Password Protection und MFA für privilegierte Rollen noch erforderlich | 1/4 = 4 |
| sensible Push-Nachricht auf Sperrbildschirm | 3/3 = 9 | Push opt-in; neutrale Nachrichtentexte und Inhaltsrichtlinie erforderlich | 1/3 = 3 |
| Verlust/Nichtverfügbarkeit von Zeit- oder Personaldaten | 2/4 = 8 | tägliche DB-Backups 7 Tage; Storage-/Restore-Test, RPO/RTO und Exportverfahren noch erforderlich | 1/4 = 4 |
| Drittlandzugriff durch Unterauftragsverarbeiter | 2/4 = 8 | Frankfurt-Region, DPA, SCC, TIA, Subprocessor-Review; Datenminimierung und Änderungsbeobachtung | 1/4 = 4 |

Die Zielwerte sind Planwerte. Sie gelten erst als erreicht, wenn die jeweilige Maßnahme umgesetzt, getestet und dokumentiert ist.

## 7. Zwingende Maßnahmen vor Echtbetrieb

1. vollständige DSFA nach Art. 35 Abs. 7 für das konkrete Kunden-Szenario erstellen und durch den verantwortlichen Arbeitgeber freigeben;
2. Datenschutzbeauftragte Person für SchichtFunk benennen und einbeziehen; § 38 Abs. 1 Satz 2 BDSG wird wegen der DSFA-pflichtigen Verarbeitung konservativ als Benennungspflicht unabhängig von der Mitarbeiterzahl behandelt;
3. Datenschutzbeauftragten und gegebenenfalls Betriebsrat/Personalvertretung des Kunden einbeziehen;
4. Zwecke, Rechtsgrundlagen, erlaubte Auswertungen und verbotene Leistungskontrolle vertraglich/organisatorisch festlegen;
5. Leaked Password Protection aktivieren und MFA-Konzept für privilegierte Rollen umsetzen;
6. alle öffentlich erreichbaren `SECURITY DEFINER`-RPCs gegen dokumentierte Allowlist, interne Authentisierung und Mandantentrennung prüfen;
7. Lösch-/Offboardingprozess für Datenbank, Auth, Storage, Push und Backups implementieren und testen;
8. Krankheits- und Push-Freitexte minimieren; Diagnosen und medizinische Details organisatorisch und soweit möglich technisch verhindern;
9. Korrektur-, Auskunfts-, Export- und Widerspruchsweg für Beschäftigte nachweisen;
10. Backup-/Restore-Test einschließlich Personalakten-Storage durchführen;
11. Risiko- und Wirksamkeitsprüfung nach Pilot, Sicherheitsvorfall, wesentlicher Funktionsänderung oder Skalensprung wiederholen.

Falls trotz dieser Maßnahmen ein hohes Restrisiko verbleibt, ist vor Verarbeitung die zuständige Aufsichtsbehörde nach Art. 36 DSGVO zu konsultieren.

## 8. Inhalt der folgenden vollständigen DSFA

Die vollständige DSFA muss mindestens enthalten:

- konkreten Kunden, Beschäftigtenzahl, Standorte, Rollen und Betriebsratslage,
- Zwecke und Rechtsgrundlagen je Datenkategorie,
- Datenflussdiagramm einschließlich Browser, IONOS, Supabase, Storage, Edge Functions und Pushanbieter,
- Notwendigkeits-/Verhältnismäßigkeitsprüfung jeder Funktion,
- dokumentierte Interessen und Erwartungen der Beschäftigten,
- vollständige Risikobewertung mit Maßnahmenverantwortlichen und Nachweisen,
- Stellungnahme des Datenschutzbeauftragten und gegebenenfalls der Beschäftigtenvertretung,
- Freigabeentscheidung, Reviewdatum und Kriterien für eine erneute Prüfung.

## 9. Freigabestatus

DSFA-Schwellenprüfung: 🟢 **ABGESCHLOSSEN.**

Vollständige DSFA für den Beschäftigtendaten-Echtbetrieb: 🔴 **VOR KOMMERZIELLEM ECHTBETRIEB ERFORDERLICH.**

Quellen:

- Art. 35/36 DSGVO: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- EDSA-Kriterien und KMU-Leitfaden: https://www.edpb.europa.eu/sme/be-compliant/be-compliant_en
- DSK-Muss-Liste Version 1.1: https://www.datenschutzkonferenz-online.de/media/ah/20181017_ah_DSK_DSFA_Muss-Liste_Version_1.1_Deutsch.pdf
- Landesbeauftragte Sachsen-Anhalt: https://datenschutz.sachsen-anhalt.de/informationen/datenschutz-grundverordnung/liste-datenschutz-folgenabschaetzung
- § 26 BDSG: https://www.gesetze-im-internet.de/bdsg_2018/__26.html
- § 38 BDSG: https://www.gesetze-im-internet.de/bdsg_2018/__38.html

Diese Vorprüfung dokumentiert eine fachlich-technische Risikoeinschätzung und ersetzt keine individuelle Rechtsberatung oder die Entscheidung des verantwortlichen Arbeitgebers.
