# Verbindliche Wochenendbesetzung für normale OT

Für Secontec Services gilt an jedem Samstag und Sonntag eine Mindestbesetzung von drei unterschiedlichen Mitarbeitern im normalen OT-Dienst. OT1, OT2 und OT3 gehören weiterhin zur getrennten Werktagsgruppe und zählen nicht als Ersatz.

Der gespeicherte Januar-Vorschlag vom 19.10.2026 enthielt vier Wochenend-OT bei einem Bedarf von 30. Der globale SOLL-Wert war bereits drei; es fehlte die verbindliche kritische Schichtregel. `criticalShifts` enthält nun OT mit Minimum drei und den ISO-Wochentagen sechs und sieben. Die vorhandene Priorisierung verwendet diese Regel für lokale und fortsetzbare Hintergrundplanung. Einstellungen und Auto-Planung zeigen die Regel gesondert an.

Standardwerte, optionale Schichtmodelle und niedrigere Tagesausnahmen können die Wochenendmindestbesetzung nicht reduzieren. Höherer Bedarf bleibt möglich. Die serverseitige Übernahme prüft unterschiedliche Mitarbeiter sowie die vollständige OT-Schichtzeit und lehnt eine Unterbesetzung atomar ab. Die Marktplatzberechnung verwendet denselben Mindestbedarf. Andere Unternehmen und das separate 8-Stunden-Modell behalten ihr Regelwerk.

Verifikation: Tests für 30 besetzte Wochenendpositionen, unzureichenden Personalbestand, gesperrte Übernahme, gespeicherte Hintergrundaufträge, Tageswerte unter drei, höheren Bedarf, Feiertagswochenenden, doppelte Mitarbeiter, stornierte Dienste, OT2 als unzulässigen Ersatz, verkürzte OT-Dienste und Unternehmensabgrenzung. Der vollständige Funktionstestlauf umfasst 1.051 erfolgreiche Tests.

Die Kandidaten des gespeicherten Januar-Datenstands enthalten am 09., 16., 23. und 30.01.2027 weniger als drei zulässige Mitarbeiter für OT. Die neue Mindestregel erteilt keine zusätzlichen Schichtfreigaben und überschreibt keine persönlichen Sperren oder Erholungsregeln. Eine Neuplanung kann diese Konflikte daher offen ausweisen und darf bei fehlender Pflichtbesetzung nicht übernommen werden. Der gespeicherte Vorschlag und der Dienstplan werden durch die Regeländerung nicht automatisch ersetzt.
