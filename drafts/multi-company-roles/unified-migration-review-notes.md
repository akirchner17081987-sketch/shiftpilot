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
- Die positive Dienstübernahme wurde inzwischen mit der gesamten Zusammenstellung erfolgreich getestet. Dazu wurden fehlende produktive Planungsfunktionen und Datenbankfelder innerhalb derselben Transaktion aus Produktionsdefinitionen nachgebildet und zurückgerollt. In diesem Test wurden gemeinsame Einladung, zusätzliche Unternehmensfreigabe, Antrag, Planerfreigabe, Diensteintrag und Ablehnung eines Angebots des anderen Unternehmens geprüft. QA ist weiterhin kein vollständiger Produktionsklon.
- Es wurden keine Produktionsdaten verändert. Installation und Test sind kein Beleg für das tatsächliche Ersetzen des Produktionsindexes oder des Anmeldetriggers.

## Vor einer produktiven Migration

1. Alle ersetzten Funktionen und Signaturen sowie Policies und Grants mit dem dann aktuellen Produktionsstand abgleichen. Die Testdatenbank ist kein vollständiger Produktionsklon.
2. Die Entwürfe mit Supabase CLI in eine gültige Migration überführen und die integrierte Migration samt realem Index- und Triggerwechsel in produktionsgleichem Staging testen. Die Abbruchmarkierung darf nicht für einen Produktiveinsatz umgangen werden.
3. Die integrierten Ergebnisse in produktionsgleichem Staging wiederholen; parallele Sitzungen, sämtliche relevanten Portal-RPCs sowie E-Mail-Versand, Bestätigung, Anmeldung und Rollenwechsel vollständig prüfen.
4. Den Rückfallpfad für bereits entstandene Mehrfachprofile testen. Der alte globale Eindeutigkeitsindex lässt sich nach Anlage solcher Profile nicht blind wiederherstellen.


## Nachprüfung Index und Registrierungstrigger

- Der produktionsbasierte Signup-Test `production-signup-triggers-rollback-test.sql` wurde erneut erfolgreich ausgeführt: Der neue Trigger wurde innerhalb der Transaktion gelöscht und neu angelegt; Fälle mit Mitarbeiter- und Administratoranker, falscher E-Mail und wiederverwendetem Token wurden geprüft. Zwei ausschließlich in QA vorhandene Triggerfunktionen wurden für diesen Test vorübergehend neutralisiert; sämtliche Änderungen wurden zurückgerollt.
- Die Abfrage in QA ergab fünf Konten mit mehreren Mitarbeiterprofilen. Daher kann der alte globale Produktivindex dort nicht ohne Änderung bestehender Testdaten nachgebildet werden. Die alte und die neue Eindeutigkeitsregel wurden stattdessen auf zwei isolierten temporären Tabellen geprüft: Die globale Regel lehnt ein zweites Unternehmensprofil ab, die neue erlaubt zwei Unternehmen, aber kein doppeltes Profil innerhalb desselben Unternehmens.
- Der vorbereitete Test des tatsächlichen Indexwechsels auf einer isolierten Tabelle `isolated-index-swap-rollback-test.sql` konnte nicht ausgeführt werden, weil die Datenbankbestätigung ablief. Damit bleibt die konkrete Wechselreihenfolge ungeprüft.
- Der Trigger-Test erstellt Datenbankkonten direkt und prüft weder den echten E-Mail-Versand noch den Login. Die ursprüngliche Triggerlogik verknüpft Profile bereits bei Erstellung eines noch nicht bestätigten Kontos; dass ein Zugriff vor Bestätigung verhindert wird, muss mit echter Authentifizierung nachgewiesen werden.
- QA hatte den Branch-Status `MIGRATIONS_FAILED`; es ist kein vollständiger Produktionsklon. Der Wechsel auf echtem produktionsgleichem Schema sowie Rückfall- und echte Auth-Tests stehen aus.
