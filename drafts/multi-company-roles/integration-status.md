# Mehrunternehmen: Integrationsstand

Dieser Zweig basiert auf dem IONOS-Produktivzweig. Er enthält geprüfte Entwürfe und Portal-Kandidaten aus QA zur weiteren Integration. Kein Produktionsrelease.

Die Portal- und Einladungsschalter bleiben ausgeschaltet. Die produktiven Authentifizierungs- und Passwort-Reset-Dateien bleiben unverändert; QA-Adapter und QA-Zugänge werden nicht eingebunden.

Vor Aktivierung sind produktionsgleiche Datenbankmigrationen und Absicherung aller Altendpunkte, echte Browser- und Mailtests sowie ein getesteter Rückfallplan erforderlich. Kandidatendateien unter drafts sind keine ausführbaren Freigaben. Die vorhandene globale Profil-Eindeutigkeit in Produktion darf bis dahin nicht aufgehoben werden.

## Prüfstand 06.11.2026

- 100 gezielte Tests bestanden, darunter Portal-/Rollenstart, Mandantenschutz, Lohnvorschau, Urlaub, Tausch und QR-PIN. Der Static-Build war erfolgreich.
- In der IONOS-QA-Sitzung waren der normale Portalwechsel und persönliche Ansichten von Dienstplan, QR-Zeiten, Stundenkonto, Lohnvorschau und Abwesenheiten erreichbar. Der frühere separate Vollportal-QA-Adapter war in dieser Sitzung nicht geladen. Das QA-Backend und die QA-Konfiguration unterscheiden sich weiterhin von Produktion.
- Ein rückgerollter Datenbanktest mit gefüllten fiktiven Dienstplänen zeigte eigene Dienste in beiden Unternehmen, keine fremden Dienste und den Entzug im gesperrten Unternehmen bei fortbestehendem Zugriff im anderen Unternehmen.
- Ein End-to-End-Test des Integrationszweigs mit produktionsgleicher Datenbank und echten Einladungen steht aus. Mehrfachprofile erfordern in Produktion noch die geprüfte Umstellung des globalen Eindeutigkeitsindex und Absicherung aller Alt-Endpunkte. Die SQL-Dateien bleiben Kandidaten, keine freigegebene Migration.
- Die vollständige Regressionstestsuite konnte nicht beendet werden, da sie in einem Planungsabschnitt längere Zeit nicht fortschritt. Die gezielte Testsuite ist vollständig bestanden.
