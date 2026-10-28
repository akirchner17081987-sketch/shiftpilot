# Kundenstart, Support und Vertragsende

Stand: 28.10.2026. Betriebsanleitung und ausfüllbare Abnahme; kein unterschriebener Kundenvertrag und keine Zusage einer 24/7-Bereitschaft.

## Kundenblatt vor dem ersten Echtbetrieb

| Feld | Einzutragender Nachweis |
|---|---|
| Kunde und Mandant | Firma, Anschrift, Mandanten-ID; getrennte Zuordnung prüfen |
| Weisungsberechtigung | Ansprechpartner und unabhängiger Rückruf-/Bestätigungskanal |
| Datenschutz | Hauptvertrag, ausgefüllte AVV mit Anlagen, TOM, VVT/Kundenblatt, Beschäftigteninformation; erforderliche Mitbestimmung/DSFA prüfen |
| Rollen | Benannter Owner und Stellvertretung, Administratoren und begrenzte Teamleiterrechte; persönliche Konten |
| Zugangsabnahme | Owner/Admin richten 2FA ein; Mitarbeiter sieht ausschließlich erlaubte eigene Daten; ausgeschiedener Nutzer erhält keinen Zugriff |
| Fristen | Schriftliche Kundenfreigabe des Fristprofils, abweichende Pflichten und Legal Holds; keine pauschale Löschung aller Daten nach einer Einheitsfrist |
| Betrieb | Verantwortlicher und Vertretung für Störung/Datenschutz, erreichbare Kontaktwege, vereinbarte und tatsächlich betreute Servicezeiten |
| Sicherungen | Aktueller erfolgreicher DB-Backupnachweis, abgenommener Restoreweg und unabhängige Dateisicherung inklusive Audit-Archive |
| Rückgabe | Exportumfang, Empfänger, sicherer Übergabeweg, vereinbarte Abruffrist und Löschweisung |

Die vorhandene Kunden-AVV-Vorlage wird durch `documentation/build_customer_avv_template.py` erzeugt. Platzhalter müssen vor Verwendung ausgefüllt werden. Eine Anbieter-AVV ersetzt die Kunden-AVV nicht.

## Einführung und Abnahme

1. In einem Testmandanten mit fiktiven Daten Anmeldung, 2FA und Rollen erklären. Keine gemeinsamen Kennwörter oder realen Personalakten für Schulungen verwenden.
2. Standorte, Verträge, Qualifikationen, Arbeitszeitmodelle und Fristen gemeinsam prüfen. Import zunächst als Vorschau; Personalnummern und Mandant vergleichen.
3. Einen Planvorschlag berechnen, offene Dienste und Gründe prüfen, Änderungen vergleichen und erst durch den zuständigen Planer übernehmen/veröffentlichen.
4. Mitarbeiterportal öffnen: nächster Dienst, Änderungen, Abwesenheitsantrag und Zeitkonto. Eine Testbenachrichtigung nur nach ausdrücklicher Zustimmung an ein bestimmtes Testgerät senden und Empfang/Öffnen bestätigen lassen.
5. Einen fiktiven Ausfall mit Ersatzvorschlag bearbeiten; Zeitkorrektur mit Grund erfassen; Nachweise im Audit prüfen.
6. Berechtigten Monats-/CSV-/Excel-Export erklären. Ein Monatsbericht ist kein vollständiger Mandantenexport oder Vollbackup.
7. Hilfe über das Fragezeichen oder Strg/Cmd+K aufrufen. Suche, Kategorien und Schrittanleitungen zeigen. Der aktuelle Browserprüflauf besteht auf vier Ansichten einschließlich 320-Pixel-Breite; 258 Artikel in 22 Kategorien.
8. Kunde dokumentiert Ergebnis, offene Abweichungen, Verantwortliche und Freigabedatum. Bei offenen Backup-/Zugriffsgrenzen keine vollständige Betriebsabnahme bestätigen.

## Supportprozess

Öffentlich vorhandener Kontakt: `info@schichtfunk.de`. Dieser Kontakt ist keine Garantie einer fortlaufend überwachten Notfallhotline. Reaktionszeiten und Vertretung werden erst nach tatsächlicher personeller Besetzung vereinbart.

Eine Anfrage enthält: Kunde/Mandant, Zeitpunkt mit Zeitzone, Bereich, erwartetes und tatsächliches Ergebnis, technische Vorgangskennung und Auswirkung. Keine Passwörter, Sitzungstokens, QR-Geheimnisse, Diagnosen oder vollständigen Personalakten per E-Mail anfordern. Screenshots vor Übergabe auf erforderliche Angaben begrenzen; Zugriff auf Originaldaten nur nach dokumentierter Berechtigung und Weisung.

| Priorität | Behandlung |
|---|---|
| P1: vermutete Offenlegung, Zugriff auf fremde Daten, Totalausfall | Incident eröffnen, Zugriff/Schaden begrenzen, Beweise geschützt sichern, Betreiber und benannte Kundenkontakte unverzüglich einbeziehen; Incident-Runbook verwenden |
| P2: Kernablauf blockiert | Reproduktion mit fiktiven Daten, betroffene Version und sicheren Umgehungsweg dokumentieren, nächsten Statuszeitpunkt vereinbaren |
| P3: Bedienfrage oder Verbesserung | Hilfe verlinken, reproduzierbare Anforderung aufnehmen, Rückmeldung dokumentieren |

Als Auftragsverarbeiter meldet SchichtFunk Datenschutzverletzungen dem Verantwortlichen unverzüglich. Die Bewertung einer Behördenmeldung und der möglichen 72-Stunden-Frist liegt beim Verantwortlichen; nicht erst 72 Stunden mit der Kundeninformation warten. Siehe `incident-response-runbook-2026-09-13.md`.

## Datenrückgabe und Vertragsende

1. Weisung und Identität über den hinterlegten Kontakt prüfen; Mandant und Umfang unabhängig gegenprüfen. Abruffrist, Aufbewahrungspflichten und Legal Holds schriftlich festlegen. Das bestehende Konzept sieht ein Exportfenster von höchstens 30 Tagen vor; eine konkrete Frist ist im Kundenvertrag festzuhalten.
2. Änderungen nach einem vereinbarten Stichtag stoppen; temporären berechtigten Exportzugriff und Zugriffssperre getrennt planen. Mitarbeiterzugänge, Einladungen, Push und Sitzungen nach Austritts-/Vertragsweisung sperren; keine Konten anderer Mandanten entfernen.
3. Rückgabepaket: Stammdaten/Verträge, Standorte/Modelle/Regeln, veröffentlichte und erforderliche Entwurfspläne, Soll-/Ist-Zeiten und Monatsfreigaben/Korrekturen, Abwesenheiten/Anträge/Wünsche, relevante Historie sowie Dokumentdateien und benötigte Audit-Archive. Tabellen als CSV/JSON mit Schema-/Zeit-/Zeitzonenbeschreibung; Dateien mit Pfadzuordnung, Größe und SHA-256-Manifest. Geschützte Daten nur an ausdrücklich berechtigte Empfänger. Zugangsschlüssel, Passworthashes, andere Mandanten und nicht benötigte Anbieter-/Systemgeheimnisse ausschließen.
4. Vor Übergabe Vollständigkeit je Datenkategorie, Mandantentrennung, Stichproben und Datei-Hashes prüfen. Die vorhandenen Monats-/Dienstplan-/Auditexporte decken nur Teilmengen ab. Eine vollständige Mandantenrückgabe erfordert bis zu einer gesondert implementierten Exportfunktion einen kontrollierten Betreiberexport; diese Anleitung behauptet keinen vorhandenen Voll-Exportknopf.
5. Nur über einen freigegebenen verschlüsselten Übertragungskanal mit überprüftem Empfänger und befristetem Zugriff bereitstellen; keine realen Kundendaten in GitHub, Testartefakten oder öffentlichen Dateilinks ablegen. Abruf und Empfang bestätigen lassen.
6. Löschvorschau, genehmigtes Fristprofil, Legal Holds und getrennte Freigaben prüfen. Bestehende Lifecycle-/Löschabläufe verwenden; keine ungeprüfte Kaskadenlöschung. Aktive Daten, Dateien, Audit-Generationen, Push, QR und ausschließlich diesem Kunden gehörende Auth-Verknüpfungen berücksichtigen.
7. Nachweis über gelöschte/weiter aufbewahrte Kategorien und Rechts-/Weisungsgrund erstellen, ohne gelöschte Inhalte erneut zu protokollieren. Backupkopien innerhalb ihrer tatsächlichen Fristen auslaufen lassen und Löschsperrverzeichnis bei einem Restore erneut anwenden. Sofortige Entfernung aus unveränderlichen Backups nicht versprechen.
8. Temporäres Exportpaket, Zugang und Arbeitskopien nach Ablauf löschen; Kunde erhält Abschluss mit verbleibenden Fristen und offenen Ausnahmen.

## Noch durch den Betreiber zu besetzen

- Verantwortlicher und erreichbare Vertretung für Betrieb/Datenschutz sowie betreute Servicezeiten.
- Freigegebenes unabhängiges Backup-/Übergabeziel, AVV, Region, Aufbewahrung und Zugang.
- Konkretes Kundenblatt und ausgefüllte/vereinbarte AVV, Fristprofil, Exportfrist und Empfänger beim jeweiligen Kundenstart.

Grundlagen: DSGVO Art. 28 Abs. 3 Buchst. g (Rückgabe/Löschung), Art. 32 (Sicherheit/Wiederherstellbarkeit), Art. 33 (Vorfallmeldung): https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679
