# SchichtFunk – Fachentscheidung Fristprofil V2

Stand: 18.09.2026

## Verbindliche Betreiberentscheidung

Für den aktuellen SchichtFunk-Mandanten werden Arbeitszeit- und DATEV-bezogene Nachweise ab Ende des jeweiligen Abrechnungs-/Kalenderjahres wie folgt behandelt:

| Datenklasse | Frist | Umsetzung im Profil |
|---|---:|---|
| Ist-Arbeitszeiten einschließlich Korrekturen | 6 Jahre | `timeEvidenceYears: 6` |
| QR-Kommen-/Gehen-Buchungen | 6 Jahre | `timeEvidenceYears: 6` |
| Stundenkonten und Monatsabschlüsse | 6 Jahre | `monthSnapshotYears: 6` |
| DATEV-LODAS-Exportnachweis (Monat, Zeilenzahl, Hash) | 6 Jahre | `datevAuditYears: 6` |
| Generierte DATEV-Datei | keine dauerhafte Serverspeicherung | Kundenaufbewahrung 6 Jahre; 8 Jahre bei Einordnung als Buchungsbeleg |

Nach Fristablauf erfolgt Löschung oder kontrollierte Anonymisierung/Redaktion, soweit kein Legal Hold, keine laufende Prüfung bzw. kein Verfahren und keine dokumentierte längere Kundenregel entgegensteht. Die konkrete rechtliche Einordnung bleibt Verantwortung des jeweiligen Arbeitgebers/Kunden und ist im AVV/Onboarding zu bestätigen.

## Technische Freigabe

Der am 16.09.2026 vorbereitete Entwurf V1 enthält für `timeEvidenceYears` noch 3 Jahre. Er wurde am 18.09.2026 um 00:13:17 UTC aus einer bereits geöffneten alten Adminansicht bestätigt und ist damit technisch aktiv, fachlich aber überholt. Die Profilregeln und ihr Hash blieben unverändert; es liegt keine nachträgliche Manipulation des Entwurfs vor.

Nach ausdrücklicher Betreiberfreigabe wurde V2 am 18.09.2026 um 00:41:14 UTC durch die einmalige kontrollierte Migration `20260918004114_privacy_retention_profile_v2_controlled_activation` sofort aktiviert. V1 und V2 wurden dabei in einer Transaktion umgeschaltet: V1 ist seitdem `REVOKED`, V2 ist `APPROVED`. V2 trägt bewusst den Freigabemodus `CONTROLLED_MIGRATION`, damit die Ausnahme nicht als reguläre AAL2-Doppelbestätigung dargestellt wird.

Das unveränderliche Audit-Ereignis `RETENTION_PROFILE_CONTROLLED_ACTIVATION` enthält Alt-/Neuregeln, beide Profil- und Regel-Hashes, Betreiberbezug, Migrationskennung, Ausnahmegrund und den Nachweis `noDeletionExecuted=true`. V2 hat den gültigen Regel-Hash `c31ab5bc242da71498914b1fcb1959a2d350649e3682019c888d644de733bf7f`.

Die Ausnahme ändert weder die normale Stage-/Confirm-Funktion noch deren Schutzregeln. Für alle zukünftigen Fristprofiländerungen gelten weiterhin zwei AAL2-Bestätigungen aus unterschiedlichen Sitzungen, mindestens 24 Stunden Abkühlfrist, sieben Tage Bestätigungsfenster und die atomare Nachfolgeraktivierung. Zusätzlich wurde der direkte Schreibzugriff des App-`service_role` auf die Fristprofiltabelle entfernt; Lesezugriff und die geschützten RPCs bleiben aktiv. Die vorhandene Automatik redigiert DATEV-/Audit-Klarinhalte und Monats-Snapshots nach V2. Die spätere physische Löschung oder Anonymisierung der eigentlichen Arbeitszeit-/QR-Nachweise muss vor Fälligkeit der ersten Sechsjahresfrist als eigener, getesteter Datenklassenpfad ergänzt werden; die V2-Freigabe allein löschte keine historischen Zeitbuchungen.

## Rechtsrahmen der Entscheidung

- § 16 Abs. 2 ArbZG: Mindestaufbewahrung bestimmter Arbeitszeitnachweise von zwei Jahren.
- § 41 EStG: Aufbewahrung des Lohnkontos bis zum Ablauf des sechsten Kalenderjahres nach der letzten Eintragung.
- § 147 AO: acht Jahre für Buchungsbelege, soweit die konkrete Datei entsprechend einzuordnen ist.
- Art. 5 Abs. 1 Buchst. e DSGVO: Speicherbegrenzung; keine Aufbewahrung ohne fortbestehenden Zweck oder Pflicht.

Diese Unterlage ist eine technische/fachliche Produktentscheidung und keine individuelle Rechtsberatung.
