-- Revisionssicherer Abschluss verwaister oder fachlich geprüfter Altbestandswarnungen.
-- Die ursprünglichen Audit-Ereignisse bleiben unverändert erhalten.

create or replace function private.manager_resolve_legacy_assignment_reviews_impl(
  p_company_id uuid,
  p_source_event_ids uuid[],
  p_note text default ''
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if coalesce(array_length(p_source_event_ids,1),0)=0 then raise exception 'Keine Prüfhinweise ausgewählt'; end if;
  if not exists(
    select 1 from public.company_members cm
    where cm.company_id=p_company_id and cm.user_id=v_uid and cm.status='ACTIVE'
      and cm.role in ('OWNER','ADMIN','DISPATCHER','PLANNER')
  ) then raise exception 'Keine Berechtigung'; end if;
  if exists(
    select 1 from unnest(p_source_event_ids) x(id)
    left join public.audit_events a on a.id=x.id
    where a.id is null or a.company_id<>p_company_id
      or a.event_type<>'LEGACY_ASSIGNMENT_IMPORTED_WITH_EXCEPTION'
  ) then raise exception 'Ungültiger Altbestandsverweis'; end if;

  insert into public.audit_events(
    company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata
  )
  select p_company_id,'LEGACY_ASSIGNMENT_REVIEW_RESOLVED','audit_event',a.id,v_uid,cm.role,
    jsonb_build_object('status','RESOLVED'),
    jsonb_build_object(
      'source_event_id',a.id,
      'source_assignment_id',a.entity_id,
      'legacy_id',a.metadata->>'legacy_id',
      'resolution','REVIEWED',
      'note',left(trim(coalesce(p_note,'')),1000)
    )
  from public.audit_events a
  join public.company_members cm on cm.company_id=p_company_id and cm.user_id=v_uid and cm.status='ACTIVE'
  where a.company_id=p_company_id
    and a.event_type='LEGACY_ASSIGNMENT_IMPORTED_WITH_EXCEPTION'
    and a.id=any(p_source_event_ids)
    and not exists(
      select 1 from public.audit_events done
      where done.company_id=p_company_id
        and done.event_type='LEGACY_ASSIGNMENT_REVIEW_RESOLVED'
        and done.entity_id=a.id
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.manager_resolve_legacy_assignment_reviews(uuid,uuid[],text default '')
returns integer language sql security invoker set search_path='' as
$$select private.manager_resolve_legacy_assignment_reviews_impl($1,$2,$3)$$;

revoke all on function private.manager_resolve_legacy_assignment_reviews_impl(uuid,uuid[],text) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.manager_resolve_legacy_assignment_reviews_impl(uuid,uuid[],text) to authenticated;
revoke all on function public.manager_resolve_legacy_assignment_reviews(uuid,uuid[],text) from public,anon;
grant execute on function public.manager_resolve_legacy_assignment_reviews(uuid,uuid[],text) to authenticated;

-- Bereits gelöschte Zuweisungen können nicht mehr fachlich korrigiert werden.
-- Sie werden einmalig als verwaist abgeschlossen, ohne den Ursprung zu verändern.
insert into public.audit_events(
  company_id,event_type,entity_type,entity_id,actor_role,new_values,metadata
)
select a.company_id,'LEGACY_ASSIGNMENT_REVIEW_RESOLVED','audit_event',a.id,'SYSTEM',
  jsonb_build_object('status','RESOLVED'),
  jsonb_build_object(
    'source_event_id',a.id,
    'source_assignment_id',a.entity_id,
    'legacy_id',a.metadata->>'legacy_id',
    'resolution','ORPHANED_ASSIGNMENT',
    'note','Historische Schicht ist nicht mehr vorhanden; Audit-Nachweis wurde revisionssicher abgeschlossen.'
  )
from public.audit_events a
left join public.shift_assignments s on s.id=a.entity_id
where a.event_type='LEGACY_ASSIGNMENT_IMPORTED_WITH_EXCEPTION'
  and s.id is null
  and not exists(
    select 1 from public.audit_events done
    where done.company_id=a.company_id
      and done.event_type='LEGACY_ASSIGNMENT_REVIEW_RESOLVED'
      and done.entity_id=a.id
  );
