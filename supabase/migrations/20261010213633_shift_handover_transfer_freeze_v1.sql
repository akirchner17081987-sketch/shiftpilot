-- Internal target freeze runs after the source/company/next-shift authorization.
-- Serialize with staged employee erasure before any board-wide snapshot or transfer.
create or replace function private.sf_handover_freeze(p_board uuid) returns void
language plpgsql security definer set search_path='' as $$
declare company_ uuid; ids_ uuid[];
begin
 if auth.uid() is null then raise exception 'Keine Übergaberechte.' using errcode='42501';end if;
 select company_id into strict company_ from public.shift_handovers where id=p_board;
 select array_agg(distinct employee_id) into ids_ from (
 select a.employee_id from public.shift_assignments a join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code join public.shift_handovers b on b.company_id=a.company_id and b.shift_code=a.shift_code and b.starts_at=a.starts_at and b.ends_at=a.ends_at and b.site_id is not distinct from t.site_id where b.id=p_board
 union select employee_id from public.shift_handover_items where board_id=p_board
 union select responsible_employee_id from public.shift_handover_items where board_id=p_board
 union select employee_id from public.shift_handovers where id=p_board) employees_;
 perform 1 from public.employees e where e.company_id=company_ and e.id=any(ids_) order by e.id for key share;
 if exists(select 1 from private.employee_erasure_jobs j where j.company_id=company_ and j.status='EXTERNAL'
 and exists(select 1 from unnest(ids_) employee_ where j.plan->'references' ? employee_::text)) then
 raise exception 'Für einen Mitarbeiter dieser Übergabe läuft die endgültige Löschung. Änderungen sind gesperrt.';end if;
end $$;
revoke all on function private.sf_handover_freeze(uuid) from public,anon,authenticated;

