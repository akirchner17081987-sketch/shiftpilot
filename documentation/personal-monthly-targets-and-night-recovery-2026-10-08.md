# Persönliche Monatsziele und freie Tage bei Nachtblöcken

Für die individuelle 8-Stunden-Planung gelten Arbeitsblöcke von zwei bis höchstens fünf Diensten, Nachtblöcke von zwei bis vier Nächten, ein freier Starttag vor einem Nachtblock und drei freie Starttage nach seinem Ende. Die letzte Nacht endet am ersten freien Tag um 06:00 Uhr. Die Vorschlagssuche und die serverseitige Übernahme prüfen Dezember- und Februar-Randdaten mit.

Das Stundenkonto unterstützt persönliche Monatsziele ab einem ausdrücklich hinterlegten Monatsbeginn. Secontec Services - 8h nutzt diese Methode ab Januar 2027 mit den bestehenden persönlichen Zielen von 180, 162, 144 und 160 Stunden. Frühere Monate behalten die Werktagsberechnung. Teilmonate werden nach aktiven Kalendertagen anteilig gerechnet; die kumulierte Berechnung trennt beide Methoden am Wirksamkeitsdatum. Bestätigte Arbeitszeit und bestehende Abwesenheitsgutschriften bleiben eigenständige Werte. Bezahlte Pausen werden nicht abgezogen.

Die Methodenwahl ist auf OWNER/ADMIN beschränkt. Abgeschlossene betroffene Monate verhindern eine Änderung. Eine ausschließlich zukünftige Methodenänderung ist erlaubt, ohne alte Monatsabschlüsse zu öffnen. Andere Konto-Einstellungen behalten ihre bisherigen Schutzregeln.

Prüfungen umfassen Nachtwechsel, Erholungszeiten über Monatsgrenzen, persönliche SOLL-Werte, zeitanteilige Ein- und Austritte, frühere Monate, die kumulierte Berechnung, Feiertagsanzeige und Berechtigungen. Der neue Januarplan wird als Entwurf gespeichert; eine Veröffentlichung der Dienste erfolgt separat.

## Verification

- 523 Node tests passed.
- New migration and tracked SQL integration passed on isolated PostgreSQL (PGlite 0.5.8).
- Account settings tested at 1440 px and 360 px: missing start date, future-only method update, historical description and blocked closed-period update.
- Employee account tested at 1440 px, 390 px and 360 px, including CSV, navigation, response races and stale data after identity changes.
- Static build passed.

## Live verification

- Company-scoped method activated from 2027-01-01; other company settings unchanged.
- January draft passed the full authenticated server apply operation inside a rollback transaction before saving.
- Saved 464 DRAFT assignments, 0 published; all records compared with the validated proposal.
- Live manager account matches all 23 personal targets (4012 h total).
- New plan: 3712 h, 11 open duties (88 h), total target deficit 300 h; min rest 16 h, max weekly 40 h, max consecutive 5.
- Solver found a feasible plan; optimality and complete coverage are not claimed.

## Final browser regression update

- The prior 17-person fixture no longer reaches its old 429-duty result because night recovery is now mandatory. Tests verify rule validity and calculate the displayed shortage from the proposal, while retaining a coverage floor, fixed FD and weekend staffing checks.
- Both desktop and mobile January browser tests passed, including cancellation and an RPC error that retains all existing duties.
- Planning hours are labelled planned/required coverage, so they are not confused with recorded IST or personal monthly SOLL.
- The existing open-month-end exception remains: a work block can start January 31 and must be continued in February; PN 114 needs this continuation.

## Complete boundary recovery

- Migration 20261008010616 checks complete night islands, including a night block beginning December 31 and recovery after a February 1 night.
- Three additional SQL cases and the matching JavaScript boundary cases passed. The stored 464-duty January draft passed the tightened authenticated server validator again.
