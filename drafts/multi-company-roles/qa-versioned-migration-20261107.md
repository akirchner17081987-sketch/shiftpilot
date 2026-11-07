# Versionierte Integration im isolierten Testzweig – 07.11.2026

## Ergebnis

Die zusammengeführten 22 SQL-Kandidaten und die Indexänderung wurden im isolierten Supabase-Testzweig `multi-company-clean-rehearsal-20261107` (Projekt `whthodedymxplgmaooov`) dauerhaft eingespielt. Der dortige Migrationseintrag lautet `20261107033536 / qa_multi_company_integration_20261107`; MD5 des gespeicherten SQL-Statements: `8b4289a26989e43e04a66afa550eb9fa`.

Diese Testmigration enthält eine zusätzliche QA-Schutzprüfung und ist keine fertiggestellte oder zur Produktion freigegebene Migrationsdatei. Die produktive Datenbank wurde für diesen Schritt nicht geändert. Vor der Ausführung enthielt der Testzweig 360 übernommene historische Migrationen und eine QA-Angleichung; danach 362 Einträge. Die Testumgebung hat weiterhin bekannte Abweichungen vom Produktionsschema, darunter eine zusätzliche private Audit-Sicherungstabelle und eine neutralisierte zusätzliche Policy.

## Prüfung nach dem Einspielen

- Alle acht vorbereiteten Datenbankszenarien aus `clean-baseline-test-manifest.json` liefen gegen den bereits dauerhaft migrierten Testzweig erfolgreich. Die Testszenarien selbst wurden anschließend zurückgerollt; die Migration blieb installiert.
- Der frühere globale Mitarbeiterindex ist nicht mehr vorhanden, der unternehmensbezogene Index vorhanden. Es laufen keine Cron-Jobs. Temporäre Testunternehmen und Testnutzer aus diesem Testlauf sind nicht verblieben; die separat angelegten fiktiven Wiederherstellungsdaten bleiben erhalten.
- Die vier geprüften Funktionen für Einladungsannahme, QR-Buchungen, Abwesenheitsanträge und Marktplatzangebote erlauben `anon` kein Ausführen; `authenticated` besitzt jeweils Ausführungsrechte. Dies ersetzt keine vollständige Berechtigungsprüfung aller Funktionen und Datenzugriffe.
- Zwölf lokale Prüfungen der Zusammenstellung, des Entwurfs und der Mandantentrennung bestanden.
- Der Sicherheitsberater meldet weiterhin Hinweise zu Tabellen mit RLS ohne Policy und zu ausführbaren Security-Definer-Funktionen für angemeldete Nutzer. Die Hinweise wurden nicht als neu oder behoben klassifiziert und müssen vor einer Freigabe einzeln bewertet werden.

## Grenzen und nächste Schritte

Die Browser- und Sitzungsprüfungen auf dem älteren QA-Zweig belegen nicht automatisch den vollständigen End-to-End-Ablauf auf genau dieser Migration. Eine versionierte, für Produktion geeignete Migrationsdatei ist noch zu erstellen und zu prüfen; der Testzweig ist nun bereits migriert und kein unveränderter Ausgangszustand mehr.

Die getrennte Wiederherstellung belegte bislang nur ausgewählte fiktive Anwendungsdaten; eine vollständige Sicherung einschließlich Schema, Authentifizierung und Storage sowie deren sichere Wiederherstellung sind nicht nachgewiesen. Ein Rückbau des alten globalen Index ist nicht ohne Weiteres möglich, sobald mehrere Unternehmensprofile dieselbe Auth-ID verwenden. Produktive Migration, Bereitstellung und Freigabe bleiben offen.
