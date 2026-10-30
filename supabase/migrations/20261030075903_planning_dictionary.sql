create or replace function private.sf_save_planning_dictionary(p_company_id uuid,p_entries jsonb,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg jsonb; item jsonb; begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,true) or private.sf_has_time_only_login() then raise exception 'Keine Berechtigung für das Unternehmenswörterbuch'; end if;
 perform private.sf_assert_aal2('save_planning_dictionary');
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)>50 then raise exception 'Höchstens 50 Begriffe erlaubt'; end if;
 for item in select value from jsonb_array_elements(p_entries) loop
  if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>2 or not (item ? 'term' and item ? 'target') or jsonb_typeof(item->'term') is distinct from 'string' or jsonb_typeof(item->'target') is distinct from 'string' or (item->>'term') !~ '^[a-z0-9][a-z0-9 -]{1,39}$' or not ((item->>'target') in ('topic:open','topic:replacement','topic:workload','topic:absence','topic:loadCheck') or exists(select 1 from public.shift_templates t where t.company_id=p_company_id and t.active and t.code=item->>'target')) then raise exception 'Ungültiger Begriff oder Ziel'; end if;
 end loop;
 if (select count(distinct value->>'term') from jsonb_array_elements(p_entries))<>jsonb_array_length(p_entries) then raise exception 'Begriff bereits vorhanden'; end if;
 insert into private.company_client_configuration(company_id) values(p_company_id) on conflict do nothing;
 select configuration into cfg from private.company_client_configuration where company_id=p_company_id for update;
 if coalesce(cfg->'planningDictionary','[]'::jsonb) is distinct from p_expected then raise exception 'Wörterbuch wurde inzwischen geändert. Bitte neu laden.'; end if;
 update private.company_client_configuration set configuration=jsonb_set(cfg,'{planningDictionary}',p_entries),updated_at=now() where company_id=p_company_id;
 return p_entries;
end $$;
revoke all on function private.sf_save_planning_dictionary(uuid,jsonb,jsonb) from public,anon;
grant execute on function private.sf_save_planning_dictionary(uuid,jsonb,jsonb) to authenticated;
create or replace function public.save_planning_dictionary(p_company_id uuid,p_entries jsonb,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.sf_save_planning_dictionary(p_company_id,p_entries,p_expected) $$;
revoke all on function public.save_planning_dictionary(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_planning_dictionary(uuid,jsonb,jsonb) to authenticated;
