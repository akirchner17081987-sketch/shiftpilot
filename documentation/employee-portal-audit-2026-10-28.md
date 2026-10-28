# Punkt 4 – Mitarbeiterportal und Benachrichtigungen

Prüfdatum: 28.10.2026. Produktiver Ausgangsstand: PR #203, Commit dcc9cf77a5e50033ffb43539bc3b9b594128dc1f. Die erneute Prüfung erforderte keine Änderung der Produktfunktionen.

## Checkliste

- [x] Vorhandene Funktionen und Zuverlässigkeit prüfen.
- [x] Nächsten und kommende Dienste leicht auffindbar anzeigen.
- [x] Änderungen am Dienstplan verständlich hervorheben.
- [x] Arbeitszeit, Zeitkonto und Abwesenheiten übersichtlich darstellen.
- [x] Wünsche und Anfragen einfach erfassbar machen.
- [x] Funktionsstand von Schichttausch, offenen Diensten und Kalenderintegration prüfen.
- [x] Tatsächliche Zustellung und Öffnen auf Alexanders getestetem Handy bestätigen (Rückmeldung vom 28.10.2026).

## Vorhandene Funktionen und Ergebnis

| Bereich | Ergebnis |
|---|---|
| Persönliche Übersicht | Nächster freigegebener Dienst mit Datum, Uhrzeit, Standort und direktem Detailzugang. Laufender QR-Status wird getrennt dargestellt. |
| Kommende Dienste | Monatskalender und Liste, Monatswechsel, veröffentlichte eigene Dienste, keine Entwürfe. |
| Änderungen | Alte und vorgeschlagene Variante, tatsächlich geänderte Felder gekennzeichnet, Antworten und Verlauf. |
| Arbeitszeit und Zeitkonto | Buchungen, Monats-SOLL, bestätigte Zeiten und Saldo; Monatsverknüpfung bleibt erhalten. Offline-/Fehlerstatus zeigt den letzten bestätigten Stand. |
| Abwesenheiten | Antrag, Status, Freigabe/Ablehnung und Rückmeldung. Urlaubskonto mit Jahresanspruch, Übertrag, bestätigten Tagen und Resturlaub ist vorhanden. Ohne vollständige Stammdaten und geprüfte Anrechnungstage wird der Resturlaub als offen ausgewiesen. |
| Wünsche und Anfragen | Wunschformular, geschützte Freizeitzusagen, Rückfragen, Profilkorrektur und sichtbare offene Aufgaben. |
| Schichttausch und offene Dienste | Vorhanden; Filter nach Datum, tatsächlichem Standort und Eignung, klare nächste Bearbeitungsschritte, Freigabe vor verbindlicher Übernahme. |
| Kalender | ICS-Export des gewählten Monats vorhanden, inklusive Standort, stabiler Kennung und Zeitumstellung. Kein automatisch aktualisiertes Kalenderabo. Ein Abo ist eine zusätzliche Produktentscheidung; der Export aktualisiert sich nicht nachträglich. |
| Benachrichtigungen | Ausdrückliche Aktivierung, Testaktion, Deaktivierung, Fehler-/Berechtigungszustände und iOS-Installationshinweis vorhanden. Technischer Versandweg geprüft. |

Die technische Bestandsprüfung ersetzt keine kundenspezifische Bedarfserhebung für ein Kalenderabo. Im bestehenden Portal bleiben Schichttausch und offene Dienste bereits nutzbar.

## Durchgeführte Prüfungen

- 70 automatisierte Funktions-/Datenbank-/Push-Laufzeittests bestanden (einschließlich zehn Urlaubskonto-Prüfungen): persönliche Übersicht, Monatsdienste/ICS mit Zeitumstellung, getrennte Mitarbeiterdaten, Abwesenheitsanzeige, Wunschplanung, offene Dienste sowie Dispatcher und aktive Empfänger.
- Portal-Browserprüfung bestanden: 13 Bereiche bei vier Ansichten (1440 px dunkel/hell, 390 px dunkel, 360 px hell); Navigation, Filter, Kalenderdownload, Änderungsmarkierungen, Wünsche, Zeitkonto, Abwesenheiten und Kontraste.
- Persönliche Startseite zusätzlich bei vier Ansichten geprüft: nächster Dienst, QR-Anwesenheit und Pause, Aufgaben, Fehlerzustand, Scanner-Einstieg und verspätete Antwort nach Unternehmenswechsel.
- 22 Push-Oberflächenprüfungen bestanden: Aktivierung, verweigerte Erlaubnis, Testaktion, Abmelden, Serverfehler, iOS-Hinweis und Breiten 360/768/1440 px. Geräte-/Provider-APIs simuliert.
- Auf dem vollständigen Produktionsschema, ausschließlich mit synthetischen Datensätzen und vollständigem Rollback: Push-Registrierung/Testwarteschlange/Rate-Limit/Zugriffsschutz; fünf Abwesenheitsarten mit Freigabe, Rückmeldung, Ablehnung und Audit; Wunschplanung mit zwölf Ablehnungsfällen; Schichtangebot mit Genehmigung, Ablehnung und Abbruch.
- Die ältere Abwesenheits-Testdatei wurde an die aktuelle Berechtigung angepasst: Gesundheitsentscheidungen durch einen Inhaber mit MFA; der reine Zeiterfassungszugang darf bereits am Mitarbeiterzugangs-Guard abgewiesen werden. Keine Produktberechtigungen wurden gelockert.

Der vollständige Chromium-Prozess konnte in dieser Testumgebung keinen lokalen Socket öffnen. Der vorhandene Headless-Shell-Prozess führte die Portalprüfungen erfolgreich aus. Das war ein Startproblem der Testumgebung, kein beobachteter Fehler des Portals.

## Produktiver Push-Betrieb (nur aggregiert gelesen)

Push aktiviert, acht aktive Geräteabos für drei Konten. Neun Versandvorgänge mit Status SENT, insgesamt 25 angenommene Zustellungen und keine protokollierten fehlgeschlagenen Zustellungen. Retry-Job aktiv. SENT bestätigt den Versandweg, nicht die Anzeige auf einem realen Handy.

Nach den Rollback-Tests weiterhin acht aktive Abos und neun Versandvorgänge. Keine synthetischen Testkonten verblieben. Während dieser synthetischen Prüfungen wurden keine Nachrichten an echte Mitarbeitende versendet.

## Bestätigter praktischer Gerätetest

Auf ausdrücklichen Wunsch von Alexander Kirchner wurde am 28.10.2026 um 20:37 Uhr (Europe/Berlin) eine einzelne Nachricht „SchichtFunk Push-Test“ an sein verifiziertes Konto bei Secontec Services gesendet. Der Versandweg meldete SENT, vier angenommene Zustellungen und keine Fehler. Anschließend bestätigte Alexander auf die Frage nach Empfang auf dem Handy und Öffnen von SchichtFunk durch Antippen: „Ja das hat geklappt“.

Damit sind tatsächlicher Empfang und Öffnen für dieses Handy bestätigt. Gerätemodell, Betriebssystem, Browser, Sperrbildschirmzustand und WLAN/Mobilfunkwechsel wurden nicht separat angegeben bzw. bestätigt. Die vier angenommenen Zustellungen beweisen keine Sichtprüfung aller vier Geräteabos.

Punkt 4 ist für die geprüften Portalabläufe und die bestätigte Handykonfiguration abgeschlossen. Weitere Gerätekonfigurationen und ein eventuell künftig gewünschtes Kalenderabo sind dadurch nicht mitgeprüft bzw. implementiert.
