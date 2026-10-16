# Hilfe-Center-Funktionsabgleich – 16.10.2026

Geprüfter Ausgangsstand: `codex/ionos-migration`, Commit `80485ff`.
Die aktive Hilfe enthält **221 Artikel in 21 Kategorien**. Gegenüber den
211 vorhandenen Artikeln wurden **zehn ergänzt und acht Antworten überarbeitet**.
Die 201 JavaScript-Module unter `assets/` sind im Quelleninventar erfasst.

## Änderungen

- Aktuelle Anmeldung mit Globus, überspringbarer Animation und ruhigem Übergang;
  Strg/Cmd + K öffnet tatsächlich die Hilfesuche.
- Eigene Artikel zu Prioritätsfiltern und Seiten im Handlungsbedarf sowie zu
  Standorten ohne verifizierte Kartenposition.
- Getrennte Anleitungen für Vorschauänderungen, orange IST/SOLL-Felder und den
  Übernahmestatus einschließlich bereits gespeichertem Entwurf mit Ladefehler.
- Eigene Erklärung aufsteigender/absteigender Dienste und des vorhandenen
  Planungskontexts an Monatsgrenzen. Gelöschte Dienste werden nicht erfunden;
  feste Rhythmen und Startdaten bleiben maßgeblich.
- Präzisierte Nacht-Erholung: Schlaftag und vollständig freie Tage sowie die
  gesonderte Freigabe für genau drei Nächte im 4/3/3/2-Modell.
- Getrennte Antworten zu Vertrags-SOLL und Obergrenzen, OT1/OT2/OT3 gegenüber
  normaler OT, Feiertagsausschluss, Teamleiterzielen und festen Wochenvorgaben.
- Die vorher sehr langen Sammelantworten zu Planungsregeln und Übernahme wurden
  gekürzt. Die vertieften Erklärungen sind als eigene Suchtreffer erreichbar.

## Abgrenzung und bestehende Abdeckung

Geprüft wurden außerdem die vorhandenen Themen Dienstplan, Mitarbeiterrhythmen,
Zeiterfassung und QR, Abwesenheiten, Planungsassistent, Personalsimulator,
Wunschplanung, Auswertung/DATEV, Portal, Darstellung/PWA, Fehlerhilfe,
Schicht-Marktplatz, Störfall-Autopilot, Personalakten, Rollen/MFA, Audit und
Schichtübergabe. Diese Themen bleiben in der bestehenden Struktur erhalten.
Die Anleitung beschreibt vorhandene Bedienabläufe; Unternehmensregeln,
Personalzuordnungen, Berechtigungen und operative Datensätze wurden nicht geändert.

Konkrete monatliche oder wöchentliche Werte werden nicht aus früheren
Gesprächen als aktuelle Mandanteneinstellung behauptet. Beispiele sind als
Beispiele gekennzeichnet. Geschützte unternehmensbezogene Antworten werden
weiterhin nur für die authentifizierte aktuelle Firma geladen und escaped.

## Geschützte Unternehmensantworten

Die Prüfung der tatsächlich geladenen Hilfe ergab zusätzliche veraltete
Antworten aus der privaten Unternehmenskonfiguration. Diese überschreiben
die öffentlichen Artikel nach der Anmeldung. Deshalb wurden zusätzlich
**13 geschützte Antworten** anhand der aktuell gespeicherten Unternehmensregeln
berichtigt: sieben im Hauptunternehmen, sechs im separaten Acht-Stunden-Modell.
Wochen- und Nachtgrenzen, Sonderprofile, OT-Gruppen, Feiertage und Erholung
werden dabei unternehmensbezogen beschrieben. Die Planungsregeln selbst
wurden nicht geändert. Eine erneute Datenbankabfrage bestätigte für beide
Unternehmen null Abweichungen zu den vorbereiteten Antworten. Interne
Personalzuordnungen wurden nicht in den öffentlichen Code übernommen.

## Pflege und Prüfung

`help-center-feature-coverage.json` enthält die aktuelle Fragenliste und
Quellen zu den Ergänzungen/Korrekturen. Bisher uneinheitliche Auditdaten und
Zähler wurden auf den aktiven Inhalt abgestimmt; die bestehenden Tests prüfen
diese Konsistenz jetzt mit. Die Kartendateien sind fachlich der Tagesübersicht
zugeordnet. Die Inhaltsdatei hat eine neue Cache-Version in `index.html`.

Die automatisierten Prüfungen führen den aktiven Renderer aus, öffnen jede
Kategorie, suchen jeden ergänzten Artikel und prüfen Quellen, Abbildungen und
die Grenze zwischen öffentlichen und geschützten Antworten. Zusätzlich wird
die statische Veröffentlichung gebaut. Alle 830 bestehenden Tests bestanden, ebenso die sieben gezielten
Hilfe-/Mandantenschutzprüfungen und der statische Build (4,14 MiB).
Der Veröffentlichungsstatus wird im Arbeitsabschluss berichtet.

In dieser Umgebung ist keine unterstützte Browsersteuerung für die lokale
Sites-Prüfung vorhanden. Eine neue visuelle Browserprüfung oder ein
angemeldeter Live-Durchlauf wird deshalb nicht als durchgeführt ausgewiesen.
