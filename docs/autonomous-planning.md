# Selbständige Auto-Planung

Stand: 22.10.2026. Unternehmensübergreifende Funktion; bestehende Firmen bleiben zunächst deaktiviert.

## Bedienung

In Auto-Planung → Automatikmodus dieses Unternehmens stellen OWNER/ADMIN den monatlichen Tag, die lokale Unternehmenszeit, Startmonat (0–3 Monate voraus), Horizont (1–3 Monate), historischen Vergleich (0–6 Monate) und optionale Nachplanung nach Änderungen ein. Der letzte Tag eines kurzen Monats ersetzt einen nicht existierenden Termin. PLANNER/DISPATCHER dürfen Status und Vorschläge ansehen, Testläufe starten und nicht gespeicherte Läufe beenden. Ein manueller Test erzeugt immer einen Vorschlag, auch wenn die Firma automatische Entwürfe eingestellt hat.

PREVIEW bereitet einen Vorschlag vor. DRAFT speichert nur bei vollständiger Pflichtbesetzung, null kritischen Lücken, bestandenen Abschlussprüfungen und maximal einer Schicht Stundenabstand zwischen gleichem SOLL. Die abschließende Datenbanktransaktion prüft erneut Berechtigungen, Fingerprint, unveränderliche Dienste und alle bisherigen Planungsregeln. Bei einem Fehler wird die ganze Übernahme zurückgerollt und REVIEW angezeigt. Veröffentlichung bleibt separat; veröffentlichte oder abgeschlossene Monate werden nicht automatisch geändert.

## Berechnung und Fairness

Die bestehende Suche arbeitet weiter mit durch den Eingabeaufbau zugelassenen Optionen. Zusätzliche begrenzte Suchen ersetzen bis zu drei Blöcke oder bilden längere Tauschketten. Flexible Blöcke dürfen in bereits einzeln zugelassene Optionen aufgeteilt werden; verbindliche vollständige Arbeits-/Freiblöcke bleiben unteilbar. Basisdienste sind immer unveränderlich. Ein erschöpftes Suchbudget ist kein Unmöglichkeitsnachweis und es wird keine globale Optimalität zugesichert.

Der historische Stundenvergleich berücksichtigt veröffentlichte Plandienste mit Veröffentlichungszeitpunkt, keine Istzeitbuchungen. Vergleichbare Berechtigungsgruppen werden relativ zum persönlichen SOLL verglichen. Bereits berechnete Monate eines Laufs fließen ebenfalls ein. Der begrenzte Ausgleich beeinflusst nur die Auswahl, keine Vertragsziele, harten Grenzen, Abrechnung oder Zeitkonten. Nacht-/Wochenendbelastung und bestätigte Wünsche bleiben weitere weiche Kriterien.

Die Engpassdiagnose berechnet eine optimistische tägliche Zuordnung aus statisch geeigneten Kandidaten. Nur eine Lücke in dieser oberen Kapazitätsgrenze belegt einen entsprechenden Personal-/Qualifikationsengpass. Andernfalls lautet die Einordnung Suche oder kombinierte Regeln; daraus folgt keine Zusage, dass ein vollständiger Plan existiert.

## Serverablauf

Private Tabellen speichern Einstellungen und Läufe, ohne direkten Clientzugriff. Vorbereitungsschritte setzen sich direkt serverseitig fort; der Minutentakt stellt nach Unterbrechungen erneut zu. Der Minutentakt erzeugt idempotente Monatsaufträge und bündelt Änderungen mindestens eine Minute. Datenbanktrigger funktionieren bei geschlossenem Browser. Eigene automatische Schreibvorgänge lösen keine weitere Schleife aus. Abwesenheitsgründe, Namen, Kontakte und Notizen gehören nicht zum neuen Planungssnapshot.

QUEUED → PREPARING (drei Mitarbeiter je gespeichertem Vorbereitungsschritt) → CALCULATING (bestehender checkpointfähiger Hintergrundsolver) → ASSESS_QUEUED → ASSESSING → READY / REVIEW / APPLIED. Fehler und Abbruch ergeben FAILED / CANCELLED. Nach 45 Minuten bzw. 512 Vorbereitungs-/Prüfversuchen endet ein hängender Lauf sichtbar. Pro Firma läuft höchstens eine Berechnung gleichzeitig; monatliche Schlüssel verhindern Doppelaufträge. Jeder Workeraufruf benötigt ein zufälliges, nur privat gespeichertes Auftrags-Capability sowie Lease und Revision. Nur service_role kann Worker-RPCs aufrufen. Zugriffsrechte werden bei Start, Claim, Finish und Übernahme erneut geprüft.

Der Scheduler ruft Edge Functions nur für anstehende Arbeit auf. Eine Änderung über mehr als drei Monate verlangt eine gezielte Prüfung. Daten, Regeln oder Einstellungen, die während der Berechnung geändert werden, verhindern eine automatische Übernahme des alten Datenstands. Nicht unterstützte gemeinsame Besetzungsfenster führen zu REVIEW statt zu einer geschätzten Planung.

## Prüfung

Automatisierte Tests decken mehrgliedrige Tauschketten, Matchinggrenzen, Legacy-Firmen, Mehrmonats-Checkpoints, Zeitzonen/DST, historische Fairness, unveränderliche Eingaben, Rechte/Firmenisolation, Worker-Capabilities/Leases, atomaren Rollback und die UI beim Firmenwechsel ab. Zusätzlich gelten die bestehenden Planungs-, Rhythmus-, Hintergrund-, SQL- und Browserprüfungen.
