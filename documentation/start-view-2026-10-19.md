# Verwaltungsstart auf der Tagesübersicht

Die Verwaltung startet nach einer neuen Anmeldung auf „Tagesübersicht“. Das gilt
auch beim erneuten Laden eines Dokuments mit wiederhergestellter Sitzung. Eine
gespeicherte Planungsansicht darf den Start nicht mehr überschreiben.

Ursache waren drei konkurrierende Vorgaben: die im HTML aktive Planung, die beim
Laden gespeicherte Ansicht und zeitversetzte Workspace-Snapshots während des
Anmeldeaufbaus. Das HTML beginnt nun auf Übersicht; die produktive Startnavigation
setzt beide Ansichtsspeicher auf Übersicht zurück. Snapshots und Wiederherstellung
laufen erst innerhalb eines bereiten Verwaltungsbereichs. Eine erneute Anmeldung
im selben Dokument setzt die Startansicht ebenfalls zurück.

Innerhalb derselben laufenden Sitzung werden die aktuelle Ansicht und der
Workspace weiterhin bei Tab-/Fensterwechseln erhalten. Mitarbeiterportal,
expliziter Zeitkonto-Einstieg, eingeschränkte Zeiterfassungszugänge und bestehende
Berechtigungsgrenzen bleiben maßgeblich. Die lokale Demo darf weiterhin ihre
gespeicherte Ansicht wiederherstellen. Es gibt keine Änderung an Supabase-Auth,
Mitgliedschaften, MFA, Datenbank oder produktiven Nutzerdaten.

Die sieben gezielten Tests in `tests/landing-view.test.cjs` prüfen gespeicherte
Planung beim Start, unbereite Snapshots, Fokuswechsel, erneute Anmeldung,
Zeitkonto-Einstieg, Mitarbeiterabgrenzung, Demo und blockierten Browserspeicher.
Die Browserprüfung der vollständigen Seite startet mit alten Planungswerten in
beiden Speichern und prüft die Tagesübersicht für Inhaber, Admin und Planer.
Zusätzlich prüft sie Planung nach Fokuswechsel sowie Tagesübersicht nach Reload.
Ihre synthetische Anmeldung öffnet jetzt wie die echte Anmeldung `B.pendingView`,
statt den Fehler durch eine fest vorgegebene Übersicht zu verdecken.
