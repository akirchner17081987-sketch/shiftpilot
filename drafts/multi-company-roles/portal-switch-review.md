# Prüfung: Oberfläche und Unternehmens-/Rollenwechsel ohne Testadapter

Stand: 05.11.2026. Diese Prüfung ist eine Quellcode- und Datenbankbestandsprüfung; kein vollständiger Browser-Ende-zu-Ende-Test.

## Feststellungen

- Die Produktivstartseite unter schichtfunk.de war im Browser erreichbar. Ein angemeldeter Test wurde nicht durchgeführt.
- `assets/employee-company-switch-v1.js` existiert im QA-Zweig, aber nicht im betrachteten IONOS-Produktionszweig.
- Die RPCs `employee_company_options`, `employee_company_profile`, `multi_role_company_options`, `manager_create_multi_access_invite`, `manager_multi_invite_options` und `claim_multi_company_invite` waren in der Produktivdatenbank zum Prüfzeitpunkt nicht vorhanden.
- Die QA-Oberfläche lädt `qa-full-employee-portal.js`; dieser Adapter sowie die abweichende QA-Konfiguration dürfen nicht in den Produktivstand übernommen werden.
- Die produktiven Module `supabase-employee-access-v1.js` und `supabase-employee-access-guard-v1.js` verwenden `maybeSingle()` für die Suche nach Mitarbeiterprofilen des Kontos ohne Unternehmensauswahl. Mehr als ein passendes Profil kann den Start deshalb mit einem Abfragefehler verhindern. Daraus folgt nicht, dass bestehende Einzelprofilkonten betroffen sind.
- Der produktive `company-switcher-v1.js` bestimmt auswählbare Unternehmen anhand aktiver Teammitgliedschaften. Im QA-Entwurf werden zusätzliche Mitarbeiter-Optionen über `multi_role_company_options` eingeblendet; diese Funktion und die Kopplung an das vollständige Portal fehlen in Produktion.
- Der bestehende QA-Nachweis zum Vollportal nutzt teilweise simulierte Dienste. Eine Prüfung aller echten Portalaktionen, insbesondere nach Widerruf und beim schnellen Wechsel zwischen Unternehmen, steht aus.

## Für den nächsten vollständigen Test

1. Produktionsnahe, unternehmensgebundene Datenbankfunktionen und eine echte Auswahl im Mitarbeiterportal implementieren; alle lesenden und schreibenden Aktionen serverseitig auf Benutzer, Unternehmen und aktiven Zugang begrenzen.
2. Team-, Mitarbeiter- und Mischrollen einschließlich Einzel-Einladungen und MFA auf bestehendem und neuem Konto testen; Datenisolierung und Zugriff nach Widerruf nachweisen.
3. Mit echter Testdatenbank und produktionsgleichem Portal ohne QA-Adapter im Browser prüfen: Einladung, E-Mail, Anmeldung, Wechsel in beide Richtungen, Daten und Aktionen je Unternehmen, Fehlerfälle und parallele Anfragen.
4. Erst nach erfolgreichem Gesamtprüflauf auf IONOS und mit der Produktivdatenbank veröffentlichen.
