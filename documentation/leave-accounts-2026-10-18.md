# Urlaubskonto – 18. Oktober 2026

In der Verwaltung unter **Personal → Abwesenheit → Urlaubskonten** wählen
Inhaber oder Administratoren einen Mitarbeiter und ein Kalenderjahr. Nach der
zweiten Anmeldestufe können sie Jahresanspruch und Übertrag mit einer Begründung
speichern. Es wird kein pauschaler Anspruch vorgegeben. Bestehende Personaldaten
und Abwesenheiten werden durch die Migration nicht verändert.

Im Mitarbeiterportal erscheint das eigene Urlaubskonto unter **Abwesenheiten**.
Der Rest ergibt sich aus Jahresanspruch + Übertrag − bestätigten Anrechnungstagen
aller genehmigten/erfassten Urlaube des gewählten Jahres, einschließlich zukünftiger
Zeiträume. Offene Anträge erscheinen getrennt und reduzieren den Rest noch nicht.
Ein Minus bleibt sichtbar, damit eine Überbuchung nachvollziehbar ist.

Kalendertage, Wochenenden und vorhandene Dienstzuordnungen sind bei wechselnden
Schichten keine verlässliche automatische Urlaubsbewertung. Deshalb bestätigt die
Personalverwaltung je Zeitraum und Jahr die tatsächlich anzurechnenden Tage.
Bei neuen Genehmigungen geschieht dies im Genehmigungsdialog und derselben
Datenbanktransaktion. Vorhandene Urlaube werden im Urlaubskonto nachbewertet.
Auch 0 Tage und Bruchteile sind möglich. Andere Abwesenheitskategorien werden
nicht abgezogen. Bei fehlendem Anspruch oder ungeprüften genehmigten Urlauben
wird kein verbindlicher Rest ausgewiesen.

Über den Jahreswechsel erfolgt die Anrechnung getrennt je Jahr. Jahresanspruch
und Übertrag werden ausdrücklich je Jahr gepflegt; die Anwendung nimmt keinen
automatischen Anspruch, Übertrag oder Verfall an. Eine rechtliche oder tarifliche
Anspruchsberechnung ist nicht Teil dieser Funktion.

Änderungen an Mitarbeiter, Unternehmen, Kategorie, Zeitraum oder Tagesumfang
machen eine gespeicherte Anrechnung ungültig. Das Konto weist sie erneut als
ungeprüft aus. Abgelehnte oder gelöschte Urlaube werden nicht mehr abgezogen.
Jahreskonten haben einen Versionsschutz, Anrechnungen prüfen den erwarteten
Zeitraum und vorherigen Wert. Änderungen werden im Audit protokolliert.

Die zwei privaten Tabellen sind durch RLS und fehlende Tabellenrechte geschützt.
Öffentliche RPCs laufen als Aufrufer und delegieren an private Funktionen mit
expliziter Authentifizierungs-, Unternehmens- und Rollenprüfung. Mitarbeiter
erhalten nur das mit ihrem Zugang verknüpfte aktive Profil im gewählten Unternehmen.
Teamleiter erhalten keine neuen Personalverwaltungsrechte. Die vorhandene
MFA-Prüfung `personnel_admin_role` bleibt für Verwaltung und Änderungen wirksam.

Prüfung: `npm run test:leave` enthält echte PostgreSQL-Prüfungen mit PGlite und
Browserabläufe in vier Kombinationen aus Bildschirmgröße und Hell-/Dunkelmodus.
Zusätzlich die bestehenden Portal-/Abwesenheitsprüfungen und `npm test` ausführen.
Die Datenbankmigration muss vor dem zugehörigen Frontend veröffentlicht werden.

## Abnahme des Antragsablaufs

Der Browser übergibt das ausgewählte Unternehmen an
`employee_submit_absence_request_for_company`. Die Datenbank prüft die aktive
Mitarbeiterzuordnung genau für dieses Unternehmen. Der alte Endpunkt akzeptiert
nur eine eindeutige aktive Zuordnung. Die produktive Datenbank erlaubt derzeit
ein Mitarbeiterprofil je Auth-Zugang; der Zwei-Firmen-Test verwendet deshalb
getrennte fiktive Mitarbeiterzugänge und einen Verwaltungskontext für beide Firmen.

Der SQL-Test unter `tests/sql/leave-workflow-rollback.sql` wurde gegen die
produktiven RPCs ausgeführt: Antrag lässt 30 Tage unverändert; Genehmigung von
3 Anrechnungstagen ergibt 27 Tage. Im zweiten Unternehmen wurden zusätzlich ein
falsches Unternehmen abgewiesen und nach Löschen des Testurlaubs wieder 30 Tage
ermittelt. Alle Testschreibvorgänge einschließlich Benachrichtigungen und Audit
liegen in zurückgerollten Untertransaktionen. Die echten Urlaubskonten bleiben
unverändert. Das ist ein Datenbanktest mit Auth-Anfragekontext, kein interaktiver
Anmeldetest mit echten Benutzerpasswörtern.
