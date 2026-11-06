# Produktionsnahe Testumgebung – Stand 06.11.2026

Die isolierte Supabase-Datenbank `multi-company-productionlike-validation` (`ulnyoanzjywbpuprfcaq`) wurde aus dem Produktionsprojekt erstellt. Sie enthält keine kopierten Produktivdaten. Ihre 360 historischen Migrationen entsprechen der erfassten Produktionshistorie. Für datenabhängige historische Migrationen wurden ausschließlich synthetische Testunternehmen, fiktive Mitarbeiter, Schichtmodelle und harmlose Platzhalter für einen Hintergrunddienst angelegt. Zeitgesteuerte Jobs sind in der Testdatenbank deaktiviert.

Der Schemaabgleich zeigte trotz identischer Migrationshistorie Abweichungen:

- Zusätzliche permissive UPDATE-Richtlinie `company_members_update` für `public.company_members` in der Testdatenbank; sie ist in Produktion nicht vorhanden.
- `public.manager_list_company_users(uuid)` hat in der Testdatenbank einen anderen `search_path` als in Produktion.
- Eine zusätzliche private historische Audit-Backup-Tabelle mit zugehörigem Index befindet sich nur in der Testdatenbank.

Im ersten Abgleich wurden abgesehen von der zusätzlichen Tabelle die gleichen 660 Funktionen gefunden; nur die genannte Funktion unterschied sich im Funktionsvergleich. Die Testkopie ist wegen der Abweichungen nicht als gleichwertig zu bezeichnen. Ein Versuch, die Richtlinie zu entfernen und die Funktion anzugleichen, wurde zweimal durch eine abgelaufene Bestätigungsanforderung des Datenbankwerkzeugs beendet. Keine erfolgreiche Angleichung wurde beobachtet. Die zusätzlichen Maßnahmen und Unterschiede müssen vor der gemeinsamen Prüfung erneut untersucht werden.

Die Kombination aus abgesicherter alter Mitarbeiteridentität und unternehmensbezogenen Tausch-/Marktplatzfunktionen zeigte in isolierten Tests einen Fehler: die globale Zugangskontrolle blockierte Mehrfachprofile vor der unternehmensbezogenen Prüfung. Der Entwurf wurde korrigiert. Gezielte Tests mit fiktiven Daten prüfen Lesen, Erstellen und Ablehnen sowie fremde und gesperrte Profile. Diese Tests bilden nur Teile des Schemas nach und ersetzen keine vollständige Prüfung der isolierten Supabase-Datenbank oder einen Browser-End-to-End-Test auf diesem Stand.

Es wurde keine Produktionsmigration ausgeführt. Der produktionsnahe Portalstand und die vollständige Kombination aus Einladungen, Rollen, Zugriffsregeln und Portalaktionen sind weiterhin offen.
