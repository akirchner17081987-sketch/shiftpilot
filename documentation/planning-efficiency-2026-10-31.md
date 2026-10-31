# Gezielte Ersatzplanung, Fixierungen und Machbarkeitsprüfung

Im Dienstplan bei der Übersicht offener Stellen und in der Auto-Planung stehen „Ausfall nachplanen“, „Machbarkeit prüfen“ und „Laufzeiten“ bereit.

## Gezielte Nachplanung

Die Auswahl einer Person und eines Zeitraums erzeugt eine Ersatzvorschau ausschließlich für deren Dienste. Die Person wird für die gewählten Tage aus der Kandidatenauswahl ausgeschlossen. Es werden direkte Ersatzbesetzungen in der vorhandenen Rangfolge gesucht; andere Dienste werden nicht verschoben. Der gesamte geladene Plan mit Randdiensten wird erneut gegen die vorhandenen Stunden-, Verfügbarkeits-, Rhythmus- und Erholungsregeln geprüft. Suchzeit und Kandidatenzahl sind begrenzt; ein fehlender Vorschlag ist kein Unlösbarkeitsbeweis. Es wird keine Abwesenheit angelegt.

Veröffentlichte Dienste verweisen auf den vorhandenen Störfall-/Freigabeprozess. Fixierte und anderweitig geschützte Dienste erhalten keine automatische Ersetzung. Die Übernahme eines Entwurfsvorschlags synchronisiert und lädt den aktuellen Stand, erzeugt einen Zeitraum-Fingerprint und überprüft Vorschau, Schutzkennungen und Regeln erneut. Reine Entfernungen sind als Vorschau sichtbar. Bleiben Positionen offen, sind ein Bestätigungshäkchen und „OFFEN ÜBERNEHMEN“ nötig; nur dann wird die vorhandene RPC `apply_confirmed_incomplete_draft` verwendet. Andere Vorschläge verwenden weiterhin ihren bisherigen Übernahmeweg. Bestehende SOLL-Werte, Veröffentlichungs- und sonstige Regelprüfungen bleiben erhalten.

## Planerentscheidungen fixieren

Der Diensteditor bietet eine ausdrückliche Fixierung/Entsperrung. Die Spalte `shift_assignments.planner_locked` wird mit einer rollen-, mandanten-, MFA- und versionsgeprüften RPC gesetzt. Der Datenbanktrigger verbietet das Umgehen über direkte Tabellenzugriffe, Änderungen, Löschung oder Stornierung; normale unveränderte Synchronisierung und die Veröffentlichung eines unveränderten Entwurfs bleiben möglich. Bestehende streng autorisierte Datenschutzlöschungen, administrative Komplett-Resets und bestätigte Mitarbeiterentfernungen behalten ihre bisherigen Sonderwege.

Monats- und Zeitraum-Snapshots nehmen Fixierungen in `protectedIds` und den Fingerprint auf. Damit sind auch serverseitige Hintergrund-/Autonomie-Aufträge geschützt. Die lokale Monatsoptimierung behandelt fixierte Dienste als festen Grundplan; Assistenten dürfen sie nicht als beweglich ansehen. Fixierungen sind keine Regelüberschreibung. Der Dienstplan zeigt „Fixiert“; der Editor sperrt Änderungen bis zur ausdrücklichen Entsperrung. Alte Vorschauen mit veraltetem Fingerprint benötigen eine Neuberechnung.

## Vorprüfung und Laufzeiten

Vor einem manuell gestarteten autonomen Planungslauf werden der aktuelle gespeicherte Stand und die Schutzkennungen geladen. Die Vorprüfung zeigt personelle Grenzen, verbindliche Konflikte und fehlende Daten getrennt. Zusätzlich werden die Kandidatenmengen paralleler Tagesbedarfe mittels bipartitem Matching geprüft: getrennt ausreichende Kandidaten können dieselben Personen sein. Vorhandene Dienste lassen sich ergänzen; vor dem Planungslauf wird die Verteilbarkeit beweglicher Entwürfe unter Erhalt geschützter Dienste geprüft. Das ersetzt die anschließende vollständige Berechnung und Abschlussprüfung nicht. Personalmangel verhindert den Start nicht.

Die Vorprüfung ist auf 62 Tage, 500 offene Dienstgruppen und ein Prüfzeitbudget begrenzt. Bei Teilanalysen wird keine unvollständig ermittelte Stundenverfügbarkeit als belastbare Obergrenze ausgegeben. Stunden- und Kandidatengrenzen bleiben optimistische Einschätzungen; vollständige Arbeitsblöcke und gemeinsame Wochen-/Monatsgrenzen können zusätzliche Hindernisse bilden.

Gemessen werden Laden des aktuellen Datenstands, Bedarf, Kandidatenprüfung, gemeinsame Personalgrenzen und Regelprüfung. Die im offenen Browser beobachtete Serverwartezeit enthält Warteschlange und Statusabrufabstand. Es sind keine produktionsübergreifenden Benchmarks oder exakt gemessenen internen Solverphasen. Höchstens 20 Messungen bleiben im Arbeitsspeicher des aktuellen Unternehmens-/Benutzerkontexts; keine Namen, Kennungen oder Messdaten werden extern gespeichert oder versendet.

Kandidatenantworten werden nur innerhalb einer einzelnen Prüfung mit vollständigem Plan-/Regelbezug und begrenzter Cachegröße wiederverwendet. Neue Prüfungen beginnen mit leerem Kandidatencache; Ergebnisarrays werden kopiert. Der Zeitintervallcache enthält höchstens 4.096 reine Datum-/Zeit-/Zeitzonen-Kombinationen und gibt frische Date-Objekte zurück. Änderungen an Daten oder Zeitraum verwerfen die Bestätigung. Es gibt kein Sprachmodell und keinen zusätzlichen externen Dienst.

Prüfung: PostgreSQL/PGlite für Rechte, MFA, Versionen, direkte Umgehungsversuche und Schutz-Snapshots; reine Tests für Matching, Cacheinvalidierung, gezielte Planerhaltung und Zeitberechnung; Desktop/Mobil und Hell/Dunkel für Editor, Abbrechen, Fixierung, Ersatzübernahme, offene Positionen, Vorprüfung und Kontextwechsel. Keine realen Unternehmensdienste werden in den Tests geändert.
