# Echter Login, Unternehmenswechsel und Testanträge – 07.11.2026

## Umgebung

Isolierter Supabase-Testzweig `whthodedymxplgmaooov` mit dauerhaft installierter QA-Migration `20261107033536`. Lokal im Codespace ausgeliefertes Testportal; keine Veröffentlichung und keine Produktivdatenbank-Schreibvorgänge. Das Testportal stammt aus dem bisherigen QA-Build, wurde für diesen Test auf den genannten Testzweig umgestellt und schaltet die noch nicht produktiv freigegebenen Mehrunternehmens-Funktionen testweise ein. Das ist kein Nachweis für eine endgültige produktive Auslieferung oder für die unveränderte Releasekonfiguration.

Ein neu angelegtes fiktives Konto mit zwei verschiedenen Mitarbeiterprofilen und zwei fiktiven Unternehmen wurde verwendet. Die ersten Anmeldungen scheiterten an unvollständig angelegten Feldern des fiktiven Auth-Kontos; nach Korrektur allein dieses Testkontos gelang die echte Anmeldung. Das Konto und die fiktiven Testdaten bestehen nach diesem Test weiterhin auf dem Testzweig. Zugangsdaten gehören nicht in dieses Dokument.

## Verlauf und Ergebnis

- Betrieb A zeigte den zugehörigen Testdienst A. Der Unternehmenswahlschalter war zunächst vorhanden, aber im Portal nicht sichtbar. Der QA-Build wurde lokal angepasst, sodass die Auswahl im sichtbaren Inhaltsbereich liegt. Die in Git vorbereitete Änderung ist funktional, nicht als finales Design freigegeben.
- Nach Wechsel zu Betrieb B zeigte das Portal den Namen des Betriebs B und den Testdienst B. Die Bestätigung erfolgte anhand des vom Nutzer übermittelten Screenshots.
- In Betrieb B wurde über das echte Portal ein Urlaubsantrag für den 14.12.2026 eingereicht. Ein anschließender lesender Datenbankabgleich bestätigte Betrieb B, Profil B und Status `Beantragt`.
- Nach Wechsel zu Betrieb A meldete das Portal zunächst eine leere Abwesenheitsübersicht; der Nutzer erstellte dort einen Antrag für den 15.12.2026. Der Datenbankabgleich bestätigte Betrieb A, Profil A und Status `Beantragt`; der Eintrag für B blieb B zugeordnet.
- Nach erneutem Wechsel zu Betrieb B zeigte der vom Nutzer übermittelte Screenshot genau einen Urlaubseintrag für den 14.12.2026 und keinen Eintrag für den 15.12.2026.

## Grenzen

Belegt sind diese konkreten Portalwechsel und zwei nicht gleichzeitig ausgeführte Abwesenheits-Schreibvorgänge mit einem echten Testlogin. Nicht belegt sind gleichzeitige Schreibvorgänge, automatische Konfliktauflösung, das Verhalten sämtlicher Portalaktionen, MFA für dieses Testkonto, das finale Design, die vollständige Wiederherstellung oder eine Produktionsfreigabe. Die beiden Anträge wurden nicht genehmigt und bleiben Testdaten. Vor einer Produktivfreigabe sind insbesondere eine vollständige Sicherheits- und Berechtigungsprüfung, ein unabhängiger vollständiger Restore-Test, die abgestimmte Portalgestaltung und eine geprüfte Produktionsmigration weiter offen.
