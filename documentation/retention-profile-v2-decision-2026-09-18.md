# SchichtFunk – Fachentscheidung Fristprofil V2

Stand: 18.09.2026

## Verbindliche Betreiberentscheidung

Für den aktuellen SchichtFunk-Mandanten werden Arbeitszeit- und DATEV-bezogene Nachweise ab Ende des jeweiligen Abrechnungs-/Kalenderjahres wie folgt behandelt:

| Datenklasse | Frist | Umsetzung im Profil |
|---|---:|---|
| Ist-Arbeitszeiten einschließlich Korrekturen | 6 Jahre | `timeEvidenceYears: 6` |
| QR-Kommen-/Gehen-Buchungen | 6 Jahre | `timeEvidenceYears: 6` |
| Stundenkonten und Monatsabschlüsse | 6 Jahre | `monthSnapshotYears: 6` |
| DATEV-LODAS-Exportnachweis (Monat, Zeilenzahl, Hash) | 6 Jahre | `datevAuditYears: 6` |
| Generierte DATEV-Datei | keine dauerhafte Serverspeicherung | Kundenaufbewahrung 6 Jahre; 8 Jahre bei Einordnung als Buchungsbeleg |

Nach Fristablauf erfolgt Löschung oder kontrollierte Anonymisierung/Redaktion, soweit kein Legal Hold, keine laufende Prüfung bzw. kein Verfahren und keine dokumentierte längere Kundenregel entgegensteht. Die konkrete rechtliche Einordnung bleibt Verantwortung des jeweiligen Arbeitgebers/Kunden und ist im AVV/Onboarding zu bestätigen.

## Technische Freigabe

Der am 16.09.2026 vorbereitete Entwurf V1 enthält für `timeEvidenceYears` noch 3 Jahre. Er ist fachlich überholt und darf nicht bestätigt werden. Die Admin-Oberfläche sperrt deshalb seine zweite Freigabe.

Der neue AAL2-geschützte Ersatzpfad widerruft V1 revisionssicher und legt V2 mit den freigegebenen Werten an. Dieser Vorgang startet bewusst eine neue 24-Stunden-Abkühlfrist. Die endgültige Aktivierung benötigt danach eine zweite AAL2-Bestätigung in einer neuen Sitzung innerhalb des Sieben-Tage-Fensters. Direkte SQL-Freigaben bleiben ausgeschlossen.

Bis V2 vollständig bestätigt ist, arbeitet die Langfristredaktion weiterhin fail-closed. Die vorhandene Automatik redigiert DATEV-/Audit-Klarinhalte und Monats-Snapshots nach dem freigegebenen Profil. Die spätere physische Löschung oder Anonymisierung der eigentlichen Arbeitszeit-/QR-Nachweise muss vor Fälligkeit der ersten Sechsjahresfrist als eigener, getesteter Datenklassenpfad ergänzt werden; die V2-Freigabe allein löscht keine historischen Zeitbuchungen.

## Rechtsrahmen der Entscheidung

- § 16 Abs. 2 ArbZG: Mindestaufbewahrung bestimmter Arbeitszeitnachweise von zwei Jahren.
- § 41 EStG: Aufbewahrung des Lohnkontos bis zum Ablauf des sechsten Kalenderjahres nach der letzten Eintragung.
- § 147 AO: acht Jahre für Buchungsbelege, soweit die konkrete Datei entsprechend einzuordnen ist.
- Art. 5 Abs. 1 Buchst. e DSGVO: Speicherbegrenzung; keine Aufbewahrung ohne fortbestehenden Zweck oder Pflicht.

Diese Unterlage ist eine technische/fachliche Produktentscheidung und keine individuelle Rechtsberatung.
