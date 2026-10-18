# Persönliches Mitarbeiterportal für Konten mit Verwaltungsrolle

## Fehler und Verhalten

Die Zugangsauswahl änderte bisher nur die URL und den Titel der Anmeldung. Bei einem Konto mit aktiver Verwaltungsmitgliedschaft hatte die hinterlegte Rolle beim Start immer Vorrang. Dadurch führte auch die bewusste Auswahl „Mitarbeiterportal“ zur Verwaltung.

Jetzt entscheidet `bereich=mitarbeiter` über den persönlichen Arbeitsbereich. Der Start prüft zuerst das mit der angemeldeten Benutzer-ID verknüpfte, aktive Mitarbeiterprofil und dessen Unternehmen. Die Mitgliedschaft wird dabei nicht geändert. Im persönlichen Arbeitsbereich gilt für Navigation und Aktionen die effektive Rolle `EMPLOYEE`; Verwaltungsrechte und Personalgesprächsbereiche werden nicht nachgeladen. Die eigentliche Verwaltung startet weiterhin mit der gespeicherten Mitgliedschaft und dem serverseitigen Zugriffsprofil. MFA, Datenbankrollen und RLS bleiben bestehen.

Die eigenen Schichten, Abwesenheiten und Änderungsanträge werden zusätzlich nach Mitarbeiter und Unternehmen eingeschränkt. Das Profil muss zur angemeldeten Benutzer-ID passen, aktiv, freigeschaltet und nicht gelöscht sein. Gesperrte Mitgliedschaften sowie Leser-, Nur-lesen- und reine Zeitverwaltungszugänge erhalten durch die Auswahl keine Mitarbeiterrechte. Fehlt die eigene Verknüpfung, erscheint eine verständliche Meldung statt einer stillen Weiterleitung oder Unternehmensanlage. Reguläre Mitarbeiter erhalten über eine Verwaltungs-URL keine Verwaltungsrechte.

Die bestehende Kontoverknüpfung des gemeldeten Teamleiters wurde ausschließlich lesend geprüft: aktiver Mitarbeiterzugang und aktive Teamleiter-Mitgliedschaft im selben Unternehmen vorhanden. Keine Konto-, Rollen- oder Personaldaten verändert.

## Prüfung

- 1.005 automatisierte Tests erfolgreich, darunter 23 neue Fälle zu Portalwahl, Rollen, gesperrten Zugängen, fehlenden Verknüpfungen und Unternehmensauswahl.
- Neue Browserprüfung: 60 Prüfungen mit tatsächlicher Auswahloberfläche, Anmeldeformular, Rollenauflösung, persönlichem Datenladen und Portalrenderer. Fiktiver Teamleiter mit eigenem Mitarbeiterprofil, beide Wege bei 390 und 1440 Pixeln, Sitzung erneut aufgenommen, keine Verwaltungsdatenabfrage im Mitarbeiterstart.
- Bestehende Zugangsprüfung: 83 Prüfungen bei 320, 390 und 1440 Pixeln einschließlich Zeiterfassung und QR-Wege erfolgreich.
- Statischer Produktionsbuild erfolgreich. Neue Browserprüfung zusätzlich in den IONOS-Build aufgenommen; Cachekennung für die geänderten Module und den Loader angehoben.

Die Browserprüfungen verwenden fiktive Sitzungen und Transportantworten. Es wurde keine Anmeldung mit dem echten Benutzerpasswort ausgeführt.
