# Separater logischer Teil-Restore – 07.11.2026

Status: erfolgreicher, eng begrenzter Test mit fiktiven Datensätzen; kein Nachweis der vollständigen Wiederherstellung einer SchichtFunk-Produktionssicherung.

## Aufbau und Ablauf

Auf dem vorhandenen QA-Zweig `multi-company-productionlike-validation` (`ulnyoanzjywbpuprfcaq`) wurde ein fiktives Unternehmen `QA Restore Probe 20261107` mit zwei künstlichen Auth-Konten (`@example.invalid`), einer Eigentümermitgliedschaft, einem Mitarbeiterprofil, einem Schichtmodell, einem veröffentlichten Testdienst und einem offenen Zeiterfassungsdatensatz angelegt. Es sind keine echten Konten, Passwörter oder Produktivdaten enthalten. Der Zeitdatensatz hatte keine eingetragenen Ist-Zeiten; die Wiederherstellung konkreter Arbeitszeitwerte wurde hier nicht geprüft.

Ausgewählte explizite Felder dieser sieben Bereiche wurden in die lokale JSON-Datei `qa_restore_fiktiv_20261107.json` exportiert und vor dem Import gespeichert. SHA-256: `75d30d05abb672b4a966eba3781324c148df8c86fc1e40254b91d0370bdff9a8`. Die Eigentümermitgliedschaft wurde beim Import mit Rolle OWNER/ACTIVE ergänzt; deren Felder waren nicht Bestandteil des JSON-Exports. Import aus der gespeicherten Datei erfolgte in den separaten Testzweig `multi-company-clean-rehearsal-20261107` (`whthodedymxplgmaooov`). Vorher war geprüft, dass dort kein Testunternehmen oder -konto dieses Namens existierte und keine Cron-Aufgaben aktiv waren. Es wurde keine Datenbank zurückgesetzt oder überschrieben.

## Verifikation

Ein anschließender Vergleich der exportierten Felder im Ziel mit dem gespeicherten JSON ergab Übereinstimmung für beide fiktiven Kontokennungen und -adressen, Unternehmensstammsatz, Mitarbeiterprofil und dessen Kontozuordnung, Schichtmodell, Dienst und offenen Zeitdatensatz. In separaten Transaktionen sah das fiktive Mitarbeiterkonto unter der Datenbankrolle `authenticated` das eigene Mitarbeiterprofil, den Dienst und den Zeitdatensatz; ein fremdes fiktives Konto sah diese drei Datensätze nicht. Dies war eine Datenbank-RLS-Prüfung mit gesetzten Test-Claims, keine echte Anmeldung oder 2FA-Prüfung.

Das fiktive Restore-Unternehmen und die fiktiven Konten bleiben in beiden isolierten Testzweigen als gekennzeichnete Testdaten bestehen. Das ursprüngliche Schema des Zielzweigs und sein globaler Mitarbeiterindex blieben aktiv.

## Grenzen und offene Aufgaben

Dies ist ein logischer Transfer einer kleinen, explizit ausgewählten Datenmenge, kein `pg_dump`/vollständiger Datenbank-Restore, keine Sicherung von Datenbankschema, Grants, Policies, MFA, Kennwort-Hashes, Vault, Storage-Dateien oder Edge Functions. Es wurde ein Mitarbeiterprofil pro Konto wiederhergestellt; ein Mehrfachprofil nach der geplanten Migration und nach dem Sicherungszeitpunkt entstandene Daten wurden nicht übertragen. Es wurde weder der produktive tägliche Backupstand noch ein physischer Backup-Restore geprüft. Die Eigentümermitgliedschaft und nicht exportierte Standardfelder wurden neu erzeugt; folglich ist auch kein byte- oder zeilenidentischer Voll-Restore belegt.

Offen bleiben insbesondere ein kontrollierter echter Wiederherstellungslauf aus einem geeigneten Sicherungsmedium in eine ausreichend abgeschottete getrennte Umgebung, getrennte Storage-Wiederherstellung und Hashprüfung, Test von RLS/Funktionsdefinitionen und Auth-/MFA-Konfiguration sowie ein nachvollziehbarer Umgang mit Änderungen nach dem Sicherungszeitpunkt. Kopierte Cron-/Netzwerkjobs und Vault-Geheimnisse dürfen dabei keine externen Produktivaktionen auslösen. Der Rückfallplan ist weiterhin Entwurf und keine Produktionsfreigabe.
