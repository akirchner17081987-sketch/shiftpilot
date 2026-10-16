# QR-Anmeldung mit persönlicher PIN

Die PIN ersetzt das bisherige Eintrittsdatum als QR-Kennwort. Die technische Einführung ist absichtlich gestuft: Es werden keine PINs aus Personaldaten erzeugt, keine Einrichtungscodes automatisch verteilt und keine noch nicht eingerichteten Mitarbeitenden ohne Vorwarnung ausgesperrt.

## Ablauf für OWNER/ADMIN

Unter **Zeiterfassung → QR-Terminals → Persönliche QR-PINs verwalten** eine MFA-bestätigte Sitzung verwenden.

1. Je aktiver Person einen Einrichtungscode erzeugen und nach Identitätsprüfung persönlich/vertraulich übergeben. Ein neuer Code ersetzt einen vorherigen Code; eine vorhandene PIN und vorhandene QR-Sitzungen werden sofort ungültig. Der Code ist zwölfstellig, einmal verwendbar, 24 Stunden gültig und nur in dieser Antwort sichtbar.
2. Mitarbeitende scannen den bekannten Standort-QR-Code. Sie wählen **PIN mit Einrichtungscode einrichten**, geben Personalnummer, Code und eine selbst gewählte PIN mit Wiederholung ein. Danach gilt für diese Person ausschließlich die PIN. Die Leitung kann die PIN nicht lesen.
3. Die Übersicht erneut öffnen. Wenn alle aktiven, nicht gesperrten Mitarbeitenden eine PIN sowie eine eindeutige Personalnummer haben, **PIN-Pflicht für alle aktivieren**. Der Server prüft die Bereitschaft erneut; die Oberfläche allein autorisiert keine Aktivierung. Ab dann funktionieren Eintrittsdaten auch für später neu angelegte Mitarbeitende nicht. Für diese zuerst einen Einrichtungscode ausstellen.

Neue Mitarbeitende nach der Aktivierung und Personen mit vergessener PIN benötigen einen neuen Einrichtungscode. Ein in der Übersicht ausgestellter Code darf nicht gemeinsam mit einem öffentlichen Standort-QR-Code ausgehängt werden. Bestehende QR-Ausdrucke müssen nicht ersetzt werden; ein Nachdruck nennt den neuen PIN-Login.

## Übergang und Abschlusskriterium

Während der Umstellung ist der bisherige Datum-Login ausdrücklich als Übergangsoption auswählbar. Er bleibt nur für Personen ohne aktivierte PIN und nur vor der unternehmensweiten Aktivierung möglich. Eine ausgestellte erste Einladung allein sperrt den Datum-Login noch nicht, damit die persönliche Übergabe vor der Umstellung stattfinden kann. Ein PIN-Reset öffnet den Datum-Login dagegen niemals wieder.

**Punkt 3 ist organisatorisch erst abgeschlossen, wenn alle benötigten Mitarbeitenden ihre PIN eingerichtet haben und die PIN-Pflicht in jedem produktiven Unternehmen aktiv ist.** Die Veröffentlichung allein erfüllt dieses Abschlusskriterium nicht. Zum Zeitpunkt der Vorprüfung waren 19 bzw. 23 aktive, nicht gesperrte Mitarbeitende in den zwei Unternehmen mit aktivem QR-Terminal vorhanden; keine PIN wurde stellvertretend eingerichtet.

## Technische Schutzmaßnahmen

- Persönliche PIN: 6–8 Ziffern, bcrypt mit individuellem Salt und Kostenfaktor 12. Wiederholte Ziffern, einfache Sequenzen, Personalnummer sowie gebräuchliche Formate von Geburts-/Eintrittsdaten werden beim Einrichten abgelehnt.
- Die privaten Tabellen `private.qr_pin_credentials` und `private.qr_pin_settings` sind RLS-geschützt und für `anon`/`authenticated` direkt unzugänglich. Die Mitarbeiter-Stammdaten enthalten keine PIN oder PIN-Hashes. Einrichtungscodes liegen nur als SHA-256-Hash vor.
- Verwaltung: aktiver OWNER/ADMIN im selben Unternehmen, passende Zugriffsrolle, kein Lesemodus, AAL2. Dies gilt auch für direkten Aufruf der privaten Verwaltungsfunktion.
- Einrichtung und PIN-Login teilen eine dauerhafte Fehlversuchssperre: fünf Fehlversuche je Unternehmen und normalisierter Personalnummer, über sämtliche Terminals, dann bis zum Ende des 15-Minuten-Fensters gesperrt. Fehlversuche werden als Ergebnis zurückgegeben, damit ihre Speicherung nicht durch eine SQL-Ausnahme zurückgerollt wird. Die Edge Function liefert bei einer bestehenden Sperre HTTP 429 mit Wartezeit.
- Sitzung: 32 kryptografisch zufällige Bytes, nur der SHA-256-Hash wird gespeichert, 30 Minuten Gültigkeit. Keine Speicherung von PIN/Einrichtungscode in Browser Storage. Geheimfelder werden nach Antworten geleert. Managerdialoge entfernen angezeigte Einrichtungscodes beim Schließen sowie bei einem Wechsel von Unternehmen/Konto.
- PIN-Einrichtung/Reset entzieht bisherige Sitzungen. Buchungen prüfen die Sitzung nach der Mitarbeiter-Sperre erneut; damit wirkt ein paralleler Reset auch auf wartende Buchungen. Unternehmenseinschaltung entzieht alte Datum-Sitzungen. Abmeldung in der QR-Oberfläche verwirft wie bisher die Sitzung im Browser; die verbleibende serverseitige Restlaufzeit beträgt maximal 30 Minuten.
- Deaktivierung, Zugangssperre oder weiche Löschung entfernt PIN-Hash/Einrichtungscode und Sitzungen; nur der Marker gegen eine Rückkehr zur Datum-Anmeldung bleibt erhalten. Physisches Löschen entfernt die private Zeile per Fremdschlüssel.
- Audit: Codeausstellung, erfolgreiche PIN-Einrichtung und Unternehmensaktivierung werden ohne Geheimwerte protokolliert. Eintrag zur PIN-Einrichtung beschreibt die Freigabe durch einen Einrichtungscode, nicht einen regulären Supabase-Account.
- Bestehende Datums-RPC bleibt für alte Clients in der Übergangsphase erreichbar, verweigert aber nach persönlicher oder Unternehmensaktivierung serverseitig jede Sitzung. PIN-Anfragen fallen bei Fehlern niemals auf Datumsanmeldung zurück.
- Die öffentliche Edge Function behält ihre eigene Terminal-/Sitzungsprüfung und `verify_jwt=false`, weil Mitarbeitende keinen Supabase-Login benötigen. Service-Zugang bleibt ausschließlich serverseitig. Tatsächlich gelesene Request-Bodies werden auf 2048 Bytes begrenzt, auch ohne Content-Length.

## Prüfung

- Isoliertes PostgreSQL/PGlite mit echtem pgcrypto prüft Rechte/MFA, unbekannte und fremde Personen, reale gesalzene bcrypt-Hashes, Einmaligkeit/Ablauf, dauerhafte terminalübergreifende Sperren, Reset/Sitzungsentzug, Schutz gegen Datums-Fallback, Aktivierungsbedingungen, Buchungen und gesperrte direkte Zugriffe.
- Edge-Tests führen den tatsächlichen TypeScript-Handler mit simuliertem Backend aus: PIN-Routing, Einrichtung, kompatibler Übergang, ungültige Eingaben, kein Fallback, HTTP 429, Origin und tatsächliche Body-Größe.
- `node tests/browser/qr-pin-qa.cjs`: 20 Prüfungen auf Desktop/Handy mit ausschließlich fiktiven Antworten, darunter PIN-Login, geleerte Geheimfelder, PIN-Wiederholung, Einrichtung, Übergangsoption, Admin-MFA, Aktivierungsblockade und Entfernen eines angezeigten Codes bei Unternehmenswechsel.
- Bestehende QR-Buchungs-/Pausen-Browsertests nutzen nun PIN-Eingaben. Die Korrektur-Testumgebung bildet eine bereits bestätigte AAL2-Sitzung ab; echte MFA-Dialoge bleiben separat durch `access-mfa-matrix-qa.cjs` geprüft.
