# Unternehmensbezogene Standortverortung

Status: Externe Übermittlung an Nominatim vom Nutzer am 21.10.2026 ausdrücklich genehmigt. Migration 20261021181844 ist angewendet; Veröffentlichung und Liveprüfung laufen.

## Verhalten

- Die Verwaltungsoberfläche löst ausschließlich aktive Standorte des angemeldeten Unternehmens auf. Der Server nimmt nur Unternehmens- und Standort-ID entgegen und liest die Adresse unter dem Benutzerkontext mit bestehender RLS.
- Die externe Suche erhält Straße, Hausnummer und PLZ. Der gespeicherte Ort wird zum Prüfen der Treffer genutzt. Unternehmensnamen, Objektnamen, Mitarbeiter und Ansprechpartner werden nicht übermittelt.
- Treffer müssen Straße, Hausnummer einschließlich Hausnummernbereichen, PLZ und Ort bestätigen. Weit auseinanderliegende Treffer werden als mehrdeutig abgewiesen. Es gibt keine Stadtmittelpunkt-Schätzung.
- Koordinaten, Quelladresse und Prüfstatus gehören zur vorhandenen Standortzeile. Adressänderungen löschen alte Koordinaten sofort per Trigger. Netzantworten schreiben nur bei unveränderter Adresse und weiterhin aktivem Standort.
- Benutzer-/Unternehmenswechsel verwerfen verspätete Clientantworten. Keine Unternehmensprofile oder Standorte werden kopiert.
- Vorhandene sechs verifizierte Adresspositionen werden bei der Migration auf passende vorhandene Standortzeilen übertragen. Die Kartenfunktion enthält anschließend keine feste Adressliste mehr.
- Fehler und negative Treffer sind zwischengespeichert. Eine globale Datenbanksperre begrenzt externe Anfragen auf höchstens eine je 1,2 Sekunden. Keine periodischen Sammelabfragen, kein Autocomplete und kein allgemeiner Suchendpunkt.
- Der Kartennachweis lautet „Adresspositionen © OpenStreetMap“. Adressstatus und Korrekturhinweise erscheinen unter Einstellungen → Unternehmen → Standorte und am unverorteten Kartenobjekt.

## Dienst / Freigabe

Nominatim ist aktuell nur für geringe, nutzerveranlasste Last vorgesehen. Die Vorgaben unter https://operations.osmfoundation.org/policies/nominatim/ verlangen insbesondere höchstens eine Anfrage pro Sekunde je Anwendung, Identifikation, Cache, Quellenangabe und die Möglichkeit, den Dienst zu wechseln. Keine vertraulichen/privaten Adressen übermitteln. Der Dienst ist für größere kommerzielle Last nicht als dauerhafte Kapazitätszusage geeignet.

Der Edge-Endpunkt ist nach ausdrücklicher Freigabe standardmäßig aktiviert und lässt sich mit `LOCATION_GEOCODING_ENABLED=false` deaktivieren. `LOCATION_GEOCODING_URL` erlaubt den Wechsel zu einer anderen Nominatim-kompatiblen Serveradresse ohne Client-Update. Geheimnisse werden ausschließlich serverseitig verwendet.

## Aktivierung nach ausdrücklicher Zustimmung

1. Den vorbereiteten SQL-Entwurf `supabase/migrations/20261021181844_company_location_geocoding.sql` über das native Migrationstool anwenden und mit der zurückgegebenen Versionsnummer nach `supabase/migrations/` übernehmen; Testpfad anpassen.
2. RLS-/Rollen- und Adressänderungsprüfungen in einer zurückgerollten Transaktion gegen Produktion verifizieren und Sicherheitsberater prüfen.
3. Den authentifizierten Edge-Endpunkt `location-geocode` deployen und den bestätigten Dienst aktivieren. JWT-Prüfung bleibt eingeschaltet. Gegebenenfalls genehmigten Aktivierungsstandard im Servercode setzen, falls das Umgebungsvariablen-Werkzeug nicht verfügbar ist.
4. Vollständige Tests/Build und reale Browserprüfung für Standortstatus/Karte durch CI. Erst danach die Oberfläche über den bestehenden GitHub-/IONOS-Weg veröffentlichen.
5. Live die Sicherheitsmanufaktur und die übrigen Unternehmensstandorte prüfen. Insbesondere BWZK muss seine eigene gespeicherte Adresse auflösen; keine standortfremden Ersatzpunkte verwenden.

## Prüfungen

`tests/location-geocode.test.mjs` prüft Adressabgleich, Mandantengrenze, deaktivierten Versand, Cache, Rate-Limit und veraltete Antworten mit einem ausschließlich simulierten Provider.

`tests/location-geocode-sql.test.mjs` führt den SQL-Entwurf in PGlite mit echten Rollen und RLS aus und prüft Sperren, Berechtigungen, Koordinaten-Grenzen und den Invalidierungstrigger.

`tests/location-geocode-ui.test.cjs` prüft die automatische Standortabfrage, den sichtbaren Status und Kontextwechsel mit dem echten Profilmodul in HappyDOM. Kein externer Adressdienst wird in Tests kontaktiert.
