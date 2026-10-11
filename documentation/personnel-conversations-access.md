# Personalgespräche für ausgewählte Teamleiter

Stand: 12. Oktober 2026. Ergänzung zur MFA-/Gesundheitsdatenabsicherung aus PR #78.

## Bedienung

1. Inhaber oder Administrator: **Einstellungen → Benutzer & Rechte → Teamleiter bearbeiten**.
2. **Personalgespräche (MFA erforderlich)** aktivieren und die benötigten aktiven Mitarbeiter ausdrücklich auswählen. Speichern übernimmt Recht und Zuordnungen gemeinsam. Eine Freigabe ohne Mitarbeiter wird abgelehnt.
3. Teamleiter richten einen Authenticator ein, bestätigen MFA und öffnen im zugeordneten Mitarbeiterprofil **Personalgespräche**.
4. Der Bereich enthält neue Gesprächsnotizen, vereinbarte Ziele, Folgetermine und einzeln freigegebene berufliche Qualifikationen. Gesundheitsangaben gehören nicht in diesen Bereich.
5. Inhaber/Administrator können berufliche Qualifikationen im Bearbeitungsdialog ausdrücklich **für Personalgespräche freigeben**. Bemerkung und Zertifikatsnummer bleiben privat. Änderungen am Nachweis setzen seine Freigabe zunächst zurück.

Das Zusatzrecht ist standardmäßig aus. Bestehende Teamleiter und Mitarbeiter erhalten keine automatischen Freigaben. Bei Einladungen wird das Recht noch nicht vergeben; die Zuordnung erfolgt nach Annahme des Zugangs. Die vier Hauptrollen bleiben erhalten.

## Zugriff und Nachweis

| Gegenstand | Zugeordneter Teamleiter mit MFA | Inhaber/Administrator mit MFA |
|---|---|---|
| Name, Personalnummer, Funktion, Status | Lesen | Lesen |
| Neue Gesprächsnotizen, Ziele, Folgetermin | Lesen und hinzufügen | Lesen und hinzufügen |
| Für Gespräche freigegebene Qualifikationen | Minimale Angaben lesen | Verwalten und Freigabe bestimmen |
| Bestehende private Notizen, Dokumente, Detaildaten | Gesperrt | Bestehender Personalzugriff |
| Krankheitsgründe und medizinische Unterlagen | Gesperrt | Bestehender gesonderter Personalzugriff |
| Mitarbeiter ohne ausdrückliche Zuordnung | Gesperrt | Eigene Firma nach bestehendem Berechtigungskonzept |

Jeder erfolgreiche Personalakten-/Gesprächsaufruf und jede neue Gesprächsnotiz erzeugt einen Audit-Eintrag. Die Gesprächsinhalte werden nicht in Audit-Metadaten dupliziert. Einträge sind in dieser Oberfläche nur ergänzbar; bestehende Texte werden nicht überschrieben. Gesetzliche Auskunfts-, Berichtigungs- und Löschverfahren bleiben gesonderte organisatorische Prozesse.

Kontosperrung, Rollenwechsel, Nur-Lesen oder Entzug des Zusatzrechts entfernen die Zuordnungen. Nach Reaktivierung müssen sie ausdrücklich neu gewählt werden. Jede RPC prüft aktuelle Datenbankrechte, aktive Mitgliedschaft, Firmenzugehörigkeit, Mitarbeiterzuordnung und AAL2. Manipulierte UI-/JWT-Benutzermetadaten gewähren keinen Zugriff. Die sieben übrigen Personalverwaltungs-RPCs und privater Dokumentenspeicher bleiben auf den bisherigen Personalkreis beschränkt.

## Technische Prüfung

- SQL-Migration: `20261011225332_personnel_conversations_access.sql`, mit Supabase CLI erzeugt.
- Zusätzliche Migration: `20261011230604_atomic_conversation_qualification_approval.sql`.
- 15 fachliche PostgreSQL-Prüfungen plus Testhülle (16 erfolgreiche Tests): keine Standardfreigabe; MFA; unberechtigte Vergabe; atomarer Rollback; Firmen-/Mitarbeiter-/Benutzergrenzen; minimale Antwortfelder; Gesprächs- und Auditpersistenz; direkter Tabellen-/Speicherzugriff; Qualifikationsfreigabe und Widerruf; bestehende Personalrechte; Zuordnungswechsel; Kontosperrung; Rechteentzug; gesperrte anonyme RPCs und Invoker-Wrapper.
- Browserprüfung auf Desktop und Mobil: echte Personalaktenoberfläche mit fiktiven Daten, reduzierte Tabs, Schreibablauf, Escaping, Widerruf und Qualifikationsfreigabe.
- Benutzerverwaltung: vier Bildschirm-/Themevarianten einschließlich Mitarbeiterzuordnung und Rechtentzug.
- MFA: Erstregistrierung für Inhaber und Teamleiter, parallele Anforderungen, ungültiger Code und Abbruch.
- Vollständiger Lauf: 719 Tests erfolgreich (703 bestehende und 16 neue SQL-Prüfungen); statischer Build erfolgreich. Qualifikationsspeicherung und Freigabe erfolgen gemeinsam in einer Transaktion; parallele Bearbeitung kann die geprüften Angaben nicht zwischen Speichern und Freigabe austauschen.

Dies ist ein Implementierungs- und Prüfprotokoll für diese Zugriffserweiterung, keine umfassende DSGVO-Zertifizierung. Die konkrete Delegation, Erforderlichkeit, Schulung und zulässigen Gesprächsinhalte werden vom Unternehmen festgelegt.
