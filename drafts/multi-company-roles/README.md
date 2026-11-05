# Produktionsentwurf: gemeinsame Einladungen

Status: NICHT FREIGEGEBEN. Dieser Branch basiert auf dem IONOS-Produktionsstand und wird nicht automatisch in Produktion übernommen.

Die SQL-Datei und die SMTP-Funktion sind Entwürfe. SQL-Tests wurden ausschließlich in der Testdatenbank innerhalb einer zurückgerollten Transaktion ausgeführt. Geprüft: bestehendes Konto mit Mitarbeiterzugang und Administratorrolle, Ablehnung für unbestätigte E-Mail, falsches Konto und erneute Verwendung; SMTP-Unternehmensliste, unpassende Einladungskennung und fehlende MFA. Kein echter Produktionsversand wurde durchgeführt.

Vor einer Veröffentlichung:
- Vollständige Oberfläche und Annahme für vorhandene und neue Konten produktionsnah integrieren. Einzel-Einladungen müssen weiterhin funktionieren.
- Mitarbeiterportal und Rollenwechsel ohne QA-Adapter, inklusive aller Schreibaktionen und serverseitiger Unternehmensgrenzen prüfen.
- Registrierungs- und Bestätigungsablauf, Einladungen erneuern und zurückziehen, Fehler- und Konkurrenzfälle sowie Berechtigungen systematisch testen.
- Produktionseinladungs-E-Mail mit echtem SMTP, passender Testadresse und vollständigem Browserablauf überprüfen.
- Migration mit aktuellem Produktionsschema abgleichen und Rollback festlegen; erst danach Produktionsbereitstellung prüfen.

## Fortschritt: Unternehmenswechsel und Ist-Zeiten

- Produktivdatenbank: `employees_auth_user_id_uidx` erzwingt ein Mitarbeiterprofil je Konto global. Entwurf für eine atomare Umstellung auf ein Profil pro Konto und Unternehmen liegt vor. Nicht vor vollständiger Absicherung der Alt-Endpunkte installieren.
- `company-options-candidate.sql` listet nur eigene aktive freigegebene Mitarbeiterprofile und aktive Teamrollen; `employee-company-identity-candidate.sql` verlangt ein eindeutiges aktives Profil im ausgewählten Unternehmen.
- `employee-time-entry-candidate.sql` basiert auf dem produktiven Ist-Zeit-Endpunkt und ergänzt die Prüfung auf ausgewähltes Unternehmen und aktives Profil. Das Portalmodul verweist nur bei explizit aktiviertem Mehrunternehmensbetrieb auf den neuen Endpunkt; das Flag wird hier nicht aktiviert.
- In der Testdatenbank wurden die Entwürfe innerhalb zurückgerollter Transaktionen zusammen geprüft: Mischrollen, Widerruf, zwei Mitarbeiterprofile in verschiedenen Unternehmen, Ausschluss eines doppelten Profils im selben Unternehmen, erfolgreiche Ist-Zeiten für beide Unternehmen, Ablehnung falscher Unternehmen und gesperrter Mitarbeiterprofile. Die Datenbank der Testumgebung unterscheidet sich weiterhin von Produktion; die Tests ersetzen keinen Browser-, SMTP- oder kompletten Integrationstest.
- Noch offen: alle weiteren Portalaktionen und RLS-Regeln inklusive Alt-Endpunkten auf Unternehmen und aktive Zugänge ausrichten; Mitarbeiterportal vollständig anbinden; parallele Sitzungen, QR und Widerruf absichern; neue und bestehende Konten, Erneuerung, Einzel-Einladungen und echten E-Mail-/Browserablauf prüfen.

## Fortschritt: Abwesenheit, Tausch und Marktplatz

- Abwesenheitsanträge: produktiver Endpunkt um explizite Prüfung des aktiven Mitarbeiterprofils im angefragten Unternehmen ergänzt. Tests decken zwei Unternehmen, Fremdkonto, Widerruf und Überschneidung ab.
- Bestehende Aktionen für Tauschanfragen und den bisherigen Marktplatz prüfen im Entwurf die konkrete Unternehmensidentität; Tests bestätigen ein gültiges Angebot sowie die Ablehnung gesperrter Profile bei Anbieten, Tauschanfrage, Übernahme und Antwort.
- Die Tauschliste, der bisherige Marktplatz und offene Dienste haben Entwürfe mit expliziter Unternehmensauswahl. Alte Listen ohne Unternehmensangabe lehnen Mehrprofilkonten ab. Isoliert getestet wurden Listentrennung, Zugangssperren und Mehrdeutigkeit; bei offenen Diensten wurde nur die leere Liste und Ablehnung nach Sperre geprüft, kein erfolgreicher Übernahmevorgang.
- Die Portaldateien nutzen die neuen Listen und offenen Dienste nur bei aktiviertem Mehrunternehmens-Flag. Dieses Flag bleibt deaktiviert, solange die übrigen Aktionen und Datenbankzugriffe nicht geprüft sind.
- Alle vorstehenden SQL-Tests wurden in der Testdatenbank innerhalb zurückgerollter Transaktionen durchgeführt. Vollständige Integration mit echten Rollen, RLS, Browser, Anmeldung und E-Mail steht weiterhin aus.

## Fortschritt: Datenbankrolle, Zeilenschutz und Registrierung

- In der QA-Datenbank wurden drei restriktive SELECT-Regeln aus Produktion transaktionsweise nachgebildet. Unter der echten Datenbankrolle `authenticated` war mit den alten Regeln nur eines von zwei eigenen Mitarbeiterprofilen einschließlich Diensten und Ist-Zeiten sichtbar.
- Der Entwurf `company-rls-restrictive-candidate.sql` wurde unter `authenticated` mit zwei eigenen und einem fremden Konto geprüft: zwei eigene Profile sichtbar, fremde Daten nicht sichtbar, nach Sperrung nur das betroffene Profil samt Daten verborgen; Verwaltungszugriff des Testinhabers blieb erhalten. Andere QA-Regeln entsprechen nicht vollständig Produktion.
- Tagesübersicht, Unternehmensprofil und Urlaubskonto wurden mit produktionsbasierten Identitätsprüfungen unter `authenticated` auf zwei Unternehmen und eine Sperrung geprüft.
- Die Registrierung eines neuen Kontos wurde mit den produktiven Signup-Triggern und dem Mehrfach-Einladungsentwurf in QA getestet. Mitarbeiter- und Administratoranker, falsche E-Mail und erneute Tokenverwendung wurden abgedeckt. QA-spezifische Signup-Trigger wurden dafür nur innerhalb der zurückgerollten Testtransaktion neutralisiert.
- Bei der Registrierung legt die vorhandene Triggerlogik aktive Datenbankzuordnungen bereits beim Erstellen des Kontos an. Ob die echte Auth-Konfiguration einen Zugriff vor E-Mail-Bestätigung zuverlässig verhindert, muss durch einen Auth-/Browser-Test nachgewiesen werden. Die Triggerprüfung allein beweist das nicht.
- Noch offen: produktionsnahes Komplettportal ohne QA-Adapter, weitere alte Endpunkte und QR, positives Übernehmen offener Dienste, echte Authentifizierung/E-Mail-Bestätigung und E-Mail-Versand im Browser. Kein Produktiveinsatz erfolgt.
