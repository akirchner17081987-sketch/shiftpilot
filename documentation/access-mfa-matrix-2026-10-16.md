# Berechtigungen und MFA – Arbeitspaket 2

Stand: 16.10.2026. Gilt je Unternehmen; Rechte in Unternehmen A gewähren keine Rechte in Unternehmen B.

| Aktion | Inhaber | Administrator | Teamleiter | Normales Mitarbeiterportal |
|---|---|---|---|---|
| Benutzer und Einladungen | Mit MFA | Mit MFA; keine Verwaltung von Inhabern/Administratoren | Gesperrt | Gesperrt |
| Planung | Bestehende Planungsrechte | Bestehende Planungsrechte | Bestehende Planungsrechte; Veröffentlichung als Zusatzrecht | Eigene Dienste ansehen |
| Zeiten bearbeiten | Mit MFA | Mit MFA | Zusatzrecht `manage_time` und MFA | Eigene Meldungen einreichen |
| Zeiten bestätigen | Mit MFA | Mit MFA | Zusatzrecht `confirm_time` und MFA | Gesperrt |
| Private Personalakten/Krankheitsgründe anderer Personen | Mit MFA | Mit MFA | Gesperrt | Gesperrt |
| Mitarbeitergespräche | Mit MFA | Mit MFA | Mit MFA; automatisch Mitarbeiter außer Führungsakten | Gesperrt |
| Personenbezogene Monatsberichte/DATEV | Mit MFA | Mit MFA | Gesperrt | Keine fremden Daten; eigener Stundenkontoexport bleibt möglich |
| QR-Terminal konfigurieren/QR-Schlüssel abrufen | Mit MFA | Mit MFA | Gesperrt | Gesperrt |

Bestehende ausdrücklich eingerichtete reine Zeiterfassungszugänge (`TIME_TRACKING`) bleiben eine Ausnahme vom normalen Mitarbeiterportal. Ihre einzeln vergebenen Bearbeitungs-/Bestätigungsrechte gelten weiter; schreibende Verwaltungsaktionen verlangen jetzt ebenfalls MFA. Es werden keine Konten stillschweigend zu Teamleitern oder Administratoren befördert.

## Technische Grenzen

- `private.can_manage_company_users` prüft aktive Inhaber-/Administratorrechte und AAL2. Alte und neue Einladungs-/Benutzerfunktionen verwenden dieselbe Grenze.
- Restriktive RLS schützt auch direkte Mitarbeiter-Einladungen und DATEV-Konfiguration. Administrator-Einladungen lassen sich nicht durch direkten Tabellen-DELETE eines Administrators entfernen.
- Bearbeitung und Bestätigung bleiben getrennte Zeitrechte. Die RPCs und der Tabellen-Trigger prüfen zusätzlich MFA. Änderungen gespeicherter Ist-Zeiten brauchen eine Begründung; das Protokoll enthält Bearbeiter, Zeitpunkt, alte/neue Werte und den Grund.
- QR-Buchungen der Mitarbeiter laufen weiter über ihre getrennte Authentifizierung. Die unabhängige Terminalbuchung als Dienstprozess wird nicht mit einer Benutzer-MFA-Abfrage versehen.
- Die Funktionen für personenbezogene Monatsberichte und die DATEV-Freigabe verlangen Inhaber/Administrator und MFA direkt im Backend. Berichtsfreigaben werden ohne Berichtsinhalt protokolliert; der Abrufnachweis ist keine Bestätigung, dass ein Download auf dem Endgerät erfolgreich gespeichert wurde.
- QR-Verwaltung einschließlich Standortzuordnung, Schlüsselabruf und Löschen prüft Inhaber/Administrator und MFA intern.
- Eine bereits bestätigte AAL2-Sitzung wird wiederverwendet. Berechtigte Zeitverwalter können ihren Authenticator beim ersten geschützten Vorgang einrichten. Der Dialog liegt über Korrekturfenstern; interaktive MFA läuft vor dem Netzwerk-Timeout einer QR-Korrektur.
- Gesprächsbereiche, ausgeschlossene Führungsakten und private Krankheits-/Dokumentdaten behalten ihre bestehenden getrennten Grenzen.

## Validierung

- Isolierte PostgreSQL-Tests mit synthetischen Mandanten: Fremdmandanten, gesperrte Konten, fehlende MFA, getrennte Zeitrechte, direkte Tabellenzugriffe, geschützte Einladungen, erlaubte Zeitaktionen, DATEV und Monatsberichte.
- Bestehende Funktionssuite einschließlich Personalakten-, Teamleiter- und Einladungsprüfungen.
- Browserprüfung mit synthetischem Auth-Dienst auf Desktop und Smartphone: falscher Code, erfolgreicher Code, MFA-Einrichtung für Zeitverwalter, Wiederverwendung der Sitzung und Abbruch ohne Wiederholung der Aktion.
- Nach Aktivierung: produktive Katalog-/Policy-Prüfung und rein lesende Negativtests; keine Änderungen echter Mitarbeiterbuchungen für Abnahmetests.
