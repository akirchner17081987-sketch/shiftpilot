# Planungsassistent: PDF, Rückfragen und Prüfgrundlage

Der Assistent bietet unter Planungsbericht beziehungsweise über die Frage
„Planungsbericht erstellen“ einen eigenen lokalen PDF-Download. Er enthält die
Prüfgrundlage, Pflichtbesetzung, sämtliche offenen Positionen, aktuelle
Einzelprüfungen, Prüfpunkte, Stunden und Monatsabweichungen sowie gekennzeichnete
manuelle Einplanungen. Bestehende historische Enddiagnosen werden separat mit
ihrem ursprünglichen Stand wiedergegeben. Freie Personalnotizen und
Abwesenheitsgründe werden nicht exportiert. Ein Bericht speichert oder
veröffentlicht keine Dienste und versendet keine Nachrichten.

Der Export umfasst höchstens 62 Tage. Alle offenen Positionen bleiben enthalten;
die aktuelle Kandidatenprüfung ist auf 40 Schichten und ein Zeitbudget von
1,2 Sekunden begrenzt. Ungeprüfte Ursachen werden gekennzeichnet. Eine passende
Person für einen einzelnen Dienst ist keine gemeinsame Besetzungszusage. Das
Monats-SOLL wird nur bei einem vollständig enthaltenen einzelnen Kalendermonat
bewertet. Geteilte TL-Bedarfe werden nicht doppelt gezählt. Eine fehlende
gespeicherte Diagnose wird nicht nachträglich erfunden.

Der PDF-Export verwendet vorhandene lokale jsPDF/AutoTable-Bibliotheken und
lizenzierte DejaVu-Unicode-Schriften. Die Schriften wurden auf lateinische,
griechische, kyrillische und arabische Zeichen sowie benötigte Interpunktion
reduziert; Lizenz und Quelldateihinweis liegen neben den Schriften. Tabellen
werden vollständig über Seiten verteilt, Spaltenköpfe wiederholt und alle
Seiten mit Unternehmen, Berichtsbezeichnung und Seitennummer versehen. Es gibt
keine externe PDF-API und keinen Upload. Vor und nach dem Laden der Bibliotheken
sowie vor dem Download werden Zugang, Rechte, Unternehmenskontext, gewählter
Zeitraum und Planungsrevision erneut verglichen. Veraltete Berichte müssen neu
erstellt werden.

Allgemeine Stundenfragen bieten zwei konkrete Rückfragen. Die Wahl behält
Person und Zeitraum. Planstunden werden aus dem Plan berechnet; für erfasste
oder bestätigte Arbeitszeit führt die Antwort in die vorhandene Auswertung und
fordert dort die passende Auswahl. Die Antwort erfindet keine Ist-Zahlen.
Allgemeine Planungshilfe bietet Monatsprüfung, Bedienhilfe oder PDF-Bericht.
Eindeutige Planungsaufträge und bekannte Bedienfragen behalten ihre Abläufe.

Jede Datenanalyse zeigt ihre tatsächliche Prüfgrundlage: Unternehmen, geprüften
Zeitraum, Entwürfe/veröffentlichte/unklare Status, Datenumfang, Abrufzeit und
Hinweise zur Vollständigkeit. Die Abrufzeit wird erst nach erfolgreicher
Unternehmens-Hydrierung geschrieben und bei erneuter Hydrierung, Fehlern und
Unternehmenswechsel ungültig. Unternehmens- und Benutzerkennung müssen passen.
Mögliche Abrufgrenzen bei unpaginierten Quellen, mehr als fünf Minuten alte
Abrufe, ausstehende Speicherungen, fehlende Regeln und ausdrücklich begrenzte
Analysen werden sichtbar benannt. Ein erfolgreicher Abruf wird nicht als
pauschaler Vollständigkeitsnachweis für Randdaten ausgegeben.

Validierung: Rechen- und Routingregressionen, falscher Unternehmenskontext,
Fehler beim mehrseitigen Datenabruf, vollständige Tabellen und begrenzte
Diagnosen, echte PDF-Erzeugung mit Unicode-Namen sowie Desktop-/Mobilprüfungen
für Rückfragen, Download und Datenwechsel während der Erstellung. Die PDF wurde
mit fiktiven Daten erzeugt, auf vier Seiten gerendert und visuell geprüft.
Hilfe-Center und Funktionsinventar sind entsprechend aktualisiert.
