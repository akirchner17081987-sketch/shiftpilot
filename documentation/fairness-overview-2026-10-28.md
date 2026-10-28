# Punkt 5 – Faire Verteilung und Belastung

Die bestehende Ansicht „Auswertungen → Belastung & Verteilung“ wird ergänzt. Bestehende Dienstpläne, Regeln und Mitarbeiterdaten werden nicht verändert.

- [x] Nacht-, Wochenend- und Feiertagsdienste je Mitarbeiter auswerten.
- [x] Bestätigte kurzfristige Übernahmen sichtbar machen.
- [x] Abweichungen von vereinbarten Stunden darstellen.
- [x] Wunschentscheidungen und Übereinstimmung mit der veröffentlichten Planung unterscheiden.
- [x] Vertragsumfang, Freigaben, Rolle, verbindliche freie Rhythmustage und genehmigte ganztägige Abwesenheiten sichtbar berücksichtigen.
- [x] Verständliche Planerübersicht und vollständige Exporte ergänzen.

## Definitionen

Nacht: Zeit zwischen 22 und 06 Uhr. Wochenendstunden werden auf Samstag/Sonntag aufgeteilt; die zusätzliche Anzahl „Wochenenden“ zählt Dienststarts Sa/So. Feiertagsdienste haben mindestens eine Überschneidung mit einem Feiertag am hinterlegten Einsatzort. Fehlt dessen Bundeslandregel, werden ausschließlich bundesweite Feiertage gezählt und die Einschränkung angezeigt. Stunden werden in der Unternehmenszeitzone über Mitternacht, Monatsgrenzen und Zeitumstellungen zerlegt. Da keine genaue Pausenlage vorliegt, werden Pausen anteilig auf die Stundenarten verteilt. Eine Stunde kann mehreren Kategorien angehören.

Kurzfristig: Die Übernahme wurde nachweislich zwischen 0 und 48 Stunden vor Dienstbeginn bestätigt bzw. durch die Disposition dokumentiert. Grundlage sind angewendete Ersatz-/Marktplatzvorgänge mit passender Zielperson; mehrere Nachweise desselben Dienstes zählen einmal. Eine gewöhnliche späte Planänderung wird nicht als freiwillige Übernahme interpretiert. Fehlende Nachweise werden nicht aus Textnotizen geschätzt.

Planabweichung: Planstunden + Abwesenheitsgutschrift − Zeitraum-SOLL. Bei Standort-/Schichtanteilen wird kein anteiliger Vertragsfehlbetrag erfunden. Nachtzahlen werden zusätzlich auf 30 verfügbare Tage bezogen, Wochenendstunden auf 100 SOLL-Stunden. Ganztägige genehmigte Abwesenheiten, Vertragsgrenzen und verbindliche freie Rhythmustage reduzieren die verfügbaren Tage. Teilabwesenheiten und andere individuelle Einschränkungen sind damit nicht vollständig in einen einzigen Nenner übersetzt. Vergleichsbasis und Freigaben bleiben sichtbar; keine automatische Leistungsbewertung oder pauschale Rangliste.

Wünsche: getrennte Zählung von zugesagt/vorgemerkt, abgelehnt, offen und zurückgezogen. „Passt / abweichend“ beschreibt die Übereinstimmung mit veröffentlichten Diensten, nicht die Genehmigung eines Antrags. OFF-Wünsche beachten nächtliche Überträge, SHIFT-Wünsche den gewünschten Dienst am Starttag. Gezählt pro Wunschtyp und Kalendertag; bei mehreren Einträgen gilt der neueste. Ohne veröffentlichten Wochenplan bleibt die Übereinstimmung unbekannt. Freiwillig freigegebene Freizeit wird nicht als verfehlter Wunsch behandelt. Bei Standort-/Schichtfiltern wird die Wunschbilanz ausgeblendet, da sie die vollständige persönliche Planung benötigt.

## Prüfung

18 gezielte Rechentests bestanden, einschließlich Zeitumstellung, Feiertagsübertrag, Wunschkonflikt durch Vortagsnacht, unbekannter Planungsbasis und Zusammenführung mehrerer Monate. Browserprüfung mit gefüllten Fairnessdaten, bestehenden Filtern, vollständigen Excel-/PDF-Exporten, mobilen/hellen/dunklen Ansichten und Unternehmens-/Rechtewechsel bestanden. Build erfolgreich.

Zwei Tests auf dem vollständigen Produktionsschema mit synthetischen Konten und vollständigem Rollback bestanden: Wunschbilanz einschließlich Mandantenschutz und fehlender privater Notizfelder; außerdem tatsächliche abgeschlossene digitale Ersatzübernahme einschließlich rückverfolgbarer Bestätigung. Keine echten Dienstpläne verändert oder Testmitteilungen an Mitarbeitende gesendet.

Migration `20261028194235_fairness_report_evidence.sql` ergänzt ausschließlich lesende, mandantengeschützte Berichtsdaten. Öffentlicher Wrapper bleibt SECURITY INVOKER; private Evidenzfunktion prüft die bestehenden Auswertungsrechte und einen begrenzten Monatsabschnitt. Keine medizinischen Abwesenheitsarten, Wunschbegründungen oder internen Ausfallnotizen werden ergänzt.
