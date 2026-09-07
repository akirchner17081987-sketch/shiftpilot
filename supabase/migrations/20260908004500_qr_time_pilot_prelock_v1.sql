-- SchichtFunk – QR-Pilot Vorverriegelung
-- Falls die Basismigration in einer Umgebung bereits separat aktiviert wurde,
-- werden vorhandene QR-Terminals vor Einführung der Pilot-Constraint deaktiviert.

update public.time_qr_terminals
set is_active = false,
    disabled_at = coalesce(disabled_at, clock_timestamp()),
    updated_at = clock_timestamp()
where is_active = true;
