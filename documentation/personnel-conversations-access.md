# Personalgespräche: automatische Mitarbeiterzuordnung

Stand: 12. Oktober 2026. Ersetzt die manuelle Zuordnung aus PR #79/#80.

Aktive Teamleiter erhalten automatisch den Gesprächsbereich aller Mitarbeiter ihres Unternehmens. Neue Mitarbeiter gehören unmittelbar dazu; eine einzelne Auswahl ist nicht mehr erforderlich. Teamleiter-Akten sind ausgeschlossen. Die bisherige Trennung privater Dokumente, alter privater Notizen und Krankheitsgründe bleibt auf ausdrücklichen Wunsch bestehen.

## Bedienung

1. Inhaber/Administrator legt einen Zugang mit der Rolle **Teamleiter** an oder aktiviert ihn. Das Gesprächsrecht wird bei der Mitgliedschaft automatisch ergänzt; andere Zusatzrechte bleiben unverändert.
2. **Einstellungen → Benutzer & Rechte → Rolle ändern** zeigt die automatisch zugeordneten Mitarbeiter als alphabetische, durchsuchbare Liste. Die Zuordnung wird nicht über Checkboxen verändert.
3. Teamleiter richten einen Authenticator ein, bestätigen MFA und öffnen im Mitarbeiterprofil **Personalgespräche**.
4. Sichtbar sind neue Gesprächsnotizen, vereinbarte Ziele, Folgetermine und ausdrücklich für Gespräche freigegebene berufliche Qualifikationen. Gesundheitsangaben gehören nicht in Gesprächsnotizen.
5. Inhaber/Administrator kann berufliche Qualifikationen ausdrücklich für Gespräche freigeben. Bemerkung und Zertifikatsnummer bleiben privat. Inhaltliche Änderungen setzen die Freigabe zurück.

Einladungen vergeben weiterhin nur die Hauptrolle und ausgewählte andere Rechte. Nach Annahme wird das Gesprächsrecht bei einer regulären Teamleiter-Mitgliedschaft automatisch ergänzt. Gesperrte Zugänge und das ausdrücklich eingeschränkte Sonderprofil **Nur lesender Dienstplanzugriff** erhalten keine Personaldaten. Nach Reaktivierung einer regulären Teamleiter-Mitgliedschaft greift die automatische Regel wieder.

## Datenbankseitige Grenzen

- Firmenzugehörigkeit, aktive Teamleiter-Mitgliedschaft und MFA/AAL2 werden bei jedem Gesprächsaufruf geprüft.
- Der zulässige Personenkreis wird aus aktuellen Mitarbeiter- und Benutzerkontodaten berechnet. Alte manuelle Zuordnungen und veraltete JWT-/UI-Angaben können die Regel nicht erweitern.
- Mitarbeiter mit Personalrolle **Teamleiter** sind ausgeschlossen. Ebenso sind Profile ausgeschlossen, die über `auth_user_id` oder die E-Mail-Adresse einem Teamleiter-, Inhaber- oder Administratorkonto zugeordnet sind. Auch deaktivierte Führungskraftkonten bleiben als solche geschützt.
- Teamleiter können geschützte Führungsprofile nicht durch Änderung von Rolle, Kontoverknüpfung oder E-Mail-Adresse in den erlaubten Personenkreis verschieben. Diese Identitätsänderungen erfolgen durch Personalverantwortliche.
- Die eigene Teamleiter-Akte gehört ebenfalls nicht zum Teamleiter-Gesprächsbereich. Inhaber/Administrator behält den bisherigen MFA-geschützten Personalzugriff.
- Neue Mitarbeiter und Rollen-/Kontowechsel wirken unmittelbar auf die serverseitige Prüfung. Softgelöschte Mitarbeiter sind ausgeschlossen; bestehende inaktive, nicht gelöschte Mitarbeiter bleiben im Personalbestand.

| Inhalt | Regulärer Teamleiter mit MFA | Inhaber/Administrator mit MFA |
|---|---|---|
| Namen, Personalnummer, Funktion, Status normaler Mitarbeiter | Lesen | Lesen |
| Neue Gesprächsnotizen, Ziele, Folgetermine | Lesen und hinzufügen | Lesen und hinzufügen |
| Freigegebene berufliche Qualifikationen | Minimale Angaben lesen | Verwalten und Freigabe bestimmen |
| Teamleiter-/Führungskraftakten | Gesperrt | Bestehender Personalzugriff |
| Private Detaildaten, Dokumente, alte private Notizen | Gesperrt | Bestehender Personalzugriff |
| Krankheitsgründe und medizinische Unterlagen | Gesperrt | Bestehender gesonderter Personalzugriff |

Erfolgreiche Leseaufrufe und neue Gesprächsnotizen erzeugen Audit-Einträge ohne Gesprächsinhalte in den Metadaten. Die Aktivierung der automatischen Regel wird je betroffenem Teamleiterkonto protokolliert. Die sieben anderen Personalverwaltungs-RPCs und der private Dokumentenspeicher bleiben auf den bisherigen Personalkreis beschränkt.

## Technische Prüfung

Migration `20261011234351_team_lead_automatic_personnel_scope.sql`, mit Supabase CLI erzeugt, baut auf den vorhandenen MFA- und Gesprächsmigrationen auf. Isolierte PostgreSQL-Prüfungen in `tests/personnel-automatic-scope.test.mjs` decken automatische Bestands-/Neuzuordnung, Teamleiter-Ausschluss nach Personalrolle/Konto/E-Mail, MFA, Firmen-/Kontogrenzen, aktuelle Rollenwechsel, Schutz gegen Identitätsänderung, private Inhalte, Nur-Lesen, Sperrung/Reaktivierung, alte Clients und Auditierung ab.

Die Benutzer- und Personalgespräche-Browserprüfungen verwenden fiktive Daten und abgefangene RPCs. Sie prüfen die tatsächliche Oberfläche, die unveränderliche automatische Liste und die Sperre geschützter Profile. Die produktive Datenbankaktivierung wird gesondert mit rückgerollten Testzugriffen überprüft.
