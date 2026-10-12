# Gespeicherte Hintergrundplanung

Die Monats- und Zeitraumplanung der produktiven Unternehmen läuft nach der lokalen Vorbereitung als Auftrag im bestehenden Supabase-Pro-Projekt. IONOS liefert weiterhin die Oberfläche aus. Ein neuer Hostingtarif wurde nicht gebucht.

## Ablauf

Der Browser synchronisiert die Planungsdaten, ermittelt geschützte Dienste und baut kompakte Schichtoptionen mit den aktuellen Freigaben, Abwesenheiten und Unternehmensregeln. Anschließend speichert `start_background_auto_plan` den Auftrag samt unveränderlichem Datenstand und Fingerprint. Bestätigte Freizeitzusagen lädt der Server zusätzlich aus der Datenbank.

Die in Frankfurt aufgerufene Edge Function arbeitet in kurzen Rechenschritten, speichert einen JSON-Zwischenstand und veranlasst den nächsten Aufruf. Die Berechnung benötigt keinen offenen Browser. Ein interner Zehn-Sekunden-Dispatcher stellt nach einer abgelaufenen Worker-Lease die Zustellung wieder her. Ohne offene Aufträge führt der Dispatcher keine Edge Function aus. Lease und Revision verhindern die doppelte Übernahme eines Zwischenstands.

Die Oberfläche beobachtet nur den Auftrag. Nach einer Neuanmeldung oder einem Fensterwechsel lädt sie den gespeicherten Fortschritt. Fertige Vorschläge lassen sich sieben Tage lang erneut öffnen. Erst die ausdrückliche Bestätigung ruft die bereits vorhandene, atomare Entwurfsübernahme auf. Die dortigen Schutz-, Berechtigungs- und Validierungsregeln bleiben maßgeblich. Geänderte Planungsdaten erfordern eine neue Vorschau.

## Zugriff und Grenzen

- Private Auftragstabelle mit RLS, explizit gesperrtem Direktzugriff und nach Unternehmen geprüften öffentlichen Invoker-APIs.
- Start/Lesen/Abbrechen nur für aktive OWNER-, ADMIN-, PLANNER- und DISPATCHER-Mitglieder des jeweiligen Unternehmens.
- Worker-RPCs ausschließlich für `service_role`; zufälliger Auftrags-Token und befristete Lease werden niemals an den Browser ausgegeben.
- Höchstens ein laufender Auftrag je Unternehmen, 20 neue Aufträge je Stunde, 5.000 Aufrufe beziehungsweise eine Stunde je Auftrag und höchstens zehn Wiederherstellungsversuche.
- Hintergrundausführung gilt für den bestehenden Planungskern mit aktivierten Unternehmensregeln; Demo und ältere nicht aktivierte Modelle behalten ihren bisherigen Ablauf.
- Aufträge werden nach sieben Tagen entfernt. Die Entwurfsübernahme entfernt die transienten Eingaben und das gespeicherte Vorschau-Ergebnis bereits beim Abschluss des Auftrags.

## Verifikation am 12.10.2026

- 758 Funktionstests erfolgreich; zusätzliche UI-Modultests decken verborgenes Browserfenster, neue Anmeldung, Unternehmenswechsel und ausdrücklich bestätigte Entwurfsübernahme ab.
- 37 Prüfungen für IONOS-Build und Modulladen erfolgreich.
- Reiner Supabase-Live-Lauf mit 20 fiktiven Mitarbeitern und Januar 2027: 298 Vorschläge, 52 Worker-Aufrufe, 102,8 Sekunden, keine Wiederherstellungsfehler, keine Dienstplaneinträge.
- Der erste, bewusst konservative Live-Lauf benötigte 199 Aufrufe. Größere Rechenschritte reduzierten dies auf 52; das Vorschau-Ergebnis blieb exakt identisch.
- SQL-Tests bestätigen abgewiesene fremde Zugriffe, gesperrte Worker-RPCs für normale Benutzer, verworfene fremde/alte Leases und verworfene Ergebnisse bei abweichendem Daten-Fingerprint.
- Nicht authentifizierter HTTP-Aufruf der Edge Function wurde mit 401 abgewiesen.

Der Aufrufbedarf hängt von Zeitraum, Personalbestand, Optionen und Wiederholungen ab. 100 vergleichbare Monatsläufe würden etwa 5.200 Worker-Aufrufe benötigen. Dies ist eine Hochrechnung aus dem Test und keine feste Obergrenze. Die tatsächliche gemeinsame Supabase-Kontingentauslastung wurde nicht über die Abrechnungsoberfläche eingesehen.

Ein visueller Browser-Live-Test ist hier nicht enthalten. Die Oberfläche wurde über ihre tatsächlichen JavaScript-Module mit simuliertem DOM und API-Antworten geprüft; der echte Worker-/Datenbank-Ablauf wurde separat auf Supabase ausgeführt.
