# Mehrunternehmen: Rückfallplan – Entwurf, nicht freigegeben

## Ziel und Grenzen

Personaldaten, angelegte Profile und nach der Umstellung gebuchte Daten bleiben erhalten. Ein pauschaler Rückbau auf den alten globalen Index ist bei Mehrfachprofilen technisch ausgeschlossen. Nicht automatisch Profile löschen, zusammenführen oder Auth-Zuordnungen entfernen. Ein Zurückstellen der Portal-Flags allein ist bei mehreren Profilen ebenfalls kein vollständiger Rückfall: alte nicht unternehmensbezogene Funktionen können Mehrdeutigkeit bewusst ablehnen.

## Vor einer möglichen Freigabe

1. Aktuelle Sicherung von Datenbank, Dateien und Konfiguration samt Wiederherstellungspunkt sicherstellen und eine unabhängige Wiederherstellung in einer getrennten Testumgebung praktisch nachweisen. Änderungen nach diesem Punkt und externe Systeme (z. B. E-Mail, Storage) bei der Entscheidung berücksichtigen.
2. Bereitgestellten IONOS-Stand, Datenbankdefinitionen und Flags versioniert dokumentieren. Einen getesteten Wartungs- und Schreibstopp sowie eindeutige Zuständigkeiten festlegen.
3. `rollback-readonly-preflight.sql` prüfen: Die Zählung umfasst auch deaktivierte und gelöschte Profile, weil der alte Index alle nicht leeren Kontozuordnungen umfasst. Null Mehrfachkonten ist erforderlich, beweist aber noch nicht die Kompatibilität aller übrigen Funktionen oder Daten.

## Im Störungsfall

1. Neue Einladungen und betroffene Schreibvorgänge kontrolliert aussetzen; laufende Vorgänge beenden bzw. ihren Zustand sichern. Team informieren. Bestehende Einträge nicht löschen.
2. Diagnostik und aktuellen Stand sichern; ohne Mehrfachprofile kann ein zuvor separat geprobter Rückbau von Anwendung, Funktionen, Rechten und Index erwogen werden. Reihenfolge und Datenbanklocks müssen zu diesem Zeitpunkt erneut geprüft werden.
3. Sind Mehrfachprofile vorhanden, den globalen Index nicht wiederherstellen und keine automatische Entkopplung durchführen. Datenbankzustand sichern und eine kompatible Korrektur nach vorn oder einen kontrollierten Restore mit Prüfung und Übernahme aller seit der Sicherung entstandenen Daten vorbereiten. Eine reine Wiederherstellung auf einen älteren Zeitpunkt kann neue Buchungen verlieren und ist ohne gesonderte Datenabstimmung kein verlustfreier Rückfall.
4. Nach jeder Wiederherstellung Unternehmens- und Rollenrechte, alte und neue Konten, Einladungen, QR, Abwesenheiten und Planung mit fiktiven Testfällen prüfen; erst danach Schreibvorgänge wieder freigeben.

## Bisheriger Testnachweis

Auf dem isolierten Testzweig wurde das Testpaket mit Mehrfachprofilen in einer Transaktion ausgeführt. Der Versuch, den alten globalen Index bei zwei Profilen eines Kontos zu erstellen, scheiterte erwartungsgemäß; beide Profile blieben erhalten. Nach Transaktions-Rollback war der alte Index wieder vorhanden und die Testdaten waren entfernt. Das belegt die technische Schranke und einen Rücklauf **vor Commit**, nicht einen vollständigen Rückfall nach produktiver Migration. Ein echter Wiederherstellungstest, eine vollständige Funktions-/Rechte-Rücksetzung und der Abgleich seit der Sicherung entstandener Daten bleiben offen.
