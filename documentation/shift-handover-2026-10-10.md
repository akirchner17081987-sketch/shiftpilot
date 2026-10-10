# Digitale Schichtübergabe und freigegebener Leistungsbericht

Umsetzung für SchichtFunk auf IONOS, 10.10.2026. Ausgangsstand: `f173bd917d5ebf6f3fe24156583c027b6d1fa3b4`.

## Betrieb

Im Hauptmenü und im Mitarbeiterportal unter **Schichtübergabe**. Der Zeitraum berücksichtigt Schichten, die ihn tatsächlich überlappen, auch laufende Nachtdienste vom Vortag. Eine veröffentlichte Schicht öffnen; gleiche Unternehmens-, Standort-, Schichtcode- und Zeitdaten ergeben einen gemeinsamen Arbeitsbereich. Mitarbeiterzugriff setzt aktiven Mitarbeiterzugang und eine passende veröffentlichte Zuweisung voraus. Die Leitung sieht eigene Unternehmensschichten. TIME_TRACKING und andere Unternehmen sind ausgeschlossen.

Aufgaben, einzelne Checklistenpunkte, Vorkommnisse und Hinweise mit Verantwortlichen, Frist, Ergebnis, Kritikalität und Eskalationsweg. Kritische Punkte brauchen Frist und Eskalationsweg. Erledigung braucht ein Ergebnis. Eskalationsweg und überfällige Punkte werden intern sichtbar; keine automatischen externen Nachrichten. Nachnamen stehen vor Vornamen.

Offene und laufende Punkte gehen einmalig an die früheste passende veröffentlichte Folgeschicht am selben Standort innerhalb von sieben Tagen. Ohne Standort bleibt der Schichtcode gleich. Die konkrete Folgeschicht wird vor der Bestätigung angezeigt und serverseitig nochmals geprüft. Herkunft und Frist bleiben erhalten, Verantwortliche werden im Folgeteam neu zugeordnet. Erledigte Punkte bleiben im Ursprung. Ursprung wird schreibgeschützt; die Übernahme bleibt ausdrücklich ausstehend, bis das Folgeteam oder die Leitung bestätigt.

## Leistungsberichte

Nur Leitung mit Zeitverwaltungsrechten erstellt nach Schichtende einen Entwurf. Geplante Besetzung und Planstunden sind getrennt von abgeschlossenen bestätigten Dienstplan-Zeitbuchungen; unabhängige QR-Zeiten ohne eindeutige Dienstzuordnung, offene Buchungen und unbestätigte Eingaben zählen nicht als bestätigte Leistung. Das kann unvollständige Evidenz bedeuten, nicht fehlende Arbeit.

Punkte sind standardmäßig intern. Die Auswahl für einen Bericht umfasst Titel, Beschreibung, Status, Kritikalität, Frist und Ergebnis; keine automatischen Namen, Personalnummern oder Eskalationskontakte. Freitexte und Prüfvermerk sind vor externem Teilen zu prüfen. Vollständige Inhaltsvorschau, begründete Freigabe oder Ablehnung. Geänderte Berichtsgrundlage blockiert die Freigabe eines alten Entwurfs. Entschiedene Fassungen sind gegen Überschreiben geschützt; neue Daten benötigen eine neue Version. Freigabeakteur und Ereignisakteur sind intern nachvollziehbar gespeichert.

Nur freigegebene Fassungen exportieren PDF oder Text mit Berichtskennung, Version, Datenstand, Freigabezeit und Prüfvermerk. Dateien können mit Geschäftsleitung oder berechtigten Kunden geteilt werden. Keine öffentliche URL, kein automatischer Versand, keine automatische Abrechnung. PDF über die schon im System verwendete jsPDF-Version 2.5.2; Text bleibt als unabhängiger Download verfügbar.

## Datenintegrität und Datenschutz

Private Definer mit leerem Suchpfad und ausdrücklicher Auth-, Mandanten-, Schicht- und Zeitrechteprüfung; öffentliche Invoker. Keine direkten Client-Tabellenrechte, RLS und explizite Deny-Policies. Gemeinsame Unternehmenssperre mit Dienstplan/Marktplatz, Zeilensperren und gemeinsame Revision gegen Parallelüberschreiben. Maximal 32 Tage je Abruf, 200 Punkte und 25 Berichtsversionen je Schicht. Identitätswechsel verwirft verspätete Antworten und löscht vorhandene Daten; kein Zugriff aus Demo oder Zeitrollen.

Die vorhandene endgültige Mitarbeiterlöschung erfasst zugeordnete Punkte, kopierte Punkte, zugehörige Berichtssnapshots und Ereignisse, auch Freigabe-/Erfassungsakteure mit Mitarbeiterlogin. Übernahmezuordnung wird anonymisiert, Zeitstempel und andere Teamarbeitsbereiche bleiben erhalten. Eingaben bei laufender endgültiger Löschung sind gesperrt. Bereits exportierte Dateien unterliegen dem betrieblichen Löschprozess.

13 HilfeCenter-Artikel und vollständige Quellenzuordnung im bestehenden Abdeckungsmanifest. Heute enthält einen Einstieg; geladene Aufgabenkennzahlen benennen Zeitraum und Datenstand.

## Prüfung

- `npm test`: 627 erfolgreiche Tests, einschließlich vorhandener Planungs-, Datenschutz-, Reporting-, Wunschplanungs- und HilfeCenter-Regressionen.
- `npm run test:ionos`: 5 erfolgreiche Tests; statischer Build erfolgreich.
- `tests/sql/shift-handover-rollback.sql`: reale RPC-Grants, synthetische Konten, veröffentlichte Schicht einschließlich Datumsgrenzen und laufendem Nachtdienst, Scope nach Mitarbeiter/Standort/Unternehmen, Pflichtfristen, Verantwortliche, Weitergabe, bestätigte Übernahme, Zeitrechte, Ausschluss interner Punkte, echte bestätigte Zeitnachweise, unveränderliche Versionen, veraltete Datenbasis, 17 Ablehnungsfälle; tatsächliche endgültige Löschung mit Schreibsperre und anonymisierter Übernahme. Alles in einer zurückgerollten Transaktion, keine Produktivdatenänderungen.
- `tests/browser/shift-handover-qa.cjs`: GitHub-Actions-Prüfung mit tatsächlichen Portal-, UI-, Zeitumrechnungs- und CSS-Dateien, synthetischen Backendantworten; Bearbeitung, Freigabe, echte PDF-/Textdownloads, Weitergabe, Mitarbeiterübernahme, Identitätswechsel, Fehler/Rollen, Escaping, 320–1440 px, hell/dunkel.
- Produktionsbuild führt Browserprüfung vor IONOS-Upload aus. Live-Check prüft exakte Asset-Hashes und Cacheversionen gegen denselben Release.
