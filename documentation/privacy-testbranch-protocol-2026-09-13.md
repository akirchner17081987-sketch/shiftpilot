# SchichtFunk – Protokoll Wegwerf-Testbranch Datenschutz

Stand: 13.09.2026

## Testumgebung

- Supabase-Branch: `privacy-restore-test-2026-09-13`
- Branch-Referenz: `hltqgxdhnpueweoyazea`
- Elternprojekt: `zbvloohfjleadjnqhbbh`
- Modus: nicht persistent, ohne Produktionsdaten (`with_data=false`)
- bestätigter Preis: 0,01344 USD pro Stunde bis zur Löschung des Branches

Die anfänglich sichtbare Migrationshistorie des Branches enthielt nur elf Einträge. Ein read-only Objektvergleich ergab dennoch für Hauptprojekt und Branch exakt dieselben 41 Relationen sowie 183 Funktionen in `public` und `private`. Die unvollständige Historienanzeige wurde deshalb nicht als Schema-Nachweis verwendet.

## Installierte, nicht produktive Datenschutzbausteine

1. private, idempotente Lifecycle-Warteschlange;
2. versionierte Fristprofile, Zwei-Personen-Freigabe und Legal Holds;
3. vollständige Offboarding-Vorschau für Datenbank, Auth und Storage;
4. gemeinsame serverseitige AAL2-Prüfung;
5. Korrektur überfälliger Löschzeitpunkte: sofort fällig, aber nie vor Antragstellung;
6. zweiphasige Ausführung: `ACCESS` sofort, `ERASURE` erst nach Frist und Legal-Hold-Prüfung.

Es wurde kein Zeitplan installiert und nichts auf das Produktivprojekt migriert.

## Testergebnisse

| Prüfung | Ergebnis |
|---|---|
| exakte Allowlist der 35 öffentlich erreichbaren `SECURITY DEFINER`-RPCs vor und nach den Testmigrationen | 0 Abweichungen |
| Lifecycle-/Offboarding-/MFA-Test mit ausschließlich fiktiven Konten und Mandanten | 41 geplant, 41 ausgeführt, 0 fehlgeschlagen; vollständiger Rollback |
| logischer Datenbank-Export/Löschen/Wiederherstellen eines fiktiven Mitarbeiterdatensatzes | 4 geplant, 4 ausgeführt, 0 fehlgeschlagen; vollständiger Rollback |
| privater Storage-Export/Löschen/Wiederherstellen | 47 Byte, SHA-256 `42b7a4667d9e167edf8b114bad417fd651d0bc683ad8815bb58e7c09fdc6039b`, bytegleich wiederhergestellt |
| Storage-Bereinigung nach dem Test | 0 verbleibende Objekte |
| Security Advisor nach DDL | nur erwartete Klassen: 35 allowlist-geprüfte RPCs; 3 private RPC-only Tabellen plus 3 bekannte QR-RPC-only Tabellen ohne direkte RLS-Policy |
| Testbranch-MFA | TOTP aktiviert, AAL1-Limit 15 Minuten, SMS deaktiviert, maximal 10 Faktoren |
| Leaked Password Protection | auf dem Testbranch noch deaktiviert; App-Fehlerbehandlung ist vorbereitet, Aktivierung nicht per UI vorgenommen |

## Durch den Test gefundene und behobene Fehler

- Die Testrolle `EMPLOYEE` war für `company_members` ungültig; Beschäftigte werden über `employees.auth_user_id` verknüpft, eine zusätzliche lesende Mitgliedschaft verwendet die gültige Rolle `VIEWER`.
- Ein mehr als 30 Tage zurückliegendes Austrittsdatum erzeugte einen Löschzeitpunkt vor der Antragstellung. Die Folgemigration klemmt den Zeitpunkt auf frühestens `requested_at`.
- Die erste Fassung hätte die Zugriffssperre bis zur Löschfrist verzögert. Der Zustandsautomat trennt nun sofortige Zugriffssperre und spätere Löschung.
- Legal Holds blockieren die Löschung, aber nicht die sicherheitsnotwendige Deaktivierung des Zugangs.
- Eine fremde Mandantenmitgliedschaft wird erhalten und verhindert weiterhin die automatische Auth-Kontenlöschung.

## Bewusst offene Grenzen

- Ein physischer Restore eines Supabase-Tagesbackups wurde nicht gestartet; er ist nicht mit einem logischen Branch-Test gleichzusetzen und kann eine weitere kostenpflichtige Ressource erfordern.
- Das globale Widerrufen von Auth-Sitzungen und eine gegebenenfalls zulässige Auth-Kontenlöschung benötigen den Admin-API-Schritt des späteren Workers.
- Personalakten-Storage, Audit-Payloads und geschlossene Monatssnapshots dürfen erst nach kundenspezifischer Fristentscheidung und eigener Redaktionsprüfung gelöscht werden.
- Leaked Password Protection wird erst nach einem echten Branch-Auth-Test aktiviert. Die UI-Sicherheitsoption wurde lediglich gelesen.
- Die 35 RPCs sind strukturell exakt geprüft; zusätzliche fachliche Fremdmandanten-Negativtests je RPC-Gruppe bleiben Teil der Produktivfreigabe.

Status: 🟢 **WEGWERF-TESTS FÜR LIFECYCLE, LOGISCHEN DB-RESTORE UND STORAGE-RESTORE BESTANDEN**; 🟡 **PHYSISCHER BACKUP-RESTORE, AUTH-ADMIN-SCHRITT UND KUNDENSPEZIFISCHE LANGFRISTLÖSCHUNG OFFEN**.
