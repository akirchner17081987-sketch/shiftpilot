-- Generic terminology only. No company rules or personnel data belong here.
create table private.shared_planning_dictionary(singleton boolean primary key default true check(singleton),entries jsonb not null default '[]' check(jsonb_typeof(entries)='array' and jsonb_array_length(entries)<=200));
alter table private.shared_planning_dictionary enable row level security;
revoke all on private.shared_planning_dictionary from public,anon,authenticated;
grant select on private.shared_planning_dictionary to authenticated;
create policy shared_dictionary_read on private.shared_planning_dictionary for select to authenticated using(auth.uid() is not null and not private.sf_has_time_only_login());
insert into private.shared_planning_dictionary(singleton,entries) values(true,'[{"term": "o1", "target": "O1"}, {"term": "o2", "target": "O2"}, {"term": "o3", "target": "O3"}, {"term": "ot", "target": "OT"}, {"term": "ot1", "target": "OT1"}, {"term": "ot2", "target": "OT2"}, {"term": "ot3", "target": "OT3"}, {"term": "tl", "target": "TL"}, {"term": "tl-le", "target": "TL-LE"}, {"term": "tl-re", "target": "TL-RE"}, {"term": "fd", "target": "FD"}, {"term": "sd", "target": "SD"}, {"term": "nd", "target": "ND"}, {"term": "personalluecke", "target": "topic:open"}, {"term": "einspringer", "target": "topic:replacement"}]');
create table private.shared_dictionary_editors(user_id uuid primary key references auth.users(id) on delete cascade);
alter table private.shared_dictionary_editors enable row level security;
revoke all on private.shared_dictionary_editors from public,anon,authenticated;
grant select on private.shared_dictionary_editors to authenticated;
create policy shared_dictionary_own_editor on private.shared_dictionary_editors for select to authenticated using(user_id=(select auth.uid()));
create or replace function public.company_private_client_configuration(p_company_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or not private.sf_company_profile_can_read(p_company_id) then raise exception using errcode='42501',message='Unternehmenszugriff verweigert';end if;
 if private.sf_is_manager(p_company_id,true) then perform private.sf_assert_aal2('company_private_client_configuration');end if;
 return coalesce((select configuration from private.company_client_configuration where company_id=p_company_id),'{}'::jsonb)||jsonb_build_object('planningDictionary',coalesce((select entries from private.shared_planning_dictionary where singleton),'[]'::jsonb),'planningDictionaryEditable',exists(select 1 from private.shared_dictionary_editors where user_id=auth.uid()));
end $$;
create or replace function private.sf_save_planning_dictionary(p_company_id uuid,p_entries jsonb,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; current_entries jsonb; begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,true) or private.sf_has_time_only_login() or not exists(select 1 from private.shared_dictionary_editors where user_id=auth.uid()) then raise exception 'Keine Berechtigung für den gemeinsamen Wortschatz';end if;
 perform private.sf_assert_aal2('save_planning_dictionary');
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)>200 then raise exception 'Höchstens 200 Begriffe erlaubt';end if;
 for item in select value from jsonb_array_elements(p_entries) loop
  if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>2 or jsonb_typeof(item->'term') is distinct from 'string' or jsonb_typeof(item->'target') is distinct from 'string' or (item->>'term') !~ '^[a-z0-9][a-z0-9 -]{1,39}$' or not ((item->>'target') in ('topic:open','topic:replacement','topic:workload','topic:absence','topic:loadCheck') or (item->>'target') ~ '^[A-Z][A-Z0-9-]{0,11}$') then raise exception 'Ungültiger Begriff oder Ziel';end if;
 end loop;
 if (select count(distinct value->>'term') from jsonb_array_elements(p_entries))<>jsonb_array_length(p_entries) then raise exception 'Begriff bereits vorhanden';end if;
 select entries into current_entries from private.shared_planning_dictionary where singleton for update;
 if current_entries is distinct from p_expected then raise exception 'Wörterbuch wurde inzwischen geändert. Bitte neu laden.';end if;
 update private.shared_planning_dictionary set entries=p_entries where singleton;
 return p_entries;
end $$;
revoke all on function private.sf_save_planning_dictionary(uuid,jsonb,jsonb) from public,anon;
grant execute on function private.sf_save_planning_dictionary(uuid,jsonb,jsonb) to authenticated;

revoke all on function public.company_private_client_configuration(uuid) from public,anon;
grant execute on function public.company_private_client_configuration(uuid) to authenticated;
