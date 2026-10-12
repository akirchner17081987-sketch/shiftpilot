# Unternehmensbezogene Planungsregeln

Unter **Einstellungen → Planungsregeln** werden die authentifiziert geladenen Daten des aktiven Unternehmens angezeigt. Der Bereich enthält allgemeine Monats-/Wochenlimits, Arbeits-/Nachtblöcke, Erholung, Optimierungsziele, bedingte OT-Abdeckung, aktive Schichtmodelle mit Pflichtbedarf und individuellen Freigaben, gespeicherte Teamrhythmen und persönliche Vorgaben aktiver Mitarbeiter. Schichtmodelle und Teamregeln verweisen auf die bestehenden Editoren unter Planung; persönliche Vorgaben auf Personal → Mitarbeiter.

Nur OWNER/ADMIN können die angebotenen allgemeinen Regeln speichern. PLANNER/DISPATCHER können lesen und entsprechend ihren bestehenden Rechten die bisherigen Schicht-/Team-/Mitarbeitereditoren benutzen. Authentifizierung, aktive Unternehmensmitgliedschaft und bestehende RLS bleiben erforderlich. READ_ONLY/TIME_TRACKING haben keine zusätzlichen Schreibrechte.

Keine Firmenregeln werden aus Browserdaten übernommen oder für andere Unternehmen kopiert. `planningPolicyCompanyId` und die geladene Schichtmodell-Identität müssen zum ausgewählten Unternehmen passen. Abmeldung und Unternehmenswechsel verwerfen die Regelansicht und den geladenen Stand. Die aktuelle SchichtFunk-Konfiguration einschließlich allgemeinem Maximum 190 h und ausschließlich berechtigter OT-Freigabe bis 220 h bleibt unverändert.

## Speichern und Wirkung

`manager_save_planning_rules` ist SECURITY INVOKER und prüft serverseitig Mitgliedschaft, Rolle, erlaubte Schlüssel, Ganzzahlen, Wertebereiche und gültige Schichtmodelle. Eine Zeilensperre und der erwartete JSON-Stand verhindern verlorene gleichzeitige Änderungen. Unbekannte oder technische Schlüssel wie `enabled`, Unternehmensidentität und Regelversion sind nicht bearbeitbar. Bekannte Werte werden mit dem bestehenden Regelwerk zusammengeführt, alle weiteren Regeln bleiben erhalten. Alle tatsächlichen Änderungen und optionaler Grund werden atomar über einen privaten Audit-Trigger in `audit_events` mit `PLANNING_RULES_UPDATED` gespeichert. Der Trigger ist nicht direkt durch Clients aufrufbar und gewährt ihnen keine INSERT-Rechte auf die geschützte Audit-Tabelle.

Client- und PostgreSQL-Regelprüfungen lesen dieselben gespeicherten Block-/Nacht-/Erholungs-/Wochenwerte. Die konfigurierte Monatsgrenze und modellspezifische automatische Stunden-/Dienstgrenzen gelten über den neuen monatlichen Prüfungs-Overload; frühere Funktionssignaturen bleiben kompatibel. Persönliche niedrigere Grenzen und OT-Berechtigung bleiben erhalten. Die Auto-Planung zeigt ihre Schutzwerte aus dem aktuellen Unternehmensregelwerk an. Veraltete Vorschauen werden erst nach bestätigtem Speichern verworfen; laufende Speichervorgänge blockieren einen Unternehmenswechsel. Bestehende Dienste werden weder geändert noch gelöscht.

Fest integrierte Schutzprüfungen wie mindestens 11 h Ruhe, Schichtwechsel O3 → frühere Nachtschicht, geschützte Zusagen und Freigabesperren können nicht durch die neuen Felder ausgeschaltet werden. Andere Regeln wie Sollbedarf, Einsatzwochentage, gemeinsame Leitung und persönliche Freigaben bleiben in ihren bestehenden Editoren verwaltbar. Inaktive Regelwerke werden angezeigt, aber nicht automatisch in das bestätigte Regelwerk konvertiert.

## Prüfung

- VM-Tests mit fiktiven Mitarbeiterdaten: Unternehmensgrenze, ausgeloggte Anzeige, Speicherfehler, Rollen, bestätigte Antwort und Vorschauverwerfen.
- JavaScript-Grenzfälle: tatsächlich veränderte Block-, Ruhe-, Wochen- und Monatsentscheidungen; nur vorhandene Schichtmodelle in Zusammenfassung.
- PGlite/PostgreSQL: Migration, Rollenprüfung, andere Unternehmen, gesperrte Schlüssel, Wertebereiche, bedingte Schichten, konkurrierende Änderungen, Audit-Atomizität und konfigurierte Monats-/Blockgrenzen.
- Bestehende Planungs-, OT-, Hilfecenter-, IONOS- und vollständige Regressionstests plus statischer Build.

Ein neuer visueller Browserlauf ist in dieser Umgebung nicht verfügbar; kein visueller Live-Test wird behauptet.
