# Störfall und Ersatzübernahme – 21.10.2026

Geltung: alle Unternehmen, vom Nutzer bestätigt. Umsetzung der Analysepunkte 1–4; keine Änderung der Personalreihenfolge oder automatische Neuplanung des gesamten Monats.

- Veröffentlichter Dienst → Ausfall / Ersatz übernimmt exakt den gewählten Dienst. Laufende Dienste bieten Teilablösung oder Restdienst nach vollständigem Ausfall. Zukünftige Dienste zusätzlich vollständiger Ersatz.
- Direktbesetzung mit dokumentierter persönlicher/telefonischer Zusage; aktive Mitarbeiter ohne Portalzugang eingeschlossen. Rhythmusabweichungen benötigen ihre eigene ausdrückliche Bestätigung. Sonstige Schicht-, Qualifikations-, Vertrags-, Ruhezeit-, Abwesenheits-, Monats- und Veröffentlichungsprüfungen bleiben aktiv.
- Teilablösung kürzt ausschließlich das Planende des bisherigen Mitarbeiters und erzeugt einen neuen veröffentlichten Ersatzdienst. Ist-Zeiten bleiben unverändert am ursprünglichen Dienst. Offene Zeitbuchungen müssen vor der Ablösung abgeschlossen sein. Beim vollständigen Ausfall bleibt der ursprüngliche Dienst storniert; ein Abstand bis zum Ersatzbeginn bleibt unbesetzt.
- Die Übernahme verwendet einen bestehenden Änderungsantrag. Erforderliche Betriebsratsfreigaben bzw. Veröffentlichungsrechte bleiben Voraussetzung. Quelle, Ersatzdienst und Abschluss werden gemeinsam angewendet oder vollständig zurückgerollt. Eine digitale Zusage bei erforderlicher Betriebsratsfreigabe bleibt offen, bis die Disposition den Vorgang mit Freigabe abschließt.
- Top 3 überspringt alle bereits angefragten Personen, auch nach Ablehnung/Ablauf. Erneute Einzelanfrage ist ausdrücklich zu bestätigen; vorheriger Antwortstand wird im Audit erfasst.
- Ladefehler haben Wiederholen und sperren veraltete Aktionen. Keine digitalen Kandidaten, laufende Dienste und ausstehende Antworten erhalten unterschiedliche Texte. Späte Antworten aus einem anderen Unternehmens-/Benutzerkontext werden verworfen.

## Vertrauensgrenze

Neue öffentliche RPCs sind SECURITY INVOKER. Private Manager-Implementierungen sind echte vertrauenswürdige Schreiber für die bereits ausschließlich serverseitig beschreibbaren Störfall-/Angebotstabellen; ihre Definer-Eigenschaft dient nicht als Reparatur fehlender Tabellenrechte. Jeder Aufruf prüft auth.uid(), aktive Unternehmensmitgliedschaft, Rolle und read_only. Neue interne Validatoren sind Invoker ohne Client-EXECUTE. Trigger sehen die private unveränderliche Spezifikation und geben keine Tabellenrechte an Clients weiter.

Die private Vorgangstabelle hat RLS und keinerlei Tabellenrechte für anon/authenticated. Sie bindet die Freigabe an Quellversion, Zielperson, Intervall und Pflichtfreigaben. Ein verzögerter Trigger verhindert ein einzeln gespeichertes Kürzen des Quelldienstes. Abbruch storniert einen noch nicht angewendeten Änderungsantrag. FK-Cascades berücksichtigen das Entfernen von Dienst, Störfall, Änderungsantrag und Ersatzmitarbeiter. Bestehende allgemeine Tauschregeln werden nicht gelockert.

## Prüfung

Isolierte PostgreSQL-Tests mit aktuellen bestehenden Dienst-/Rhythmus-/Veröffentlichungsguards: Mandant, Rolle, Zustimmung, Version, Idempotenz, aktive Ausfälle, Zeitbuchungen, atomarer Fehlerfall, Freigaben, Abbruch, Rhythmus, feste Modellzeiten und erneute Angebote. UI-Tests: Vorauswahl, Offline-Personal, Klickschutz, Fehlerzustände und verspätete Unternehmensantworten. Browserprüfung: echter Diensteditor und Ersatzdialog in dunkel/hell bei Desktop/Mobil; abweichende Browserzeitzone. Reale Unternehmenspläne und Mitarbeiterdaten werden für diese Prüfungen nicht verändert.

## Freigabestand

- Migration 20261021193144 ist auf der Produktionsdatenbank angewendet.
- Gesamtsuite: 1.208 Tests bestanden; 14 neue fokussierte Prüfungen bestehen auch nach den letzten Anpassungen. Statischer Build erfolgreich.
- Rollback-Test mit ausschließlich synthetischem Unternehmen/Personal auf dem vollständigen Produktionsschema bestanden: laufende Teilablösung mit unveränderten Ist-Zeiten, neuer veröffentlichter Ersatzdienst, Wiederholung desselben Vorgangs, ausstehender Betriebsrat und Abbruch. Alle Testdaten zurückgerollt.
- Sicherheitsberater: RLS ohne Client-Policy für die neue private Tabelle ist absichtlich sperrend; keine neuen öffentlichen Definer-Funktionen.
