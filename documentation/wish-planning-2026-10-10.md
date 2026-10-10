# Wunschplanung mit geschützten Freizeitzusagen

Verwaltung: neuer Bereich **Wunschplanung** für OWNER, ADMIN, PLANNER und DISPATCHER. Aktive Mitarbeiter mit aktivem Portalzugang: eigener Bereich unter Anträge & Zeit. TIME_TRACKING und Demo greifen nicht auf die echten Wunschdaten zu.

## Ablauf und Bedeutung

- Freizeit oder bevorzugte Schicht für 1–31 ganze Kalendertage im Vertragszeitraum und innerhalb der nächsten zwei Jahre einreichen. NORMAL/IMPORTANT; Hinweis freiwillig. Aktive überlappende Wünsche werden abgewiesen. Erfassung durch Verwaltung oder Mitarbeiter, UUID für idempotente Wiederholung, höchstens 50 Einreichungen je Benutzer und Tag.
- OFF/PENDING wird bei Verwaltungsfreigabe PROMISED: ein harter Ausschluss für sämtliche Dienstzuweisungen. Eine Zusage über vorhandenen, nicht stornierten Diensten wird verweigert; zuerst bewusst umplanen. SHIFT/PENDING wird ACCEPTED, eine Präferenz ohne Garantie eines konkreten Einsatzes. Ablehnung braucht mindestens fünf Zeichen als Erklärung.
- ASK_RELEASE durch Verwaltung mit Begründung setzt RELEASE_REQUESTED und behält den Schutz. Ausschließlich der betroffene Mitarbeiter kann freiwillig mit bestätigtem RELEASE freigeben oder mit KEEP beibehalten. PENDING/ACCEPTED können durch den Mitarbeiter WITHDRAWN werden. Entscheidungen und Gründe stehen im Verlauf; keine zusätzliche Push-Mitteilung in dieser Version.
- Keine Abwesenheit, Zeitkontogutschrift oder automatische Wunschgenehmigung.

## Schutz und Nebenläufigkeit

`planning_wish_action`, `planning_wish_bundle`, `planning_wish_feed` sind öffentliche invoker-Wrapper zu privaten autorisierten Funktionen mit leerem Suchpfad. Tabellen haben RLS, keine anonymen Zugriffe und keine direkten clientseitigen Schreibrechte. Portal erhält nur eigene Daten, Verwaltung ausschließlich Firmendaten. Änderungen prüfen Revisionen. Assignment-Trigger und Wunschaktionen verwenden dieselbe Firmen-Advisory-Lock wie Marktplatz und atomare Planersetzung; ein gleichzeitiger Dienst darf eine Zusage nicht unterlaufen. Zeitraum wird bei Erfassung als Zeitstempel in Unternehmenszeitzone eingefroren; Nachtübertrag zählt. Planungsfingerprint umfasst Wunschzustände, sodass eine veraltete Vorschau serverseitig verworfen wird.

Frontend: der ursprüngliche Compliance-Kern berücksichtigt den Schutz, einschließlich früher abgegriffener Funktionsreferenzen. Fehlende Schutzdaten sperren Planung bis zum Neuladen. Auto-Planung und Simulator berücksichtigen Zusagen, Wünsche und historische Belastung. Minimaler Feed/Snapshot ohne Hinweise und Entscheidungsgründe. Firmen-/Benutzer-/Rollenwechsel löschen den lokalen Zustand; verspätete Antworten werden verworfen. Anfragen haben 30 Sekunden Zeitlimit. Neue virtuelle Stellen übernehmen keine persönlichen Wünsche des Referenzprofils.

Wünsche und Verlauf sind in Löschmanifest und Änderungssperre der vollständigen Mitarbeiterlöschung aufgenommen. FK-Kaskaden sind eine zusätzliche Absicherung. Die tatsächlich angewandten Migrationen sind unter den vom Server erzeugten Versionsnummern eingecheckt.

## Erklärbare Fairness

Ansicht: ausgewählter Monat und zwei Vormonate, veröffentlichte Planstunden statt gebuchter Ist-Zeit. Nacht 22–06 Uhr und Samstag/Sonntag zeitanteilig einschließlich Monats-/Sommerzeitgrenzen. Absolute Stunden und je 100 Planstunden; ohne Planbasis keine Quote. Eine Stunde kann in beiden Kategorien zählen.

Wunschquote: je Person/Datum letzte Entscheidung; Zusage/Vormerkung gegen Ablehnung. PENDING/WITHDRAWN ausgeschlossen; RELEASED bleibt als erteilte Zusage erhalten. Misst Entscheidungen, keine tatsächliche Erfüllung jeder Schichtpräferenz. Keine Gesamtbewertung oder Rangliste.

Optimierer: verbindliche Regeln und Pflichtbesetzung zuerst. Geschützte Freizeit harter Ausschluss. Weiche Präferenzen: offener OFF-Konflikt −10, passende SHIFT +8, andere SHIFT −8, IMPORTANT doppelt. Historische Nacht-/Wochenendanteile der drei vollständigen Vormonate werden nur zwischen identischen Schichtfreigabegruppen berücksichtigt. Veröffentlichter Status mit Veröffentlichungszeitpunkt erforderlich; Entwürfe zählen nicht. Der Simulator liest dafür einen eigenen minimalen historischen Feed. Bestehende Stundenbasis erforderlich; relative Mehrbelastung gegenüber gruppengewichteter Quote senkt Präferenz um 2 pro zusätzlicher entsprechender Stunde. Fehlende Daten führen zu keiner angenommenen Gleichheit. Keine Garantie mathematisch optimaler Fairness oder Besetzung. Die Vorschau erklärt passende Wunschtage und Abweichungen.

## Hilfe und Prüfung

Eigene HilfeCenter-Kategorie mit elf Artikeln für Einstieg, Rechte, Zustände, Zusage, Schutz, Freigabeanfrage, freiwillige Freigabe, Fairnessformeln, Wunschquote, Optimierung und Fehlerhilfe. Modul- und Artikelinventar ergänzt; bestehender Hilfe-Test prüft Anzeige und Suche.

Geschäftslogiktests für Intervallgrenzen, Nachtübertrag, Status, DST, Monatsgrenzen, Entscheidungsquote, Priorität, Besetzung vor Präferenz und Vergleichsgruppen. SQL-Rollbackprüfung mit getrennten synthetischen Accounts für Auth/RLS, zwölf verbotene Fälle, echte Rolle authenticated, Zusage, Revision, Fingerprint und Freigabe. Browserprüfung mit echten Assets und synthetischen Antworten für Verwaltungs-/Portalablauf, abgegriffene Compliance-Referenz, fehlgeschlagene/veraltete Antworten und 320–1440px Hell/Dunkel. Produktion prüft denselben Browserablauf vor dem IONOS-Upload; danach vergleicht Live-Prüfung die Asset-Hashes und Cache-Version.
