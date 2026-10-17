# Auto-Planung mit bestätigten Erholungsregeln

## Aktualisierung vom 17.10.2026 für das Hauptunternehmen

Für Vollzeitkräfte gilt ein Monats-SOLL von 180 Stunden und eine automatische Obergrenze von 200 Stunden. Eine zusätzliche feste Begrenzung auf 18 oder 23 Dienste entfällt. Der Planer darf das SOLL und die Monatsobergrenze bei einer individuellen manuellen Einplanung mit Hinweis überschreiten. Niedrigere persönliche Vertragsgrenzen bleiben bestehen. Die Auto-Planung prüft weiterhin Stunden einschließlich Monatsübertrag, Wochenmaximum, Erholung und Schichtfreigaben.

Diese Änderung gilt für das operative Hauptunternehmen (in den Stammdaten aktuell „Secontec Services“). Die gesonderte OT1/OT2/OT3-Obergrenze beträgt weiterhin 200 Stunden. An konfigurierten Feiertagen wird OT nach Bedarf besetzt; OT1/OT2/OT3 werden nicht eingeplant, SOLL jeweils 0. Bestehende Dienste werden nicht umgeschrieben.

## Ursprünglicher Stand vom 09.10.2026

Die folgenden Angaben beschreiben den älteren Regelstand; für das Hauptunternehmen haben die obigen Änderungen und die später bestätigten 55-Wochenstunden-/Vier-Nacht-Regeln Vorrang. Andere Unternehmen behalten ihre jeweilige Konfiguration.

Die am 09.10.2026 bestätigte Regelversion 2 gilt für SchichtFunk und Secontec Services – 8h. Andere Unternehmen behalten ihre bisherige Regelversion. Vorhandene Freigaben, Abwesenheiten, persönliche Vertragsgrenzen, feste Rhythmen und geschützte Dienste gelten weiter.

Die Auto-Planung erstellt Vorschauen für einen bis sechs zusammenhängende Monate. Höchstens vier Dienste und drei Nächte am Stück sind verbindlich. Zwischen Arbeitsblöcken liegen mindestens zwei vollständig arbeitsfreie örtliche Kalendertage und 48 tatsächliche Stunden Ruhe; nach Nachtblöcken mindestens drei vollständig freie Kalendertage. Der Tag des Nachtendes zählt als Arbeitstag. Die frühere kurze OT-Ausnahme gilt in Version 2 nicht mehr. Monatsgrenzen und Zeitumstellungen werden berücksichtigt.

Höchstens 40 tatsächliche Stunden je Kalenderwoche Montag–Sonntag, beziehungsweise niedrigere persönliche Wochenlimits, sind verbindlich. Wochen- und Monatsanteile von Nachtdiensten werden zeitanteilig gerechnet. Die Monatsobergrenze beträgt 190 Stunden; Teilzeit bleibt durch niedrigere Vertragsstunden begrenzt. Im 10-Stunden-Modell maximal 18 automatische Dienste; im 8-Stunden-Modell maximal 23 und bei Vollzeit 184 automatisch geplante Stunden. Das Vollzeit-Ziel bleibt 180 Stunden.

Freiwillige Zusatzdienste dürfen nach Planerfreigabe im Marktplatz die automatische Schichtanzahl überschreiten. Eine serverseitig gespeicherte, angewendete Marktplatzfreigabe entscheidet über diese Ausnahme; clientseitige Kennzeichen genügen nicht. Monatsstunden, Wochenstunden und Erholung bleiben verbindlich. Ein verzögerter Datenbanktrigger prüft die endgültige Zuordnung einschließlich dieser Freigabe.

Die vorhandenen unternehmensspezifischen OT-Besetzungsregeln sowie Leitungs- und Pflichtbesetzung bleiben erhalten. Konflikte, Zielabweichungen und offene Dienste werden angezeigt. Die bestätigte Übernahme speichert einen Entwurf; Veröffentlichung ist ein eigener Schritt. Bestehende Dienste werden durch die Regeländerung nicht automatisch gelöscht oder umgeschrieben.

Prüfung: die Anwendungssuite einschließlich `tests/confirmed-planning-rules.test.cjs`, die bestehenden Browserprüfungen sowie `tests/sql/confirmed-planning-rules.sql` für PostgreSQL-Grenzfälle.
