# Ausgewählten Dienstplanmonat löschen

Unter Planung → Dienstplan die Monatsansicht wählen, den Zielmonat auswählen und „Monat löschen“ öffnen. Der Dialog zeigt Monat, Unternehmen, Zeitraum und Schichtzahlen. Erst die Bestätigung „LÖSCHEN YYYY-MM“ und ein weiterer Klick löschen den ausgewählten Monat. In der Wochenansicht ist die Monatslöschung deaktiviert.

Nur Inhaber und Administratoren dürfen den Vorgang ausführen. Geschlossene Monate und Monate mit erfassten Arbeitszeiten oder QR-Nachweisen werden serverseitig geschützt. Andere Monate, Mitarbeiter, Abwesenheiten und SOLL-Vorgaben bleiben erhalten. Eine Nachtschicht gehört zum lokalen Starttag in der Unternehmenszeitzone.

Marktplatzangebote des gelöschten Monats werden zurückgezogen. Änderungs- und Marktplatzhistorie bleiben mit beendeten Anfragen erhalten. Der Vorgang wird als MONTH_SCHEDULE_RESET protokolliert. Gemeinsame Veröffentlichungswochen mit Diensten des Nachbarmonats bleiben erhalten; ihre Wochenmarkierung sperrt keine geleerten Tage.

Die Oberfläche nutzt preview_schedule_month_reset und reset_company_schedule_month anstelle des bisherigen unternehmensweiten Komplett-Resets. Die Bestätigung bindet sich an den geprüften Monat und das Unternehmen. Ein Wechsel des Unternehmens wird während der Löschung verhindert.

Prüfungen: npm test; node tests/browser/schedule-month-reset-qa.cjs; tests/schedule-month-reset.integration.sql als vollständige BEGIN/ROLLBACK-Transaktion. Die Datenbankprüfung verwendet ausschließlich fiktive Mandanten und entfernt keine produktiven Schichten.

Die Monatsvorschau und Monatslöschung führen keine unternehmensweite Synchronisierung aus. Geschlossene andere Monate werden dadurch nicht erneut geschrieben. Ungespeicherte Schichten im gewählten Monat werden erst nach Bestätigung verworfen; noch nicht gespeicherte Anpassungen an Schichten außerhalb des Monats bleiben nach dem Neuladen erhalten. Ein früherer globaler Synchronisierungsfehler sperrt die Monatsvorschau nicht.
