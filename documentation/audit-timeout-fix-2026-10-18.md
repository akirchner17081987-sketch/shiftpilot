# Audit-Logs: Zeitüberschreitung behoben

Am 18.10.2026 gemeldete Monatsansicht Oktober 2026: `canceling statement due to statement timeout`. Mit aktivem Inhaberkonto und AAL2 auf den echten Daten reproduziert: Abbruch nach 8.013 ms.

Die nachträglich eingeführte restriktive Personalakten-/MFA-Policy führte ihre Definer-Prüfung für jede Audit-Zeile aus. Sie ermittelt nun einmal je Abfrage die zulässigen Unternehmen des angemeldeten Kontos. Bestehende Inhaber-/Administrator-, AAL2-, Lese- und Zeitrollenbeschränkungen bleiben erhalten. Es gibt weder einen RLS-Bypass noch neue Client-Grants oder eine Erhöhung des API-Zeitlimits.

Zusätzlich berechnet ein materialisierter CTE die validierten UUID-Verweise der geladenen Seite vor der Anreicherung. Damit kann PostgreSQL unter RLS den Primärschlüssel der Dienstzuweisung verwenden, statt den Dienstbestand für die Joins abzusuchen. Fehlerhafte UUIDs und Verweise auf andere Unternehmen liefern keine fremden Zusatzdaten. Vollständige Trefferzahlen, Filter, Suche, stabile Seitenmarkierungen und Export-Snapshots bleiben erhalten. Zusätzliche Indizes waren nicht erforderlich.

## Live-Prüfung

`tests/sql/audit-workspace-live-probe.sql`: ausschließlich lesende Abfragen mit aktivem Inhaber/AAL2, Ausgabe nur von Trefferzahlen und Laufzeiten. Je Einzelabruf wird das unveränderte API-Budget von acht Sekunden geprüft. Der äußere Diagnoseblock erlaubt mehrere aufeinanderfolgende Einzelaufrufe.

| Fall | Unternehmen mit 60.666 Ereignissen | Unternehmen mit 33.678 Ereignissen |
| --- | ---: | ---: |
| Oktober, erste 50 | 2.750 ms / 49.017 Treffer | 3.323 ms / 21.761 Treffer |
| Jahr, erste 50 | 378 ms | 203 ms |
| Bereich Planung | 2.503 ms | 1.193 ms |
| Exakte Audit-ID | 129 ms | 93 ms |
| Exportseite, 1.000 Einträge | 510 ms | 1.451 ms |
| Weitere Exportseite, 1.000 | 259 ms | 1.290 ms |

Einzelmessungen, keine garantierten Antwortzeiten. Der ursprüngliche Abbruch wurde mit derselben Monatsauswahl, demselben Kontotyp und acht Sekunden Zeitlimit reproduziert. Der abschließende normale Einzelabruf war ebenfalls erfolgreich.

## Regression und Sicherheit

- 982 Gesamttests erfolgreich; Build erfolgreich.
- Neue Postgres-Tests vergleichen die Policy vor/nach Optimierung mit 15.000 synthetischen Ereignissen: statt mindestens 12.000 Aufrufen der MFA-Prüfung höchstens vier für zwei Leseabfragen. Inhaber/Administrator mit AAL2 bleiben erlaubt; AAL1, Teamleitung, Leser, gesperrte Mitglieder, fremde Inhaber und Anonyme erhalten keinen unberechtigten Zugriff.
- Tatsächliche RPC-SQL mit 1.207 Treffern geprüft: Monatszahl, 1.000+207 vollständige Exportzeilen, gleiche Zeitstempel, keine Duplikate, ältere Suche, Personalnummer/Namen, fremde und ungültige Verweise.
- Bestehende Audit-Browserprüfung erfolgreich: Monats-/Quartals-/Jahresauswahl, Zeitzone, Gruppierung, Feldvergleich, Navigation, vollständige CSV/PDF-Downloads, Wiederholung nach Fehler, Identitäts-/Unternehmenswechsel, Rollen und hell/dunkel bei 390/1440 px.
- Sicherheitsberater unverändert: 55 vorhandene Einzelhinweise, keine neuen Befunde. Keine Audit-Ereignisse oder Personaldaten geändert oder gelöscht.

Produktive Migrationsfolge: `20261018104144`, `20261018104422`, `20261018104502`, `20261018104618`. Der abschließende Stand entspricht `database/audit-permission-scan-v1.sql` und `database/audit-workspace-indexed-enrichment-v1.sql`. Die komplette angewandte Folge ist im Repository enthalten. Die Korrektur wirkt unmittelbar in der Datenbank; die Oberfläche benötigt keinen geänderten Client-Code.
