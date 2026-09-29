# SchichtFunk – technischer Abschlussnachweis IONOS + Supabase

Stand: 14.09.2026, 10:02 Uhr MESZ

## Ergebnis

Roadmap-Punkt 9.1 „IONOS/Supabase technisch fertigstellen“ ist technisch abgeschlossen. Die IONOS-Prüfbereitstellung liefert den aktuellen statischen SchichtFunk-Build vollständig aus; Supabase Pro in Frankfurt ist als Backend erreichbar und der Datenschutz-Lifecycle-Worker läuft planmäßig. Bei den Abschlussprüfungen wurden keine Produktionsdaten verändert.

Die produktive Domain `www.schichtfunk.de` wurde bewusst **nicht** umgeschaltet. Dieser getrennte, reversible Freigabeschritt bleibt bis zu einer ausdrücklichen Anweisung des Betreibers gesperrt.

## IONOS-Nachweis

- Bereitstellungsadresse: `https://home-5021411544.app-ionos.space/`
- Statischer Build: 2.159.480 Byte (2,06 MiB), damit deutlich unter dem Starter-Limit von 50 MB.
- Vollständigkeitsvergleich: 174 von 174 ausgelieferten Build-Dateien entsprachen dem lokalen Build. 25 Dateien waren bytegleich; bei 149 Textdateien bestand ausschließlich die erwartete CRLF-/LF-Zeilenendenabweichung. Es gab 0 inhaltliche Abweichungen.
- `/`, `/impressum`, `/datenschutz`, `/site.webmanifest`, `/schichtfunk-sw.js` und ein tiefer App-Pfad lieferten HTTP 200. Ein absichtlich fehlendes statisches JavaScript-Asset lieferte korrekt HTTP 404.
- HTML, Manifest und Service Worker wurden mit den vorgesehenen Nicht-Cache-Regeln ausgeliefert. HSTS und die übrigen Sicherheitsheader waren vorhanden.
- Der sichtbare Browsercheck meldete keine JavaScript- oder Konsolenfehler.
- SPA-Routing, PWA-Dateien, Service Worker und die zuvor dokumentierte iPhone-Push-Abnahme sind damit weiterhin konsistent. Nach einer späteren Domainumschaltung ist das Push-Abonnement wegen der neuen Herkunft erneut zu aktivieren und zu testen.

## Supabase-Nachweis

- Organisation `Security_Plattform`: Pro aktiv, Spend Cap aktiv.
- Projekt `SchichtFunk`: Region `eu-central-1` (Frankfurt), produktives Hauptprojekt.
- `demo-auth`: CORS-Vorabprüfung von der IONOS-Herkunft erfolgreich; ungültige Zugangsdaten wurden korrekt mit HTTP 401 abgelehnt.
- `demo-analytics`: anonyme Aufrufe wurden korrekt mit HTTP 401 abgelehnt.
- `privacy-lifecycle` und `privacy-worker`: anonyme Aufrufe wurden korrekt mit HTTP 401 abgelehnt.
- Geplanter Job `schichtfunk-privacy-lifecycle-worker`: aktiv, Intervall `*/15 * * * *`; letzter kontrollierter Lauf am 14.09.2026 um 07:15 UTC mit Status `succeeded`.
- Die vorhandenen Vercel-Demo-Funktionen bleiben nur für den technischen Rückfallstand im Repository; die IONOS-Auslieferung verwendet die Supabase Edge Functions.

## Testnachweis

- `npm test`: 33 von 33 Testdateien bestanden.
- `npm run test:ionos`: bestanden.
- `npm run build`: bestanden; 2.159.480 Byte.
- Der vollständige Remote-Browserlauf gegen IONOS prüfte Desktop und Mobil. Sechs zunächst rote Ausführungen wurden auf kalenderabhängige Demo-Annahmen beziehungsweise instabile Testaktionen beim absichtlichen DOM-Austausch zurückgeführt. Die Prüfungen wurden datumssicher und zielgenau korrigiert; alle sechs betroffenen Fälle bestanden anschließend isoliert gegen die echte IONOS-Adresse.
- Die zuvor auffällige mobile Festschicht-Prüfung bestand isoliert. Der mobile Manager-/Mitarbeiterwechsel bestand anschließend ohne Testwiederholung; die lange Laufzeit entstand in der lokal stark ausgelasteten Testumgebung, während alle instrumentierten Render-Schritte vollständig zurückkehrten.

## Noch getrennt freizugeben

1. DNS-/Domainumschaltung von `www.schichtfunk.de` erst nach ausdrücklicher Bestätigung.
2. Direkt nach einer Umschaltung: HTTPS, Login, PWA-Installation, Push-Neuregistrierung und Testzustellung auf der Produktivdomain wiederholen.
3. Vercel bleibt technisch als Rückfallstand bestehen. Eine kommerzielle Rückschaltung ist mit dem dokumentierten Hobby-Tarif nicht freigegeben.
4. Kundenbezogene Löschfristen, Langfristredaktion, weitere AAL2-Stufen und rechtliche Betriebsfreigaben gehören zu den übrigen offenen Arbeiten von Punkt 9 und ändern den technischen Abschluss dieses Teilpunkts nicht.
