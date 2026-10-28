-- Ersatzpersonen benötigen Schichtdaten, nicht den privaten Grund des Ausfalls.
-- Rückgabeform bleibt kompatibel; alte Angebote werden ebenfalls geschützt.
create or replace function private.employee_list_disruption_offers_impl()
returns table(offer_id uuid, offer_status text, incident_id uuid, shift_code text,
 starts_at timestamptz, ends_at timestamptz, incident_type text, note text,
 expires_at timestamptz, employee_comment text)
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_employee public.employees%rowtype;
begin
 perform private.sf_require_active_employee_access();
 if private.sf_has_time_only_login() then raise exception 'Dieser Zugang ist nur fuer die Zeiterfassung berechtigt'; end if;
 select * into v_employee from public.employees e where e.auth_user_id=v_uid and e.status='active' limit 1;
 if v_employee.id is null then raise exception 'Kein aktiver Mitarbeiterzugang gefunden'; end if;
 return query select x.id,case when x.status='OFFERED' and x.expires_at<=now() then 'EXPIRED' else x.status end,
 d.id,a.shift_code,a.starts_at,a.ends_at,'OTHER'::text,''::text,x.expires_at,x.employee_comment
 from public.disruption_offers x join public.disruption_incidents d on d.id=x.incident_id
 join public.shift_assignments a on a.id=d.assignment_id
 where x.employee_id=v_employee.id and x.company_id=v_employee.company_id
 order by case when x.status='OFFERED' and x.expires_at>now() and d.status='OPEN' then 0 else 1 end,x.offered_at desc limit 50;
end $$;
