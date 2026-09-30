// Texte des sichtbaren SchichtFunk Hilfe-Centers, abgeglichen mit dem Stand vom 30.09.2026.
window.SFHelpContent = {
  categories: [
    ['start', 'Erste Schritte', 'Anmeldung, Navigation und Demo'],
    ['overview', 'Heute & Übersicht', 'Live-Besetzung und Einsatzbereitschaft'],
    ['schedule', 'Dienstplan', 'Planen, prüfen, importieren und veröffentlichen'],
    ['employees', 'Mitarbeiter & Rhythmus', 'Profile, Freigaben und wiederkehrende Regeln'],
    ['time', 'Zeiterfassung', 'Geplante und tatsächliche Zeiten'],
    ['qr', 'QR-Zeiterfassung', 'Terminals, Scans, Pausen und Auswertung'],
    ['absence', 'Abwesenheiten', 'Anträge, Freigaben und Konflikte'],
    ['auto', 'Auto-Planung', 'Vorschläge und Planungsregeln'],
    ['reports', 'Auswertungen & DATEV', 'Monatsberichte, Exporte und Lohnübergabe'],
    ['settings', 'Einstellungen & Sicherheit', 'SOLL-Werte, Rollen und Schutz des Zugangs'],
    ['portal', 'Mitarbeiterportal', 'Eigene Schichten, Anträge und Mobilansicht'],
    ['appearance', 'Design & PWA', 'Hell/Dunkel und Nutzung auf dem Smartphone'],
    ['trouble', 'Fehler & Hilfe', 'Häufige Probleme und erste Schritte']
  ],
  articles: {
    start: [
      ['Wie melde ich mich an?', 'Öffnen Sie die SchichtFunk-Startseite und wählen Sie die Anmeldung. Melden Sie sich mit Ihrem eigenen Zugang an. Nach dem Login sehen Sie die Bereiche, die Ihrer Rolle zugewiesen sind.'],
      ['Wie beginne ich mit der Planung?', 'Pflegen Sie Mitarbeiter, Schichtfreigaben und Qualifikationen. Legen Sie Schichtzeiten und SOLL-Stärken fest, besetzen und prüfen Sie den Dienstplan und veröffentlichen Sie ihn anschließend.'],
      ['Speichern oder veröffentlichen?', 'Speichern übernimmt eine Änderung in den Entwurf. Mit „Dienstplan veröffentlichen“ geben Sie den geprüften Plan für Mitarbeitende frei.'],
      ['Wie funktioniert die Demo?', 'Die Demo nutzt einen eigenen, sitzungsbezogenen Beispielmandanten. Sie können Abläufe ausprobieren und über „Demo zurücksetzen“ die Beispieldaten wiederherstellen oder über „Demo beenden“ zurückkehren. Echte Zeitbuchungen werden in der Demo nicht gespeichert.'],
      ['Wo finde ich Hilfe?', 'Öffnen Sie das Fragezeichen im Kopfbereich oder drücken Sie Strg/Cmd + K. Die Suche durchsucht alle Hilfekategorien.']
    ],
    overview: [
      ['Was zeigt „Heute“?', 'Das Heute-Dashboard zeigt unter anderem die aktuelle Besetzung, relevante Nachtschichten, den Status einzelner Einsätze und Schnellzugriffe auf Dienstplan, Zeiterfassung, Abwesenheiten und Auto-Planung.'],
      ['Was bedeutet die Einsatzbereitschafts-Ampel?', 'Grün bedeutet nach den hinterlegten Daten bereit, Gelb erfordert Prüfung und Rot markiert einen kritischen Punkt. Über „Alle Schichten prüfen“ sehen Sie die Gründe je Schicht, etwa Besetzung, Freigaben, Ruhezeiten, Veröffentlichung oder Rückmeldungen.'],
      ['Kann ein Mitarbeiter die Einsatzbereitschaft bestätigen?', 'Für betroffene Schichten kann der Mitarbeiter im Portal „Bestätigen“ oder „Problem“ wählen. Eine gemeldete Schwierigkeit erscheint in der Prüfung der Einsatzbereitschaft.'],
      ['Warum fehlen Kennzahlen?', 'Prüfen Sie Zeitraum und Cloud-Verbindung sowie die erfassten Mitarbeiter, Schichten und SOLL-Stärken. In der Demo sehen Sie Beispieldaten des Demo-Mandanten.']
    ],
    schedule: [
      ['Wie besetze oder ändere ich eine Schicht?', 'Wählen Sie einen passenden Mitarbeiter aus dem Pool oder öffnen Sie eine freie Position. Öffnen Sie eine vorhandene Zuordnung, um Beginn, Ende oder Mitarbeiter zu ändern oder die Zuordnung zu löschen.'],
      ['Was bedeutet SOLL / IST?', 'SOLL bezeichnet die benötigte Besetzung und IST die eingeplante Anzahl. Die Anzeige je Tag und Schichtart macht Unter-, Voll- und Überbesetzung sichtbar.'],
      ['Welche Kalenderansichten gibt es?', 'Nutzen Sie Wochen-, Monats- und Zeitachsenansicht für unterschiedliche Blickwinkel auf denselben Plan. Die Schichtzeiten bleiben bei einem Ansichtswechsel erhalten.'],
      ['Wie importiere ich einen Monatsplan aus Excel?', 'Öffnen Sie „Monatsplan aus Excel übernehmen“, wählen Sie den Zielmonat und fügen Sie die kopierte Tabelle ein oder laden Sie eine CSV-/Textdatei. Prüfen Sie die Vorschau und übernehmen Sie erst dann. Neue Schichten entstehen als Entwurf; veröffentlichte oder bereits mit Zeiten verknüpfte Datensätze werden geschützt.'],
      ['Was prüfe ich vor dem Veröffentlichen?', 'Kontrollieren Sie offene Stellen, Qualifikationen, Abwesenheiten, Überschneidungen, Ruhezeiten und die Einsatzbereitschaft. Erst nach der Freigabe erscheint der Plan im Mitarbeiterportal.'],
      ['Wie nutze ich Schichtvorlagen?', 'Legen Sie Name, Zeiten und Standardbesetzung als Vorlage fest. Abweichende Tageswerte und individuell angepasste Zeiten können Sie separat pflegen.']
    ],
    employees: [
      ['Welche Daten pflege ich im Mitarbeiterprofil?', 'Neben Personal- und Kontaktdaten können Sie Team, Qualifikationen, zulässige und bevorzugte Schichten, Verfügbarkeit, Wochenstunden und Arbeitszeitmodell pflegen.'],
      ['Wie richte ich einen wiederkehrenden Tagesrhythmus ein?', 'Öffnen Sie Mitarbeiter → Profil → Feste Schichtregel. Wählen Sie „Tagesrhythmus (Arbeiten / Frei)“, setzen Sie den Starttag und fügen Sie die Blöcke nacheinander hinzu. Die Vorlage „4 Arbeiten · 3 Frei · 3 Arbeiten · 2 Frei“ ergibt einen 12-Tage-Zyklus, der danach neu beginnt.'],
      ['Was bedeuten „Bevorzugen“ und „Verbindlich“?', '„Bei der Planung bevorzugen“ liefert eine Planungshilfe. „Verbindlich einhalten“ sperrt abweichende manuelle Einplanungen und wird von der Auto-Planung berücksichtigt. „Arbeiten“ erlaubt freigegebene Schichten, erstellt aber noch keine Schicht.'],
      ['Wie funktioniert eine feste Arbeitswoche?', 'Wählen Sie „Feste Arbeitswoche (Montag bis Sonntag)“, setzen Sie als Start einen Montag und legen Sie für jeden Wochentag Frei, alle zulässigen oder eine konkrete Schicht fest.'],
      ['Warum kann ich jemanden nicht einplanen?', 'Prüfen Sie Aktivstatus, Schichtfreigabe, Qualifikation, genehmigte Abwesenheit, Doppelbelegung, Stundenlimits und gegebenenfalls eine verbindliche Rhythmusregel.'],
      ['Wie erhält ein Mitarbeiter Zugang?', 'Pflegen Sie die E-Mail-Adresse im Profil und nutzen Sie die Einladungs- beziehungsweise Zugangsverwaltung. Der Login muss zum zugeordneten Mitarbeiterprofil passen.']
    ],
    time: [
      ['Was ist geplant und was ist tatsächlich?', 'Geplante Zeiten stammen aus dem Dienstplan. IST-Zeiten dokumentieren die tatsächlich erfasste Arbeit. Prüfen Sie Abweichungen und Korrekturen, bevor Sie den Monat abschließen.'],
      ['Wie korrigiere ich eine Zeiterfassung?', 'Öffnen Sie den betroffenen Eintrag im Bereich Zeiterfassung, prüfen Sie Beginn, Ende und Pausen und speichern Sie die berechtigte Korrektur. Prüfen Sie anschließend das Stundenkonto.'],
      ['Was zeigt das Stundenkonto?', 'Es stellt die erfassten beziehungsweise bestätigten Zeiten dem Soll gegenüber und zeigt den Saldo für den gewählten Zeitraum.'],
      ['Was sehe ich mit dem Zugang „Nur Zeiterfassung“?', 'Dieser Zugang öffnet ausschließlich den Bereich Zeiterfassung. Dort sind die Zeitansicht und die QR-Buchungen mit Suche, Datumsfilter und Pausendetails verfügbar. Dienstplanung und Mitarbeiterverwaltung sind für diese Rolle gesperrt.'],
      ['Warum lässt sich ein Monat nicht abschließen?', 'Die Abschlussprüfung nennt offene Einträge oder ausstehende Bestätigungen. Klären Sie diese Punkte und starten Sie den Abschluss erneut.']
    ],
    qr: [
      ['Wie legt die Verwaltung eine QR-Stempelstation an?', 'Öffnen Sie Zeiterfassung → QR-Stempelstationen. Inhaber und Administratoren können Name und Standort erfassen, das Terminal anlegen und den aktuellen QR-Code über „QR anzeigen“ jederzeit erneut öffnen, als PNG speichern oder drucken.'],
      ['Wie erfasst ein Mitarbeiter seine Zeit per QR?', 'Scannen Sie den aktuellen Code am Standort mit der Smartphone-Kamera oder dem Scanner im Mitarbeiterportal. Auf der Buchungsseite melden Sie sich mit Personalnummer und Eintrittsdatum im Format TTMMJJJJ an. Tippen Sie auf „Arbeitszeit beginnen“, für jede Pause auf „Pause beginnen“ und „Pause beenden“ und am Schluss auf „Arbeitszeit beenden“.'],
      ['Wie viele Pausen sind möglich?', 'Pro QR-Buchung sind bis zu zehn einzeln dokumentierte Pausen möglich. Nach der zehnten Pause können Sie die Arbeitszeit beenden. Die QR-Ansicht zeigt Beginn und Ende jeder Pause.'],
      ['Werden QR-Pausen bezahlt?', 'Im derzeitigen QR-Ablauf wird die bezahlte Zeit zwischen Arbeitsbeginn und Arbeitsende nicht um Pausen gekürzt. Die Pausendauer wird zusätzlich getrennt ausgewiesen.'],
      ['Brauche ich eine geplante Schicht?', 'Die Buchung an einer QR-Stempelstation funktioniert unabhängig von einer zuvor eingeplanten Schicht. Planungsverantwortliche sehen diese Buchungen im gesonderten Bereich „QR-Buchungen ohne Schichtbezug“.'],
      ['Wo sehe ich QR-Zeiten und Pausendetails?', 'Öffnen Sie Zeiterfassung → „QR-Buchungen ohne Schichtbezug“. Filtern Sie nach Mitarbeiter oder Personalnummer und einem Datumsbereich; unter „Details“ sehen Sie Standort sowie bis zu zehn einzelne Pausen. Ein Filter darf höchstens 63 Tage umfassen.'],
      ['Wie erneuere, deaktiviere oder lösche ich einen Code?', '„QR erneuern“ macht den alten Ausdruck sofort ungültig. „Deaktivieren“ stoppt die Nutzung des Terminals; der gespeicherte Code kann weiterhin angezeigt werden. Ein deaktiviertes Terminal lässt sich nach Sicherheitsabfrage endgültig löschen, sofern ihm keine Zeitbuchungen zugeordnet sind. Diese Verwaltung ist Inhabern und Administratoren vorbehalten.'],
      ['Warum funktioniert ein QR-Scan nicht?', 'Prüfen Sie, ob der Code zum richtigen, aktiven Terminal gehört und noch aktuell ist. Erlauben Sie dem Browser den Kamerazugriff oder öffnen Sie den Code mit der normalen Smartphone-Kamera. Im Demo-Modus wird kein echter Buchungsvorgang gespeichert.']
    ],
    absence: [
      ['Wie erfasse oder beantrage ich Abwesenheit?', 'Wählen Sie Art, Mitarbeiter und Zeitraum. Mitarbeitende können ihre Anträge im Portal stellen; die Verwaltung bearbeitet sie im Bereich Abwesenheiten.'],
      ['Wann beeinflusst ein Antrag die Planung?', 'Genehmigte beziehungsweise freigegebene Abwesenheiten werden in der Planung berücksichtigt. Prüfen Sie einen Antrag und bereits bestehende Schichten vor der Entscheidung.'],
      ['Was geschieht bei einer bestehenden Schicht?', 'SchichtFunk markiert den Konflikt. Prüfen Sie Ersatz oder Änderung und kontrollieren Sie die Besetzung danach erneut; die Schicht verschwindet nicht stillschweigend.']
    ],
    auto: [
      ['Welche Regeln nutzt die Auto-Planung?', 'Sie prüft unter anderem Aktivstatus, Schichtfreigaben, Qualifikationen, Abwesenheiten, Doppelbelegungen, SOLL-Stärken und verbindliche Rhythmusregeln.'],
      ['Werden Vorschläge sofort übernommen?', 'Nein. Erstellen Sie die Vorschau, prüfen Sie die vorgeschlagenen Mitarbeitenden und verbleibenden offenen Positionen und übernehmen Sie erst die passenden Vorschläge.'],
      ['Was prüfe ich nach der Übernahme?', 'Kontrollieren Sie SOLL/IST, Ruhezeiten, Wochenstunden, Schichtänderungen und die Einsatzbereitschaft, bevor Sie den Dienstplan veröffentlichen.']
    ],
    reports: [
      ['Welche Auswertungen gibt es?', 'Je nach Bereich sehen Sie SOLL/IST, Arbeitsstunden, Abwesenheiten, Auffälligkeiten, Stundenkonten sowie die eigenständige Übersicht der QR-Buchungen.'],
      ['Wie exportiere ich Monatsberichte?', 'Im Monatsbereich der Zeiterfassung können Sie einen Mitarbeiter oder die Gesamtauswertung auswählen und als Excel oder PDF exportieren. Prüfen Sie vorher den gewählten Monat und die Daten.'],
      ['Wie funktioniert der DATEV-LODAS-Export?', 'Der DATEV-Export erstellt LODAS-Bewegungsdaten aus den geprüften Monatswerten und den hinterlegten Lohnarten. Kontrollieren Sie Monat, Personalnummern und Zuordnungen; unvollständige Angaben werden vor einem Export gemeldet.'],
      ['Warum weichen Zahlen voneinander ab?', 'Vergleichen Sie Zeitraum, Veröffentlichungsstatus, IST-Bestätigung und Datenquelle. QR-Buchungen ohne Schichtbezug erscheinen in einer eigenen Übersicht und sollten bei der Monatsprüfung separat beachtet werden.']
    ],
    settings: [
      ['Wo ändere ich SOLL-Stärken?', 'Öffnen Sie Einstellungen und pflegen Sie die globale Standardbesetzung je Schichtart. Einen abweichenden Bedarf legen Sie für den einzelnen Tag separat fest.'],
      ['Wo ändere ich die allgemeinen Schichtzeiten?', 'Die Schichtvorlagen und Standardzeiten finden Sie in den Einstellungen. Individuell bearbeitete Zuordnungen müssen Sie gesondert prüfen.'],
      ['Welche Rollen gibt es bei der Zeiterfassung?', 'Inhaber und Administratoren verwalten QR-Terminals. Planung und Disposition können je nach Berechtigung die QR-Auswertung sehen; „Nur Zeiterfassung“ erhält die Zeitansicht und QR-Buchungen, aber keinen Zugriff auf die übrigen Planungsbereiche.'],
      ['Wie schütze ich meinen Zugang?', 'Nutzen Sie ein eigenes Passwort und die angebotene Mehrfaktor-Absicherung für geschützte Verwaltungsaktionen. Teilen Sie Zugangsdaten nicht und melden Sie sich an gemeinsam genutzten Geräten ab.'],
      ['Was dokumentieren Audit-Logs?', 'Sie helfen dabei, relevante Änderungen und deren Zeitpunkt nachzuvollziehen. Prüfen Sie Berechtigungen und Aufbewahrungsfristen regelmäßig.']
    ],
    portal: [
      ['Was finde ich im Mitarbeiterportal?', 'Je nach Freigabe finden Sie Übersicht, Ersatzanfragen, Schicht-Marktplatz, Meine Schichten, Schichtänderungen, Schichttausch, Arbeitszeit, Abwesenheiten, Stundenkonto, Lohnvorschau und Mein Profil.'],
      ['Wann sehe ich meine Schichten?', 'Das Portal zeigt die eigenen veröffentlichten Schichten. Prüfen Sie bei fehlenden Einträgen die richtige Anmeldung und ob der betreffende Zeitraum freigegeben wurde.'],
      ['Wie nutze ich Schichttausch oder Marktplatz?', 'Öffnen Sie die betreffende Schicht, stellen Sie die vorgesehene Anfrage und warten Sie die erforderliche Prüfung beziehungsweise Freigabe ab. Eine Anfrage ändert den veröffentlichten Plan noch nicht sofort.'],
      ['Wo starte ich den QR-Scanner?', 'Auf dem Smartphone finden Sie „QR-Code scannen“ in der Übersicht und im Bereich Arbeitszeit; die mobile Schnellnavigation bietet zusätzlich „QR-Scan“. Halten Sie die Kamera auf den SchichtFunk-Code am Einsatzort.'],
      ['Wie erfasse ich Urlaub?', 'Stellen Sie den Abwesenheitsantrag im Portal und verfolgen Sie seinen Status. Erst die Freigabe wird für die Planung wirksam.']
    ],
    appearance: [
      ['Wie schalte ich Hell und Dunkel um?', 'Nutzen Sie den Sonne/Mond-Schalter im Kopfbereich des Managerbereichs. Die Auswahl wird auf diesem Gerät gespeichert und beim nächsten Öffnen wieder angewendet.'],
      ['Kann ich SchichtFunk auf dem Startbildschirm nutzen?', 'Das Mitarbeiterportal bietet eine Installationshilfe für die mobile Web-App. Auf unterstützten Geräten können Sie SchichtFunk zum Startbildschirm hinzufügen.'],
      ['Was tun, wenn die Kamera in der PWA nicht startet?', 'Erlauben Sie den Kamerazugriff für die SchichtFunk-Seite. Alternativ scannen Sie den QR-Code mit der normalen Kamera des Smartphones und öffnen den erkannten Link.']
    ],
    trouble: [
      ['Ich kann mich nicht anmelden.', 'Prüfen Sie E-Mail-Adresse, Passwort und die richtige SchichtFunk-Seite. Nutzen Sie bei Bedarf die Passwort-Zurücksetzung oder wenden Sie sich an die Administration.'],
      ['Eine Änderung wird nicht gespeichert.', 'Prüfen Sie Pflichtfelder, Zeitraum, Berechtigung und Cloud-Verbindung. Notieren Sie bei wiederholten Fehlern Bereich, Zeitpunkt und genaue Meldung.'],
      ['Der aktuelle QR-Code ist nicht auffindbar.', 'Inhaber oder Administratoren öffnen Zeiterfassung → QR-Stempelstationen → „QR anzeigen“. „QR erneuern“ nur wählen, wenn der alte Ausdruck ungültig werden soll.'],
      ['Der Zeiterfassungszugang sieht keine Planung.', 'Das ist die vorgesehene Beschränkung der Rolle „Nur Zeiterfassung“. Die eigenständigen QR-Buchungen sind im Bereich Zeiterfassung sichtbar. Für Änderungen an Terminals ist eine Administratorrolle nötig.'],
      ['Wie melde ich einen Fehler?', 'Notieren Sie Bereich, Zeitpunkt, Schritte und Fehlermeldung ohne sensible Daten. Senden Sie niemals Passwörter oder vollständige Mitarbeiterdaten.']
    ]
  }
};
