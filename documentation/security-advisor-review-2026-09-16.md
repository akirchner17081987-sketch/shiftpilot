# SchichtFunk – Security-Advisor-Prüfung 16.09.2026

## Anlass

Fortsetzung von Punkt 9 während der 24-Stunden-Schutzfrist für das Datenschutz-/Lösch-Fristprofil. Diese Prüfung ist rein technisch und verändert keine Geschäfts- oder Personaldaten.

## Ergebnis Supabase Security Advisor

Der frühere Befund **Leaked Password Protection Disabled** ist nicht mehr vorhanden. Leaked Password Protection bleibt damit als aktiv bestätigt.

Verbleibende Befundklassen:

1. **RLS Enabled No Policy**
   - `private.privacy_legal_holds`
   - `private.privacy_lifecycle_requests`
   - `private.privacy_redaction_runs`
   - `private.privacy_retention_profiles`
   - `public.time_qr_pilot_employees`
   - `public.time_qr_punches`
   - `public.time_qr_terminals`

2. **Signed-In Users Can Execute SECURITY DEFINER Function**
   - 35 öffentliche RPCs für Mitarbeiter-, Manager-, Push-, Zeit- und QR-Funktionen.

## Bewertung der RLS-Hinweise

Für die vier `private`-Datenschutztabellen bestehen keine direkten Rechte für `anon` oder `authenticated`; Zugriff ist ausschließlich für `postgres` bzw. gezielt für `service_role` vorhanden.

Für die drei öffentlichen QR-Tabellen bestehen ebenfalls keine direkten Tabellenrechte für `anon` oder `authenticated`; direkter Tabellenzugriff ist damit gesperrt. Der Produktzugriff erfolgt über kontrollierte RPCs.

Die Advisor-Meldung ist deshalb in diesen Fällen ein dokumentierter Architekturhinweis und kein offener Direktzugriff.

## Bewertung der 35 SECURITY-DEFINER-RPCs

Lesende Produktivprüfung am 16.09.2026:

- `anon` besitzt für keinen der 35 geprüften öffentlichen SECURITY-DEFINER-RPCs Ausführungsrecht.
- `authenticated` darf die vorgesehenen Produkt-RPCs ausführen.
- Jeder für `authenticated` freigegebene SECURITY-DEFINER-RPC enthält eine interne Identitäts-, Mandanten-, Mitarbeiter- oder Managerprüfung bzw. delegiert an eine entsprechend geschützte interne Funktion.
- Server-/Worker-RPCs bleiben von `anon` und `authenticated` getrennt.

Damit werden die Advisor-Warnungen nicht pauschal durch Rechteentzug beseitigt, weil mehrere dieser RPCs absichtlich die gesicherte Produkt-API bilden. Die Warnungen bleiben als kontrollierte Allowlist-Befunde dokumentiert.

## MFA-Stufen

Produktiver Stand am 16.09.2026:

- Stufe 2 – Benutzer & Rechte: **4/4 aktiviert**
- Stufe 3 – Personalakte: **0/8 aktiviert**
- Stufe 4 – DATEV & Berichte: **0/9 aktiviert**
- Stufe 5 – QR-Sicherheitskonfiguration: **0/6 aktiviert**

Stufen 3–5 bleiben bewusst deaktiviert, bis die jeweils vorgesehene Produktivfreigabe erfolgt. Die vorhandene zentrale AAL2-Grenze und die 59/59 Branch-Assertions bleiben die technische Basis.

## Status

- Leaked Password Protection: 🟢
- RLS/RPC-only Tabellenzugriff: 🟢 kontrolliert und dokumentiert
- SECURITY-DEFINER-Allowlist: 🟢 intern autorisiert, Advisor-Warnung dokumentiert
- MFA Stufe 2: 🟢 produktiv
- MFA Stufen 3–5: 🟡 noch nicht produktiv aktiviert

## Supabase-Referenzen

- RLS Advisor: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- SECURITY DEFINER Advisor: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
