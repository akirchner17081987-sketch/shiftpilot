# Private Supabase-Ablage für Audit-Archive

Die bestehende wöchentliche Archivierung bleibt montags um 03:00 Europe/Berlin aktiv. Fertige Archive werden durch einen Datenbanktrigger zur Auslagerung angemeldet. Der bestehende Push-Wiederholungszeitplan übernimmt zusätzlich offene Übertragungen und Datenschutz-Löschaufträge; kein weiterer Datenbank-Zeitplan wird angelegt.

## Speicherung und Verifikation
- Privater Bucket `audit-archives`; restriktive RLS-Sperre für anon/authenticated.
- Pro Archiv ein signierter Manifestkopf und ein Objekt je Paket von höchstens 250 Ereignissen.
- Bytegetreue PostgreSQL-JSON-Texte erhalten große Ganzzahlen.
- Upload ohne Überschreiben; Wiederholungen lesen dasselbe Objekt und vergleichen SHA-256.
- Erst nach vollständiger Rückleseprüfung und serverseitiger Vollständigkeitskontrolle: Status READY und Entfernung der redundanten Datenbank-Paketkopien.
- Archivverzeichnis, Signaturen, Datenschutzgeneration und Übertragungsstatus bleiben in PostgreSQL.
- Aktive Audit-Ereignisse werden durch diese Änderung nicht entfernt.

## Zugriff und Datenschutz
Downloads über die Edge-Funktion verlangen weiterhin OWNER/ADMIN und AAL2 über die vorhandene Manager-RPC. Die Berechtigung und Datenschutzgeneration werden nach dem externen Lesen erneut geprüft. Es werden keine öffentlichen oder langlebigen signierten Downloadlinks ausgegeben.
Datenschutzbereinigungen sperren alte Generationen sofort. Löschaufträge überleben eine Mandantenlöschung. Eine laufende Übertragungslease bleibt bei der Invalidierung erhalten, damit eine Löschung nicht mit einem noch hochladenden Worker kollidiert. Der Worker oder die fünfminütige Lease geben die anschließende Objektlöschung frei.
Die Edge-Funktion prüft Benutzer über die vorhandene RPC und Hintergrundaufrufe über einen privaten zufälligen Token je Archivauftrag; der Gateway-JWT-Check ist dafür bewusst aus, die Anwendungsprüfung bleibt aktiv.

## Kapazitätsmeldung
Die 100 GB Supabase-Storage-Freimenge gilt organisationsweit, einschließlich Telefonstatistik. Die ChatGPT-Kapazitätsprüfung soll nach jeder neu bestätigten Auslagerung Unternehmensname, Sicherungszeit, Archivgröße sowie organisationsweit belegte/freie Bytes und Prozent ausgeben. Sie prüft stündlich; bei mehreren Sicherungen werden diese getrennt aufgeführt. Downloads und Übertragungswiederholungen erzeugen keine neue Erfolgsmeldung. Fehlende Projektdaten werden als Prüflücke gemeldet, nicht als 0 Bytes gewertet.
Die Meldung gibt den aktuellen Objektbestand wieder, keine verbindliche Rechnung: Supabase rechnet den Speicher zeitanteilig in GB-Stunden ab. Es wird kein kostenpflichtiges Add-on eingerichtet.

## Tests und Grenzen
Node-Tests prüfen reale PostgreSQL-Funktionen in PGlite sowie den Edge-Kern mit Storage-Fehlerfällen und die Browser-Integration in happy-dom. GitHub Actions führt zusätzlich die gesamte Regression, Build, IONOS-Prüfung und Deno-Typprüfung aus. Nach Freigabe folgt ein echter Upload mit Rückleseprüfung der vorhandenen vier Archive.
Die Wiederherstellung einer vollständigen Datenbank bleibt ein separater offener Betriebsnachweis. Ein Audit-Archiv ist kein Vollbackup.
