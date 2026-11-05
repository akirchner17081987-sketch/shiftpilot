# Zusammengeführter Migrationsentwurf – Prüfstand

Status: **Prüfentwurf, nicht für den Produktiveinsatz**. `unified-migration-review.sql` enthält zu Beginn absichtlich einen Abbruch, damit niemand ihn versehentlich als Migration ausführt.

## Inhalt und Auflösung

- 22 vorhandene SQL-Kandidaten und die weitere vorbereitete Prüfung eines gesperrten Mitarbeiters bei Dienstübernahmen wurden in Abhängigkeitsreihenfolge zusammengefasst.
- Die Annahme einer Einladung wird nur durch die Fassung mit Kompatibilität für bestehende Einzel-Einladungen definiert; die ältere Fassung wurde aus der Zusammenstellung entfernt.
- Die Kandidatenliste für Tauschanfragen wird nur durch die jüngere unternehmensbezogene Fassung definiert; die ältere doppelte Definition wurde entfernt.
- Der Indexwechsel steht am Ende. Die Trennung der Daten einzelner Unternehmen, Identitätsfunktionen, Portalaktionen, Einladungen und Verwaltungsfunktionen sind im SQL enthalten.
- Die SMTP-Edge-Funktion und das Frontend sind keine SQL-Migrationen. Ihre vorbereiteten Änderungen müssen separat mit derselben Version ausgerollt und getestet werden.

## Tests auf QA

- Die kombinierte SQL-Zusammenstellung wurde in einer zurückgerollten Transaktion geladen. QA benötigte zuvor drei synthetische restriktive Policies; der bereits vorhandene QA-Anmeldetrigger wurde beibehalten und der globale Produktivindex nicht entfernt. Diese Anpassungen stehen ausschließlich im Testskript.
- In derselben Transaktion wurde die gemeinsame Einladung mit Mitarbeiter- und Administratorrolle angenommen, danach ein weiteres Mitarbeiterprofil freigegeben. Weiterhin wurde ein ausstehender Dienstübernahmeantrag mit fiktiven Daten angelegt, der Mitarbeiterzugang gesperrt und die Freigabe durch die Planung zurückgewiesen. Kein Dienst wurde dafür angelegt.
- Ein Test der positiven Dienstübernahme mit der gesamten Zusammenstellung konnte auf QA nicht durchlaufen: Die produktive Abhängigkeit `private.sf_regional_day_allowed(uuid,uuid,date,text)` existiert dort nicht. Der frühere positive Test nutzte die abweichende QA-Implementierung und beweist nicht die Gesamtintegration der produktiven Implementierung.
- Es wurden keine Produktionsdaten verändert. Installation und Test sind kein Beleg für das tatsächliche Ersetzen des Produktionsindexes oder des Anmeldetriggers.

## Vor einer produktiven Migration

1. Alle ersetzten Funktionen und Signaturen sowie Policies und Grants mit dem dann aktuellen Produktionsstand abgleichen. Die Testdatenbank ist kein vollständiger Produktionsklon.
2. Die Entwürfe mit Supabase CLI in eine gültige Migration überführen und die integrierte Migration samt realem Index- und Triggerwechsel in produktionsgleichem Staging testen. Die Abbruchmarkierung darf nicht für einen Produktiveinsatz umgangen werden.
3. Positiven Dienstübernahmeablauf, Sperrung, parallele Sitzungen, sämtliche relevanten Portal-RPCs sowie E-Mail-Versand, Bestätigung, Anmeldung und Rollenwechsel vollständig prüfen.
4. Den Rückfallpfad für bereits entstandene Mehrfachprofile testen. Der alte globale Eindeutigkeitsindex lässt sich nach Anlage solcher Profile nicht blind wiederherstellen.
