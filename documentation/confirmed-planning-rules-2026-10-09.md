# Bestätigte Planungsregeln — 09.10.2026

Status: Am 09.10.2026 bestätigt. Die technische Umsetzung ist in diesem Änderungsstand enthalten; die Veröffentlichung erfolgt nach erfolgreicher CI-Prüfung.

## Stunden und Schichtanzahl

- Die allgemeine Obergrenze beträgt 190 Stunden pro Kalendermonat. Das persönliche Monats-SOLL bleibt davon getrennt; niedrigere persönliche Grenzen bleiben zu berücksichtigen.
- Im 10-Stunden-Modell plant die Auto-Planung höchstens 18 Schichten pro Mitarbeiter und Kalendermonat.
- Im 8-Stunden-Modell wird nach den Vertragsstunden geplant. Bei Vollzeit sind bis zu 23 Schichten beziehungsweise 184 Stunden möglich. 23 Schichten sind keine pauschale Freigabe für Teilzeit.
- 180 Stunden bleiben das Vollzeit-Ziel. Eine Freigabe von bis zu 184 Stunden im 8-Stunden-Modell bedeutet nicht, dass jeder Mitarbeiter automatisch 184 Stunden erhält.
- Dienste werden einmal nach ihrem lokalen Startdatum gezählt. Die Stundenobergrenze ist auch mit den tatsächlichen Zeitanteilen im jeweiligen Kalendermonat einschließlich Nachtdiensten vom Vormonat zu prüfen.

## Arbeitsblöcke und Erholung

- Höchstens vier Dienste am Stück.
- Zwischen Arbeitsblöcken mindestens zwei freie Kalendertage und mindestens 48 tatsächliche Stunden Ruhe.
- Nach einem Nachtdienstblock mindestens drei freie Kalendertage.
- Höchstens drei Nachtdienste am Stück. Dies wird eine feste Grenze, kein bloßes Optimierungsziel.
- Möglichst dieselbe Schicht innerhalb eines Blocks; Wechsel bevorzugt Früh → Spät → Nacht.
- Gesperrte Wechsel bleiben gesperrt, insbesondere O3 → O1/O2/TL am Folgetag.
- Ein freier Kalendertag ist ein örtlicher Kalendertag ohne Arbeitszeit. Das Ende einer Nachtschicht liegt noch auf einem Arbeitstag; freie Starttage allein reichen für die bestätigte Regel nicht aus.
- Regeln werden auch über Monatsgrenzen und Zeitumstellungen geprüft.

## Wochenmaximum

- Höchstens 40 Stunden je Kalenderwoche (Montag bis Sonntag).
- Die Wochenobergrenze ist verbindlich. Andere Wochen mit weniger Stunden erlauben keine Überschreitung.
- Ist das Monatsziel bei diesen Grenzen nicht erreichbar, zeigt der Planer die Zielabweichung und verbleibenden offenen Bedarf. Stundenversorgung oder Vollbesetzung heben die Grenzen nicht auf.

## Freiwillige Zusatzdienste

- Im Schicht-Marktplatz dürfen Mitarbeiter freiwillige Zusatzdienste über die automatische Schichtanzahl hinaus anfragen.
- Eine Übernahme benötigt eine Planerfreigabe.
- 190 Stunden, die feste Wochenobergrenze, Erholungszeiten, höchstens vier Dienste am Stück, höchstens drei Nachtdienste und gesperrte Wechsel bleiben verbindlich.
- Eine Anfrage allein ändert den Dienstplan nicht.

## Feste Vorgaben und Konflikte

Feste Mitarbeiter- und Teamregeln werden zuerst berücksichtigt. Widersprechen sie den verbindlichen Belastungsgrenzen, wird der Konflikt angezeigt und der betreffende Dienst offengelassen. Eine bestehende oder neu erstellte Vorschau darf solche Konflikte nicht stillschweigend übernehmen.

## Unterschiede zum bisherigen Projektstand

- Die Dokumentation vom 08.10.2026 sieht 190 Stunden und 18 Dienste nur für SchichtFunk vor; die Unterscheidung von 10- und 8-Stunden-Modellen ist dort noch nicht beschrieben.
- Die bestehende Erholungspolitik verwendet freie Starttage und enthält eine Ausnahme für kurze OT-Blöcke mit nur einem freien Starttag und elf Stunden Ruhe. Diese Ausnahme ist mit dem bestätigten Beschluss abzugleichen und darf die neue Mindest-Erholung nicht umgehen.
- Drei Nachtdienste sind bisher ein gewichtetes Optimierungsziel. Künftig sind sie eine feste Grenze.
- Die sichtbare Auto-Planungsoberfläche nennt noch 220 Stunden beziehungsweise 2–5 Dienste; diese Angaben widersprechen dem neuen Beschluss.
- Die Hilfe erklärt die neuen Grenzen und ihre Priorität bisher nicht ausreichend.

## Erforderliche Umsetzung und Prüfung

1. Dieselbe Regelbasis in Auto-Planung, manueller Zuordnung, Vorschauübernahme und Marktplatzfreigabe verwenden; serverseitige Prüfungen einbeziehen.
2. Stunden- und Schichtgrenzen je Schichtmodell sowie Nachterkennung anhand des Modells bestimmen.
3. Bestehende Entwürfe auf Konflikte prüfen und die Ergebnisse anzeigen; keine automatische Veröffentlichung oder Löschung vorhandener Dienste.
4. Oberfläche, Planungsassistent und Hilfe-Center mit den tatsächlich durchgesetzten Regeln abgleichen.
5. Grenzfälle prüfen: 18/19 Dienste bei zehn Stunden; 23/24 Dienste bei acht Stunden; persönliche Teilzeitgrenzen; 190 Stunden einschließlich Monatsüberhang; vier/fünf aufeinanderfolgende Dienste; drei/vier Nächte; Erholung nach Nachtende; Wochenwechsel und 40-Stunden-Grenze; Monatswechsel; Sommer-/Winterzeit; Zusatzdienst und widersprechende feste Regeln.

Die Implementierung umfasst gemeinsame Clientprüfungen, verbindliche Datenbankprüfungen, genehmigte Marktplatz-Zusatzdienste und aktualisierte Hilfetexte. Grenzfälle sind in JavaScript und PostgreSQL als reproduzierbare Tests enthalten.
