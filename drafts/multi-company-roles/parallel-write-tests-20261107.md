# Parallele Abwesenheitsanträge – 07.11.2026

## Umfang

Isolierter Testzweig `whthodedymxplgmaooov`, QA-Migration `20261107033536`, fiktives Konto und Profile der Testbetriebe A und B. Zwei getrennte PostgreSQL-Sitzungen wurden mittels kurzlebiger, selbst entfernender Testaufträge gestartet. Es wurden explizit `authenticated`-Rolle und Test-Claims gesetzt; dies sind Datenbanktests, keine zwei echten Browseranmeldungen oder Auth-Token-Tests. Der zuvor dokumentierte Portaltest mit echter Anmeldung bleibt ein separater Nachweis.

## Gleichzeitige Schreibvorgänge über zwei Unternehmen

Beide Sitzungen schrieben einen Antrag für den 02.02.2027 über `employee_submit_absence_request_for_company`. A begann um 04:36:00.055838 UTC und schrieb um 04:36:00.106412; B begann um 04:36:00.058196 und schrieb um 04:36:00.106187. Beide hielten nach dem Schreiben ihre Transaktion acht Sekunden offen und endeten um 04:36:08.114850 bzw. 04:36:08.114836. Die Transaktionen überlappten damit nach dem jeweiligen Schreiben. Beide Anträge wurden erfolgreich und korrekt dem jeweiligen Unternehmen und Mitarbeiterprofil zugeordnet.

Zuvor waren zwei über den Werkzeugzugang parallel gestartete Anfragen offenbar nacheinander abgearbeitet worden. Diese ersten Anfragen belegen keine Gleichzeitigkeit; ihre fiktiven Anträge am 01.02.2027 bleiben zur Nachvollziehbarkeit im Testzweig.

## Gleichzeitiger doppelter Antrag für ein Profil

Zwei weitere Sitzungen beantragten den 03.02.2027 gleichzeitig für dasselbe Profil in Betrieb A. Beide begannen um 04:37:00 UTC. Eine Sitzung speicherte den Antrag und hielt die Transaktion fünf Sekunden offen; die andere wurde nach Freigabe der Sperre mit der vorgesehenen Überschneidungsmeldung abgewiesen. Datenbankabgleich: genau ein entsprechender Antrag vorhanden. Beide temporären Testaufträge entfernten sich selbst; anschließend waren null Cron-Aufträge aktiv.

## Grenzen und Zustand

Die zusätzlich erzeugten Testanträge bleiben in den fiktiven Unternehmen sichtbar; sie wurden nicht genehmigt. Die temporäre private Ergebnistabelle darf nach Dokumentation und Kontrolle der Testaufträge entfernt werden. Der Test belegt diese Abwesenheitsfälle, nicht die Gleichzeitigkeit sämtlicher Funktionen, Sitzungswiderruf, Wechsel während eines laufenden Schreibvorgangs oder eine vollständige Produktionsfreigabe. Die produktive Umgebung wurde nicht verändert.
