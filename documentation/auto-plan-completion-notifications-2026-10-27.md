# Fertigmeldungen der Auto-Planung

Die Auto-Planung bietet oberhalb des Starts eine optionale Mehrfachauswahl mit Namen, Rolle und dem aktuellen Push-Status. Aktive Inhaber, Administratoren sowie Planer und Teamleiter mit Planungszugang im selben Unternehmen sind wählbar, einschließlich des eigenen Zugangs. Ohne Auswahl gibt es keine Fertigmeldung. Die Auswahl gilt pro startender Person und Unternehmen; beim normalen Start wird sie atomar gespeichert. Ein eigener Speicherknopf hinterlegt sie vorab, auch für zeitgesteuerte Läufe dieser Person.

Jeder neue serverseitige Lauf übernimmt einen unveränderlichen Empfängerschnappschuss. Änderungen während der Berechnung betreffen erst künftige Starts. Bestehende Läufe werden durch die Einführung nicht nachträglich benachrichtigt. READY, REVIEW, APPLIED und FAILED erzeugen einen eindeutigen, privaten Outbox-Eintrag. CANCELLED löst keine Fertigmeldung aus.

Ein eigener minütlicher Serverjob liest den finalen Status, erstellt einmalig die persönliche Meldung und nutzt die bestehende Web-Push-Zustellung. Üblicherweise erfolgt die Meldung innerhalb einer Minute nach der Abschlussprüfung, zuzüglich Push-Zustellung. Sie unterscheidet vollständige Pflichtbesetzung, verbleibende Lücken, Prüfpunkte und fehlgeschlagene Läufe. Vollständige Besetzung wird nicht als Freigabe oder Veröffentlichung ausgegeben. Der weiterhin erforderliche Prüf- und Übernahmeprozess bleibt bestehen.

Private Tabellen mit RLS, ohne direkte Client- oder Service-Rollenrechte; Zugriff über den bestehenden autorisierten Planungscontroller. Die privaten Hilfsfunktionen haben eine leere search_path und explizite Execute-Grants. Namen sind reine Anzeige, Rollenentscheidungen kommen aus aktiven Unternehmensmitgliedschaften. Ungültige/fremde/gesperrte Empfänger werden beim Speichern abgewiesen und vor Meldungserstellung sowie vor der Push-Zustellung erneut geprüft. Fehler bei der Meldungserstellung bleiben im Outbox-Eintrag für bis zu zehn Versuche; sie setzen das Planungsergebnis nicht zurück.

In-App-Meldung und Push führen über die eigene, per RLS gelesene Meldungs-ID zum betreffenden Unternehmen, Monat und Vorschlag. Ein notwendiger Unternehmenswechsel verwendet den bestehenden Mitgliedschaftscheck und vollständigen Reload. Ein abgebrochener Wechsel entfernt den vorgemerkten Push-Link, um wiederholte Rückfragen zu verhindern.

## Validierung

- 49 lokale Funktions-, SQL-, Rollen-, Push-, Unternehmenswechsel- und CSP-Prüfungen bestanden.
- Zwei Playwright-Prüfungen: Desktop und Handy, Namen/Rollen, Mehrfachauswahl, Speichern, kein horizontaler Überlauf.
- Statischer Build erfolgreich.
- Live-Migration und Push-Dispatcher bereitgestellt. Server-Smoke in einer zurückgerollten Transaktion: eigene Empfängerliste, Speichern, vollständiger bestehender Vorschlag, Outbox, Meldung, verknüpfte Vorschlags-ID und Zustellungsberechtigung erfolgreich. Keine Testnachricht dauerhaft angelegt oder an Personen versendet.
