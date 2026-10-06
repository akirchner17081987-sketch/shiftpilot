# Mitarbeiterkarten und Filterleiste – SF-02

Die Mitarbeiterübersicht presste ihre Karten in eine begrenzte Flex-Liste. Dadurch waren Karten niedriger als ihre Texte und schnitten Namen, Rollen und Qualifikationen ab. Gleichzeitig war die Summe der festen Filterbreiten größer als die linke Spalte; die Felder überlagerten die Detailansicht.

## Änderung

- Karten behalten ihre natürliche Höhe und werden im Listenbereich gescrollt, ohne zusammengeschoben zu werden.
- Name/Rolle, Wochenstunden/Verfügbarkeit/Monatsanzahl und Qualifikationen haben eigene Layoutbereiche. Lange Texte und Qualifikationscodes umbrechen; keine dieser Angaben wird auf schmalen Bildschirmen ausgeblendet.
- Kartenschriftgrößen verwenden `rem`; die vergrößerte Schrift kann mitwachsen. Auf besonders schmalen Karten steht der Text unter dem Avatar über die volle Breite. Einzelne gefilterte Treffer haben keine zusätzliche Listenhöhenbegrenzung.
- Die beschrifteten Filter passen sich an die verfügbare Listenbreite an. Bei wenig Platz steht das Profil unter der Liste. Auch der Profilkopf kann lange Namen umbrechen.
- Reihenfolge, Filterregeln, Statusänderungen und Speicherabläufe bleiben erhalten. Die Prüfung der Namensreihenfolge akzeptiert jetzt zusätzliche Klassen am Namen.
- Der Versionsparameter der Mitarbeiterverwaltung lautet `20261006-cards1`.

## Prüfung

- IONOS-Stand: 481 bestehende Funktionstests und 5 IONOS-Tests erfolgreich; statischer Build und `git diff --check` erfolgreich.
- Vercel-Stand: 60 gezielte Regressionstests einschließlich Teamfilter erfolgreich; statischer Build erfolgreich.
- Neue eigenständige Browserprüfung in GitHub Actions mit echten Anwendungsstyles und Mitarbeiterverwaltungsmodulen, 28 erfundenen Profilen, besonders langen Namen/Rollen und 14 Qualifikationen. Keine Anmeldung, Backend-Anfrage oder Datenspeicherung ist Teil dieser Testansicht.
- Geprüft werden Karten- und Textgrenzen, Filtergrenzen, Profilkopf, horizontale Überläufe und die Kombination von Suche, Status, Verfügbarkeit, Team und Qualifikation.
- Testmatrix: heller/dunkler Modus, 1920/1440/1366/1180/1024/768/390/320 CSS-Pixel und 16/24 Pixel Grundschrift (32 Fälle).

Browserprüfung: **32 bestanden, 0 fehlgeschlagen** (GitHub Actions Lauf `37391859088`, Chromium, 42,1 Sekunden). Alle gemessenen Karten-/Textgrenzen und Filtergrenzen lagen innerhalb ihrer Bereiche; kein horizontaler Überlauf. Die Filterkombinationen liefen ohne Datenspeicherung und ohne zusätzliche Netzwerkanfragen. Die private angemeldete Sitzung und das Mitarbeiterportal werden mit diesem Test nicht live abgenommen.
