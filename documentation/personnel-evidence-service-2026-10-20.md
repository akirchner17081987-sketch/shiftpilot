# Nachweise anfordern und selbst einreichen

Inhaber und Administratoren fordern unter Personal → Mitarbeiter → Nachweise öffnen gezielt einen Nachweis an. Titel, Mitarbeiter, optionales Einreichungsdatum und ein Hinweis bestimmen den Auftrag. Eine bestehende Qualifikation bietet in der Personalakte „Erneuerung anfordern“ mit vorausgewähltem Bezug. Ein aktiver persönlicher Mitarbeiterzugang ist erforderlich.

Im Mitarbeiterportal steht Mein Konto → Meine Nachweise zur Verfügung. Die Glocke führt aus einer Anforderung oder Prüfentscheidung direkt dorthin. Mitarbeiter laden ausschließlich zu einer eigenen offenen Anforderung eine Datei hoch und reichen sie zur Prüfung ein. Dateien: PDF, JPEG, PNG, WebP, 1 Byte bis 10 MB. Die vorhandenen privaten Storage-Bucket-Grenzen gelten zusätzlich.

Die Personalverwaltung lädt die Datei herunter und prüft ihren Inhalt. Eine ausdrückliche Bestätigung übernimmt die Datei mit geprüften Angaben atomar in die Personalakte. Optional wird die angeforderte Qualifikation aktualisiert oder eine neue angelegt. Eine Gesprächsfreigabe wird bei Änderung zurückgesetzt. Schichtfreigaben bleiben gesonderte Entscheidungen. Eine Rückmeldung mit mindestens fünf Zeichen begleitet Übernahme, Nachbesserung und Rücknahme.

## Zustände und Wiederholung

Angefordert → Zur Prüfung → Übernommen oder Nachbesserung nötig → neue Einreichung. Offene Anforderungen können begründet zurückgezogen werden. Die vorherigen Dateiversionen und Rückmeldungen bleiben erhalten; eingereichte Dateien werden nicht überschrieben. Bei unterbrochener Verbindung lässt sich ein reservierter Upload wiederholen oder ein bereits hochgeladener Entwurf über „Vorbereitete Datei einreichen“ absenden. Revisionen verhindern konkurrierende Prüfentscheidungen. Höchstens 20 offene Anforderungen je Mitarbeiter und zehn Versionen je Anforderung. Listen laden 50 Einträge je Seite, offene Anforderungen zuerst; Filter gelten für die geladenen Einträge. Kein automatischer Fristversand und keine automatische Prüfung des Dateiinhalts. Die Demo führt keine echten Nachweisanforderungen aus.

## Zugriff und Datenverarbeitung

Die beiden neuen Tabellen liegen im privaten Schema, mit RLS und ohne direkte Clientrechte. Ein öffentlicher Invoker-Wrapper ruft eine private, ausdrücklich autorisierende Funktion auf. Mitarbeiter benötigen eine aktive eigene Zuordnung im gewählten Unternehmen; gesperrte Mitgliedschaften und reine Zeiterfassungskonten sind ausgeschlossen. Personalaktionen verlangen die bestehende OWNER/ADMIN-Prüfung und MFA/AAL2. Auch Dateizugriffe werden über die bestehenden Personalrechte oder eine exakt für den eigenen Auftrag reservierte Datei geprüft.

Dateien bleiben im vorhandenen privaten Bucket personnel-documents im Pfad Unternehmen/Mitarbeiter/evidence/zufällige-ID. Eine Übernahme benötigt keine Datei-Kopie. Storage prüft beim Einreichen tatsächliche Größe und MIME-Metadaten. Mitarbeiter erhalten keine Update- oder Löschrechte auf Dateien; eine zusätzliche restriktive Policy verhindert das Überschreiben registrierter Versionen auch durch die Verwaltung. Die vorhandene ausdrückliche Dokumentlöschung bleibt möglich. Die Anwendung speichert weder Dokumentinhalt noch Titel oder Rückmeldung im Audit oder Benachrichtigungstext. Die allgemeinen Meldungen verlinken den geschützten Bereich.

Beide Tabellen sind über Mitarbeiter-Fremdschlüssel mit Löschweitergabe an den bestehenden Löschkatalog angebunden und tragen dessen Änderungssperre. Der vorhandene Storage-Löschlauf erfasst den gleichen Mitarbeiterpfad, einschließlich noch nicht übernommener Versionen. Personalakten und Dokumente anderer Mitarbeiter werden im Portal nicht freigegeben.

## Prüfung

`npm run test:evidence` führt die echte Migration und RPCs im isolierten PostgreSQL/PGlite sowie den Ablauf in Chromium aus. SQL prüft Mandantentrennung, Mitarbeiteridentität, Sperrung, Zeitkonten, MFA, Storage-Rechte, Metadaten, Nachbesserung, atomare Übernahme, Revisionen und Löschweitergabe. Die Browserprüfung deckt Anforderung → Einreichung → Nachbesserung → erneute Einreichung → Übernahme bei Desktop, 390 und 360 Pixeln sowie Hell/Dunkel ab, einschließlich ungültiger Dateien, Verbindungsfehler, sicherer Textausgabe und verspäteter Antworten nach Identitätswechsel.
