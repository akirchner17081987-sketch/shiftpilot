# Hilfe-Center und Planungsassistent – 30.10.2026

Zwölf zusätzliche Artikel ergänzen den vorhandenen Katalog auf 270 Artikel in
22 Kategorien. Die Ergänzungen erklären Abschlussmeldungen und Empfänger,
Planungsergebnis und Exportgrenzen, Pausenüberschreitungen, Belastungsverteilung,
kurzfristige Übernahmen, Wunschbilanz, Planstatus, reine Verwaltungszugänge und
den aktuellen Unternehmenskontext.

Gezielte Themenzuordnungen werden vor allgemeinen Monats-, Export- und
Besetzungsanalysen ausgewertet. Fragen nach einer Fertigmeldung lösen dadurch
keinen Monatscheck mehr aus; Planungsbericht-PDF wird nicht mit einem
Arbeitszeitbericht verwechselt. Die vorhandene Ergebnisdiagnose hat keinen
gesonderten PDF-Export. Dies wird ausdrücklich erklärt, ohne eine zusätzliche
Exportfunktion zu behaupten. Die Fragenübersicht enthält die neuen Themen.

Der Assistent übernimmt Ergänzungen ausschließlich zu vorhandenen Artikeln aus
der bereits authentifiziert geladenen privaten Konfiguration des ausgewählten
Unternehmens. Unbekannte Titel werden nicht eingeschleust. Fehlende Anmeldung,
falsches Unternehmen und Demo verwenden nur öffentliche Antworten. Antworten
werden weiterhin über textContent dargestellt, ohne HTML auszuführen. Wechsel
des Unternehmens oder der wirksamen Hilfeantworten verwerfen den alten Chat.
Die privaten Antworten werden nicht in Browser-Speicher geschrieben.

Die produktive Pausenprüfung wurde am 30.10.2026 ausschließlich lesend anhand
von private.sf_notify_long_qr_breaks und des aktiven Cron-Auftrags
schichtfunk-qr-pause-admin-alert abgeglichen: Summe je Schicht einschließlich
laufender Pausen, Schwelle strikt größer als 3600 Sekunden, laufende oder in den
letzten 24 Stunden beendete QR-Schichten, aktive Administratoren und Teamleiter,
ein Beleg je Empfänger und Schicht. Der Zeitauftrag verwendet Europe/Berlin und
die Stunden 8 und 19 bei Minute 30. Die persönliche Zwei-Minuten-Vorwarnung ist
ein gesonderter Vorgang. Keine Datenbankänderung und keine Testnachricht.

Quellen für weitere Erläuterungen: autonomous-planning-v1.js,
background-auto-plan-v1.js, reports-workspace-v1.js,
fairness-overview-2026-10-28.md, employee-management-v2.js und
compliance-core-v2.js. Es wurden keine Unternehmensregeln, Rechte, Dienste,
Arbeitszeiten oder Berechnungsverfahren geändert.

Validierung: neue Regressionen für zwölf natürliche Fragen sowie private
Antworten, Anmeldung, Demo, Unternehmenswechsel und unveränderte Eingangsdaten;
bestehende Hilfe-, Assistenten- und Mandantenschutzprüfungen sowie statischer
Produktionsbuild. Browserprüfungen und Veröffentlichung werden über die
vorhandenen GitHub-Workflows verifiziert.
