# Gesamtprobe für Mehrunternehmen – nur isolierter Test

Stand: 07.11.2026. Dies ist keine Produktionsmigration und keine Freigabe.

Der Generator `scripts/build-multi-company-clean-baseline-test.mjs` kombiniert die 22 bereits in `review-bundle-manifest.json` beschriebenen Kandidaten mit dem separaten Indexwechsel und sieben vorhandenen Datenbanktests. Er kontrolliert die Prüfsummen sämtlicher Eingaben. Die Datenbanktests laufen jeweils in einem eigenen Savepoint; der gesamte Lauf endet mit `ROLLBACK`. Die ursprüngliche und die spätere Definition von `private.claim_multi_company_invite` sind weiterhin im Bundle enthalten: Die spätere Definition gewinnt. Für eine endgültige Migration muss diese Überschreibung aufgelöst und separat geprüft werden.

Die Prozedur verlangt eine ausdrückliche Sitzungsmarkierung und die ursprüngliche Indexkonstellation. Diese Kontrollen beweisen **nicht**, dass die Datenbank isoliert oder produktionsgleich ist. Ziel und vollständige Schema-Baseline sind unabhängig zu überprüfen. Das Skript darf ausschließlich auf einer dafür bereitgestellten, isolierten und getesteten Datenbank ausgeführt werden; nie auf Produktion. Der ausführende Client muss bei SQL-Fehlern abbrechen und das Transaktionsergebnis kontrollieren.

## Aktueller Befund

Die Leseprüfung am 07.11.2026 ergab: Produktion hat 360 Migrationseinträge, den globalen Index und nicht den unternehmensbezogenen Index. Der bisherige Testzweig hat 388 Einträge, den unternehmensbezogenen Index und nicht den globalen. Der alte Testzweig ist daher für die neue Probe auf ursprünglicher Baseline ungeeignet und darf nicht als erfolgreicher Gesamttest ausgegeben werden. Diese Zählung ersetzt keinen Schema-, Rechte- oder Funktionsvergleich.

Lokal bestehen die Generator- und Schutzprüfungen sowie der bereits vorhandene partielle Test für Identität, Zugriffsregeln und Indexwechsel. Sie bilden nur einen Schemaausschnitt nach und beweisen nicht die erfolgreiche Installation des vollständigen Pakets. Der gesamte neue Lauf auf einer sauberen produktionsnahen Baseline ist noch offen. Ebenso offen sind unter anderem echte parallele Sitzungen, QR, Abwesenheit, Marktplatz, ein getesteter Rückfall sowie die finale Entkopplung von doppelten Funktionsdefinitionen.

Für die Testauswertung müssen alle sieben Datenbanktests, die Identitäts- und Sicherheitsfälle sowie der abschließende Rollback belegt werden. Danach sind RLS/Rechte, aktuelle Produktionsdefinitionen und die Migrationsreihenfolge erneut zu prüfen. Es ist insbesondere nicht zulässig, beim Rückfall Mitarbeiterprofile automatisch zu löschen oder zu entkoppeln.
