# Produktionsentwurf: gemeinsame Einladungen

Status: NICHT FREIGEGEBEN. Dieser Branch basiert auf dem IONOS-Produktionsstand und wird nicht automatisch in Produktion übernommen.

Die SQL-Datei und die SMTP-Funktion sind Entwürfe. SQL-Tests wurden ausschließlich in der Testdatenbank innerhalb einer zurückgerollten Transaktion ausgeführt. Geprüft: bestehendes Konto mit Mitarbeiterzugang und Administratorrolle, Ablehnung für unbestätigte E-Mail, falsches Konto und erneute Verwendung; SMTP-Unternehmensliste, unpassende Einladungskennung und fehlende MFA. Kein echter Produktionsversand wurde durchgeführt.

Vor einer Veröffentlichung:
- Vollständige Oberfläche und Annahme für vorhandene und neue Konten produktionsnah integrieren. Einzel-Einladungen müssen weiterhin funktionieren.
- Mitarbeiterportal und Rollenwechsel ohne QA-Adapter, inklusive aller Schreibaktionen und serverseitiger Unternehmensgrenzen prüfen.
- Registrierungs- und Bestätigungsablauf, Einladungen erneuern und zurückziehen, Fehler- und Konkurrenzfälle sowie Berechtigungen systematisch testen.
- Produktionseinladungs-E-Mail mit echtem SMTP, passender Testadresse und vollständigem Browserablauf überprüfen.
- Migration mit aktuellem Produktionsschema abgleichen und Rollback festlegen; erst danach Produktionsbereitstellung prüfen.
