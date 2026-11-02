-- Delete only locations without linked operational records.
create or replace function private.manager_delete_company_location(p_company_id uuid, p_site_id uuid, p_expected_revision bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.company_locations%rowtype; models bigint; terminals bigint; handovers bigint; reasons text[];
begin
 if not private.sf_company_profile_can_write(p_company_id) then
   raise exception using errcode='42501', message='Nur Inhaber und Administratoren dürfen Standorte löschen.';
 end if;
 perform private.sf_assert_company_admin_mfa(p_company_id,'manager_delete_company_location');
 if p_site_id is null or p_expected_revision is null then
   raise exception using errcode='22023', message='Standort oder Versionsstand fehlt.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('company-locations:'||p_company_id::text,0));
 select * into s from public.company_locations where id=p_site_id and company_id=p_company_id for update;
 if not found then raise exception using errcode='P0002', message='Der Standort wurde nicht gefunden. Bitte neu laden.'; end if;
 if s.revision<>p_expected_revision then raise exception using errcode='40001', message='Der Standort wurde zwischenzeitlich geändert. Bitte neu laden.'; end if;
 select count(*) into models from public.shift_templates where company_id=p_company_id and site_id=p_site_id;
 select count(*) into terminals from public.time_qr_terminals where company_id=p_company_id and site_id=p_site_id;
 select count(*) into handovers from public.shift_handovers where site_id=p_site_id;
 if models+terminals+handovers>0 then
   reasons:=array[]::text[];
   if models>0 then reasons:=array_append(reasons,models||' Schichtmodell(e)'); end if;
   if terminals>0 then reasons:=array_append(reasons,terminals||' QR-Terminal(s)'); end if;
   if handovers>0 then reasons:=array_append(reasons,handovers||' Schichtübergabe(n)'); end if;
   raise exception using errcode='23503', message='Löschen nicht möglich. Zugeordnet: '||array_to_string(reasons,', ')||'. Bitte Zuordnungen prüfen oder Standort archivieren.';
 end if;
 begin
  delete from public.company_locations where id=p_site_id and company_id=p_company_id;
 exception when foreign_key_violation then
  raise exception using errcode='23503',message='Der Standort wird noch verwendet. Bitte Zuordnungen prüfen oder Standort archivieren.';
 end;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata)
 select p_company_id,'COMPANY_LOCATION_DELETED','company_location',p_site_id,auth.uid(),cm.role,to_jsonb(s),null,jsonb_build_object('backendCaptured',true)
 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid();
end;
$$;
create or replace function public.manager_delete_company_location(p_company_id uuid,p_site_id uuid,p_expected_revision bigint)
returns void language sql set search_path='' as $$
 select private.manager_delete_company_location(p_company_id,p_site_id,p_expected_revision);
$$;
revoke all on function private.manager_delete_company_location(uuid,uuid,bigint) from public, anon;
revoke all on function public.manager_delete_company_location(uuid,uuid,bigint) from public, anon;
grant execute on function private.manager_delete_company_location(uuid,uuid,bigint) to authenticated;
grant execute on function public.manager_delete_company_location(uuid,uuid,bigint) to authenticated;
