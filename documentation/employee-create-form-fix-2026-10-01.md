# Mitarbeiter anlegen: Entwurf und Profilreiter

Die vorherige Neuanlage erzeugte bei jedem Profil-Render neue Standarddaten. Auch beim Wechsel zu Qualifikationen, Einstellungen oder Abwesenheiten wurde für neue Profile weiterhin die Übersicht angezeigt. Dadurch gingen Eingaben verloren. Ohne bearbeitbare Schichtfreigaben konnte die Teamvalidierung den ersten Speichervorgang blockieren.

Ein neues Profil verwendet nun einen gemeinsamen Entwurf innerhalb des aktuellen Unternehmens. Stammdaten, individuelle Wochenregel oder Tagesrhythmus, Team, Sollstunden, Schichtfreigaben und Planungsgrenzen bleiben beim Reiterwechsel erhalten. Qualifikationen und Einstellungen können vor dem Anlegen bearbeitet und in den Entwurf übernommen werden. Übersicht enthält den abschließenden Anlegen-Button und Abbrechen.

Planung, Arbeitszeiten und Abwesenheiten zeigen vor dem Anlegen einen Hinweis und einen Rückweg zur Übersicht. Sie benötigen ein gespeichertes Mitarbeiterprofil. Nach erfolgreichem Anlegen stehen diese Bereiche normal zur Verfügung. Fehler scrollen die sichtbare Meldung in den Bildbereich. Fehlgeschlagene Cloud-Speicherung behält den Entwurf; erfolgreiche Speicherung fügt genau ein Profil zur lokalen Liste hinzu. Abbrechen und Unternehmenswechsel verwerfen den nicht gespeicherten Entwurf.

Die feste Wochenregel verwendet die Schichtcodes des aktuellen Unternehmens, sodass auch FD, SD und ND bei neuen Profilen wählbar sind.

Die Browserprüfung verwendet reale Formular- und Persistenzmodule mit fiktiven Backend-Daten. Sie prüft Neuanlage mit Team und Freigaben, alle sechs Reiter, Planungsgrenzen und Sollstunden, fehlgeschlagenes Speichern und Wiederholen, ein individuelles FD-Wochenmodell, Abbrechen und Unternehmenswechsel im Hell- und Dunkelmodus auf Desktop und Smartphone. Keine echten Mitarbeiter werden für die Prüfung angelegt.
