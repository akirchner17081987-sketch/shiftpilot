# Mitarbeiterprofil · 02.10.2026

Das Mitarbeiterportal zeigt persönliche Daten, Kontaktangaben, Vertragsdaten, Planungsteam und tatsächliche Rhythmusregel, freigegebene Dienstarten, eigene Qualifikationen mit Ablaufhinweisen sowie Login- und Gerätestatus. Kontakt-E-Mail und Anmeldeadresse sind getrennt. Fehlende Werte werden ausdrücklich als nicht hinterlegt angezeigt; ein fehlendes Vertragsende wird nicht als unbefristeter Vertrag interpretiert.

## Korrekturablauf

1. Mitarbeiter öffnen **Mein Profil → Korrektur anfragen**, wählen einen Bereich und beschreiben die gewünschte Änderung.
2. **OWNER/ADMIN** sehen die Anfrage unter **Personal → Mitarbeiter → Änderungsanfragen öffnen** und erhalten eine Benachrichtigung. Andere Planungsrollen erhalten keine Personal-Anfragedetails.
3. **Mitarbeiterdaten öffnen** führt zur vorhandenen Datenpflege. Adresse, Geburtsdatum, Vertragsende und Arbeitszeitmodell sind jetzt ebenfalls im Mitarbeiterformular verfügbar. **Personalakte öffnen** führt unter anderem zu Einsatzangaben und Qualifikationsnachweisen.
4. Die Leitung speichert die Korrektur dort und dokumentiert anschließend eine Rückmeldung. **Als erledigt markieren** verlangt die ausdrückliche Bestätigung, dass die Korrektur umgesetzt wurde. Eine Ablehnung verlangt ebenfalls eine Begründung. Die Entscheidung verändert selbst keine Stammdaten oder Auth-Daten.
5. Der Mitarbeiter sieht Status und Rückmeldung im eigenen Anfrageverlauf. Die Benachrichtigung öffnet gezielt **Mein Profil**.

## Zugriffsgrenzen

Die neuen RPCs prüfen den aktiven, freigeschalteten eigenen Mitarbeiter bzw. die aktive OWNER/ADMIN-Mitgliedschaft des betreffenden Unternehmens. Zeiterfassungszugänge und anonyme Zugriffe werden abgewiesen. Die Anfrage-Tabelle liegt im privaten Schema, ist durch RLS geschützt und erhält keine direkten Client-Rechte. Interne Personalnotizen, Notfallkontakte, Kostenstellen und vertrauliche Nachweisnotizen werden nicht an das Mitarbeiterprofil ausgeliefert.

Je Bereich ist eine offene Anfrage erlaubt. Entscheidungen sind gesperrt, sobald eine Anfrage bearbeitet wurde. Anlage und Entscheidung werden auditiert. Im Demo-Modus bleiben Profilanfragen lokal im Sitzungsspeicher des Moduls; produktive RPC-Schreibzugriffe werden nicht aufgerufen.

## Prüfung

- 400 bestehende automatisierte Tests bestanden.
- SQL-Rollbacktest mit synthetischen Daten bestanden: eigener Zugriff, Teamrhythmus, Ablaufdatum, Anfrage/Entscheidung, Benachrichtigungen, Audit und 17 Eingabe-/Berechtigungsprüfungen. Alle Testdaten zurückgerollt.
- Browserprüfung mit vollständiger Desktop-App sowie 390- und 360-Pixel-Ansicht bestanden: Darstellung, Escaping, Login-/Kontakttrennung, Speicherfehler, Doppeleinsendung, Anfrageverlauf, Bearbeitung/Bestätigung/Ablehnung, Personalbereich und lokaler Demo-Modus.
- Tatsächliches Mitarbeiterformular geprüft: zusätzliche Felder werden gespeichert; Vertragsende vor Eintritt wird abgefangen.
- Lohnvorschau erneut auf Desktop und beiden Mobilgrößen bestanden.
- Supabase Security Advisors: keine neuen Profil-Warnungen.
