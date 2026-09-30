# Schichtmodelle je Unternehmen verwalten

Unter **Einstellungen → Planung** können Inhaber, Administratoren, Planer und Disponenten neue Schichtmodelle anlegen, bearbeiten und löschen. Dieselben Aktionen stehen bei den Standardvorlagen im Vorlagenmanager bereit.

Ein Modell erhält ein Kürzel, einen Namen, Beginn und Ende (auch über Mitternacht), eine Farbe und eine globale SOLL-Stärke. Das Kürzel bleibt nach dem Anlegen unverändert. Es darf in verschiedenen Unternehmen jeweils unabhängig verwendet werden. Neue Modelle erscheinen in der Schichtbibliothek und den Mitarbeiterfreigaben. Vor der Einplanung müssen Mitarbeiter für das Modell freigegeben werden.

Löschen wird bestätigt: Unbenutzte Modelle werden vollständig entfernt. Bereits verwendete Modelle werden archiviert und verschwinden aus der aktiven Planung. Bestehende Dienste, Zeiteinträge und Änderungsverläufe bleiben erhalten. Unter **Entfernte Schichtmodelle** können archivierte Modelle wiederhergestellt werden.

Der Katalog kommt aus der Datenbank des ausgewählten Unternehmens; gelöschte Standardmodelle werden beim Laden nicht erneut ergänzt. Eigene Vorlagen und deren Darstellungseinstellungen werden auf dem Gerät nach Unternehmen getrennt gespeichert.

## Prüfung

308 Node-Regressionstests und fünf IONOS-Buildprüfungen bestanden. Transaktionale Datenbankprüfungen unter der authentifizierten Inhaberrolle bestätigen Anlegen, Bearbeiten, Löschen, Archivieren, Wiederherstellen, Schutz vorhandener Dienste einschließlich späterer Cloud-Speicherung, Überschneidungsprüfung, doppelte Kürzel und Unternehmensisolation. Alle Teständerungen wurden zurückgerollt. Browserprüfungen verwenden synthetische Daten und die tatsächlichen Verwaltungsmodule auf Desktop und Mobilgeräten; sie verändern keine Betriebsdaten.
