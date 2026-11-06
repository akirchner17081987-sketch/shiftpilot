# Produktionsnahe Testumgebung – Stand 06.11.2026

Die isolierte Supabase-Datenbank `multi-company-productionlike-validation` (`ulnyoanzjywbpuprfcaq`) wurde aus dem Produktionsprojekt erstellt. Sie enthält keine kopierten Produktivdaten. Ihre 360 historischen Migrationen entsprechen der erfassten Produktionshistorie. Für datenabhängige historische Migrationen wurden ausschließlich synthetische Testunternehmen, fiktive Mitarbeiter, Schichtmodelle und harmlose Platzhalter für einen Hintergrunddienst angelegt. Zeitgesteuerte Jobs sind in der Testdatenbank deaktiviert.

Der Schemaabgleich zeigte trotz identischer Migrationshistorie Abweichungen:

- Zusätzliche permissive UPDATE-Richtlinie `company_members_update` für `public.company_members` in der Testdatenbank; sie ist in Produktion nicht vorhanden.
- `public.manager_list_company_users(uuid)` hat in der Testdatenbank einen anderen `search_path` als in Produktion.
- Eine zusätzliche private historische Audit-Backup-Tabelle mit zugehörigem Index befindet sich nur in der Testdatenbank.

Im ersten Abgleich wurden abgesehen von der zusätzlichen Tabelle die gleichen 660 Funktionen gefunden; nur die genannte Funktion unterschied sich im Funktionsvergleich. Der kombinierte Versuch, die Richtlinie zu entfernen und die Funktion anzugleichen, wurde zweimal durch eine abgelaufene Bestätigungsanforderung des Datenbankwerkzeugs beendet. Danach wurde die Funktion separat mit der Produktionsdefinition angeglichen. Die zusätzliche UPDATE-Richtlinie bleibt bestehen, wurde aber reversibel mit `USING (false) WITH CHECK (false)` wirkungslos gemacht. Das ist eine semantische Angleichung, keine identische Richtlinienstruktur; die zusätzliche Audit-Backup-Tabelle bleibt ebenfalls bestehen.

Die Kombination aus abgesicherter alter Mitarbeiteridentität und unternehmensbezogenen Tausch-/Marktplatzfunktionen zeigte in isolierten Tests einen Fehler: die globale Zugangskontrolle blockierte Mehrfachprofile vor der unternehmensbezogenen Prüfung. Der Entwurf wurde korrigiert. Gezielte Tests mit fiktiven Daten prüfen Lesen, Erstellen und Ablehnen sowie fremde und gesperrte Profile. Diese Tests bilden nur Teile des Schemas nach und ersetzen keine vollständige Prüfung der isolierten Supabase-Datenbank oder einen Browser-End-to-End-Test auf diesem Stand.

Auf dem isolierten Testzweig wurden die unternehmensbezogene Identität, fail-closed Altidentität, drei restriktive Leseregeln sowie mehrere Portal-, Zeit-, Abwesenheits-, Tausch- und QR-Kandidaten installiert. Ein Rollback-Test unter `authenticated` mit fiktiven Konten prüfte ein Mitarbeiterprofil in A, eine Administratorrolle in B, die Ablehnung eines fremden Profils und die Sperrung des Mitarbeiterprofils bei erhaltenem Zugang in B. Er bestand. Das ist noch kein Mehrprofiltest: Der globale Produktionsindex ist im Testzweig weiterhin aktiv.

Die Installation des vollständigen Einladungsentwurfs ist erneut an einer abgelaufenen Bestätigungsanforderung des Datenbankwerkzeugs gescheitert. Der Entwurf wurde nicht als installiert verifiziert. Die Testumgebung enthält zudem nur Platzhalter für externe Dienste und Hintergrundaufgaben sind ausgeschaltet.

Es wurde keine Produktionsmigration ausgeführt. Der produktionsnahe Portalstand und die vollständige Kombination aus Einladungen, mehreren Mitarbeiterprofilen, Rollen, Zugriffsregeln und Portalaktionen sind weiterhin offen.
