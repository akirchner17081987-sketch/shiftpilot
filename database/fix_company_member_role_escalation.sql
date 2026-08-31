-- SchichtFunk: direkte Selbstbeförderung von Unternehmensmitgliedern verhindern.
-- Rollen und Kontostatus dürfen ausschließlich über die geprüften Manager-RPCs
-- geändert werden. Diese laufen als SECURITY DEFINER und validieren den Akteur.

begin;

drop policy if exists company_members_update on public.company_members;
revoke update on table public.company_members from authenticated;

commit;

