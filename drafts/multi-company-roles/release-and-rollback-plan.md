# Mehrunternehmenszugänge: Prüf- und Übernahmeplan

Stand der Vorbereitung: 06.11.2026. Status: nicht produktionsreif und nicht freigegeben.

## Bisher geprüft

- Ein bestehendes bestätigtes Konto nimmt eine gemeinsame Einladung an: Mitarbeiterrolle in Unternehmen A, Administratorrolle in B. Eine berechtigte Verwaltung verknüpft danach ein vorhandenes Mitarbeiterprofil in C; die Administratorrolle in B bleibt bestehen. `mixed-invite-and-employee-access-rollback-test.sql`.
- Ein Mitarbeiter reicht im aktiven Unternehmen die Übernahme eines offenen Dienstes ein. Die Verwaltung genehmigt sie; die Zuordnung zum passenden Unternehmen und Mitarbeiter ist im Dienstplan vorhanden. Ein Angebot des anderen Unternehmens wird zurückgewiesen. `open-shift-positive-claim-rollback-test.sql`.
- Die Regressionstests zu Freigabe von Mitarbeiterprofilen, Rücknahme von Tauschangeboten, Entscheidungen zu Dienstplanänderungen, Suche nach Tauschpartnern sowie Störfallantworten und -listen liefen nacheinander in QA erfolgreich. Fiktive Daten wurden jeweils zurückgerollt.
- Die Tests verwenden die QA-Datenbank und dort installierte Mehrunternehmensfunktionen; die QA-Datenbank ist kein vollständiger Produktionsklon. Keine Aussage zu tatsächlichem E-Mail-Versand, Browserdarstellung, QR-Kamera oder vollständigem Portal.

## Festgestellter Produktionsstand (nur lesender Abgleich)

- `public.employees_auth_user_id_uidx` erzwingt global höchstens ein Mitarbeiterprofil pro Konto. Für mehrere Unternehmen muss die globale Einschränkung in eine pro Unternehmen und Konto umgestellt werden.
- Am 06.11.2026 ergab die aggregierte Abfrage: keine mehrfachen Kontoprofile innerhalb eines Unternehmens, keine bestehenden mehrfachen Mitarbeiterprofile und keine aktiven Mitarbeiterprofile oder Teammitgliedschaften mit unbestätigter Auth-E-Mail. Diese Momentaufnahme muss unmittelbar vor einer möglichen Migration wiederholt werden.
- Schema und Funktionsdefinitionen in QA weichen von Produktion ab. Alle Entwürfe müssen gegen den dann aktuellen Produktionsstand abgeglichen und die Kombination in einer produktionsgleichen Staging-Umgebung getestet werden.

## Offene Freigabebedingungen

1. Vollständige Inventur aller alten und neuen Portal-RPCs und RLS-Regeln; bei Auswahl, Mutationen, Sperrung, parallelen Sitzungen und Rollenwechsel muss die Berechtigung für das konkrete Unternehmen nachgewiesen sein. Untersuchte Einzelaktionen reichen nicht als Vollständigkeitsnachweis.
2. Sämtliche SQL-Entwürfe einschließlich Einladungsannahme, Mitarbeiterfreigabe, Unternehmensidentität, Index und Portalaktionen zu einer konsistenten Migration zusammenstellen; Reihenfolge, Abhängigkeiten, Rechte und aktuelle Funktionen abgleichen. Einzelne Kandidaten nicht ungeprüft in Produktion einspielen.
3. Einheitliche Staging-Tests mit realem Auth-Verhalten, existierenden und neuen Konten, Einzel- und Mehrfacheinladungen, Bestätigung vor Zugriff, Rollenwechsel, Widerruf und Konkurrenzfällen. Einladungsversand über echte SMTP-Konfiguration und vollständiger Portalablauf ohne QA-Adapter fehlen.
4. IONOS-Auslieferungsweg, tatsächlichen Stand der Frontend-Dateien, Caching und die zuständigen Bereitstellungszugänge verifizieren; die Supabase-Migration und das kompatible Frontend müssen zusammenpassen.
5. Backup und Wiederherstellungsmöglichkeit überprüfen, Betriebsfenster und Monitoring vorbereiten. Erst nach bestandenem Test über Veröffentlichung entscheiden.

## Vorläufiges Bereitstellungskonzept

- Aktuelle produktive Funktionsdefinitionen, Grants, Policies, Index und Frontend-Version revisionsfähig sichern; aktuellen Datenbank-Backup-/Restore-Stand bestätigen.
- Vorbedingungen und Sicherheitstests kurz vor dem Start erneut ausführen. Die Migration zuerst in produktionsgleicher Staging-Umgebung und zusammen mit dem vorgesehenen Frontend testen.
- Mit deaktivierter Mehrunternehmensfunktion und konsistenter Migration/kompatiblem Frontend ausrollen; die neue Funktion erst nach erfolgreicher technischer Kontrolle aktivieren. Bestehende Einladungen und Anmeldungen im Anschluss prüfen.
- Konkrete Migration, Aktivierung, Betriebschecks und ein sicheres Zurückrollen sind noch nicht vollständig erstellt oder getestet; dieser Plan allein ist keine Ausführungsanweisung.

## Rückfall und Datenintegrität

- Aktivierung neuer Freigaben bei Fehlern stoppen und bestehende Zugriffe überwachen. Eine einfache Abschaltung des Frontend-Schalters beweist nicht, dass alte Endpunkte mit bereits erzeugten Mehrfachprofilen sicher funktionieren.
- Den alten globalen Index nicht blind wiederherstellen: Sobald ein Konto Profile in mehreren Unternehmen hat, schlägt das fehl. Profile, Rollen und bestehende Dienste nicht automatisch löschen oder zusammenführen.
- Stattdessen eine bereits getestete kompatible Version mit den Unternehmensgrenzen vorhalten und den Fehler gezielt beheben. Eine Datenbankwiederherstellung nur nach Prüfung der seit dem Backup erfolgten Änderungen und ihrer Auswirkungen durchführen.
- Der konkrete Notfallpfad für bereits vorhandene Mehrfachprofile muss vor Live-Schaltung implementiert und in Staging erprobt werden.
