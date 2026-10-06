# QR-Buchungen: Verwaltungskorrektur und Verbindungsfehler

## Bedienung

In der Zeiterfassung die QR-Details öffnen. Unter der einzelnen Buchung steht
„Dienst nachträglich abschließen“ bei offenen Buchungen beziehungsweise
„QR-Buchung korrigieren“ bei bereits beendeten Buchungen. Die Funktion ist auch
im separaten QR-Buchungsbericht verfügbar.

Die Verwaltung trägt tatsächlichen Beginn, tatsächliches Ende und eine
Begründung ein. Vorhandene Pausen können berichtigt werden. Bei einer offenen
Pause schließt ein leeres Pausenende die Pause zum eingetragenen Dienstende.
Pausen bleiben vollständig bezahlt. Es wird keine Endzeit vorgeschlagen oder
aus dem Dienstplan übernommen.

Inhaber, Administratoren, Disponenten, Planer und die Rolle „Zeiterfassung“
dürfen Buchungen ihres Unternehmens korrigieren. Abgeschlossene Zeitmonate
müssen vor einer Korrektur kontrolliert wieder geöffnet werden. Das
Änderungsprotokoll enthält Bearbeiter, Zeitpunkt, Begründung, bisherige und neue
Zeiten einschließlich Pausen. Die ursprünglichen Stempelereignisse bleiben als
Belege erhalten. Die zentrale Zeiterfassung verwendet die korrigierten Zeiten.

## Verbindungsfehler

Jeder Buchungsversuch besitzt eine zufällige Kennung. Der Server speichert sie
mit dem Stempelereignis und führt denselben Versuch nur einmal aus. Bei einer
verlorenen Antwort fragt die Seite den aktuellen Status und die Bestätigung
dieses konkreten Versuchs ab. Ein bloß erreichbarer Server ist keine Bestätigung.

Nach spätestens 20 Sekunden endet das Warten auf eine einzelne Anfrage. Ist das
Ergebnis weiter ungeklärt, bleiben neue Buchungen gesperrt. „Buchungsstatus
prüfen“ liest erneut den Serverstand; „Buchung erneut senden“ wiederholt dieselbe
Kennung. Abmelden bleibt möglich. Es gibt keine automatische Offline-Buchung.
Beim Zurückkehren zur Seite und nach Wiederherstellung der Verbindung wird der
Status aktualisiert. Abgelaufene Anmeldungen behalten ihren erklärenden Hinweis.

## Technische Prüfgrenzen

Die Korrektur verwendet denselben Mitarbeiter-Lock wie QR-Buchungen sowie die
Monats-Locks des Zeitabschlusses. Ein Snapshot-Fingerabdruck verhindert das
Überschreiben zwischenzeitlicher Änderungen. Zeitintervalle, Überschneidungen
und vollständige, gültige Pausen werden serverseitig geprüft. Der öffentliche
Korrektureinstieg ruft einen geschützten privaten Funktionskern auf; weder
anonyme Benutzer noch fremde Unternehmen erhalten Zugriff.

Tests verwenden ausschließlich fiktive Daten: Ausfallfälle im tatsächlichen
QR-Seitenskript, eine unabhängige PostgreSQL-Datenbank und Chromium mit vollständig
abgefangenen Antworten. Die echten Mitarbeiterbuchungen werden dabei nicht geändert.
