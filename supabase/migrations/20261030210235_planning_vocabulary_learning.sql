create table private.learned_planning_words(term text primary key check(term ~ '^[a-z]{6,32}$'),target text not null check(target in('topic:open','topic:replacement','topic:workload','topic:absence','topic:loadCheck')),confirmations integer not null default 0,companies integer not null default 0,conflict boolean not null default false,disabled boolean not null default false);
create table private.planning_word_votes(term text references private.learned_planning_words(term) on delete cascade,user_id uuid references auth.users(id) on delete cascade,company_id uuid references public.companies(id) on delete cascade,primary key(term,user_id));
alter table private.learned_planning_words enable row level security;
alter table private.planning_word_votes enable row level security;
revoke all on private.learned_planning_words,private.planning_word_votes from public,anon,authenticated;
grant select on private.learned_planning_words to authenticated;
create policy learned_words_read on private.learned_planning_words for select to authenticated using(auth.uid() is not null and not private.sf_has_time_only_login());
create or replace function private.sf_record_word_choice(p_company_id uuid,p_term text,p_target text) returns jsonb language plpgsql security definer set search_path='' as $$
declare w private.learned_planning_words; begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,false) or private.sf_has_time_only_login() then raise exception 'Planungsrechte erforderlich';end if;
 perform private.sf_assert_aal2('record_planning_word_choice');
 if p_term is null or p_target is null or p_term !~ '^[a-z]{6,32}$' or p_term !~ '(bedarf|besetzung|luecke|stunden|vertretung|auslastung|abwesenheit|dienste|planung|belastung)$' or p_target not in('topic:open','topic:replacement','topic:workload','topic:absence','topic:loadCheck') or exists(select 1 from public.employees e where e.company_id=p_company_id and (lower(e.first_name)=p_term or lower(e.last_name)=p_term)) then raise exception 'Begriff nicht zum automatischen Lernen geeignet';end if;
 perform 1 from private.shared_planning_dictionary where singleton for update;
 if exists(select 1 from private.shared_planning_dictionary d,jsonb_array_elements(d.entries) x where x->>'term'=p_term) then return '{"ignored":true}';end if;
 if not exists(select 1 from private.learned_planning_words where term=p_term) and (select count(*) from private.learned_planning_words)>=500 then return '{"limited":true}';end if;
 insert into private.learned_planning_words(term,target) values(p_term,p_target) on conflict do nothing;
 select * into w from private.learned_planning_words where term=p_term for update;
 if w.disabled then return '{"disabled":true}';end if;
 if w.target<>p_target then update private.learned_planning_words set conflict=true where term=p_term;return '{"conflict":true}';end if;
 if w.confirmations<5 then insert into private.planning_word_votes(term,user_id,company_id) values(p_term,auth.uid(),p_company_id) on conflict do nothing;end if;
 update private.learned_planning_words set confirmations=(select count(*) from private.planning_word_votes where term=p_term),companies=(select count(distinct company_id) from private.planning_word_votes where term=p_term) where term=p_term returning * into w;
 return jsonb_build_object('active',w.confirmations>=3 and w.companies>=2 and not w.conflict and not w.disabled);
end $$;
revoke all on function private.sf_record_word_choice(uuid,text,text) from public,anon;
grant execute on function private.sf_record_word_choice(uuid,text,text) to authenticated;
create function public.record_planning_word_choice(p_company_id uuid,p_term text,p_target text) returns jsonb language sql security invoker set search_path='' as $$ select private.sf_record_word_choice(p_company_id,p_term,p_target) $$;
revoke all on function public.record_planning_word_choice(uuid,text,text) from public,anon;
grant execute on function public.record_planning_word_choice(uuid,text,text) to authenticated;
create function private.sf_disable_learned_word(p_company_id uuid,p_term text,p_disabled boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,true) or private.sf_has_time_only_login() or not exists(select 1 from private.shared_dictionary_editors where user_id=auth.uid()) then raise exception 'Zentrale Pflegeberechtigung erforderlich';end if;
 perform private.sf_assert_aal2('disable_learned_word');
 update private.learned_planning_words set disabled=p_disabled where term=p_term;
end $$;
revoke all on function private.sf_disable_learned_word(uuid,text,boolean) from public,anon;
grant execute on function private.sf_disable_learned_word(uuid,text,boolean) to authenticated;
create function public.disable_learned_planning_word(p_company_id uuid,p_term text,p_disabled boolean) returns void language sql security invoker set search_path='' as $$select private.sf_disable_learned_word(p_company_id,p_term,p_disabled)$$;
revoke all on function public.disable_learned_planning_word(uuid,text,boolean) from public,anon;
grant execute on function public.disable_learned_planning_word(uuid,text,boolean) to authenticated;

create or replace function public.company_private_client_configuration(p_company_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or not private.sf_company_profile_can_read(p_company_id) then raise exception using errcode='42501',message='Unternehmenszugriff verweigert';end if;
 if private.sf_is_manager(p_company_id,true) then perform private.sf_assert_aal2('company_private_client_configuration');end if;
 return coalesce((select configuration from private.company_client_configuration where company_id=p_company_id),'{}'::jsonb)||jsonb_build_object('planningDictionaryManual',coalesce((select entries from private.shared_planning_dictionary where singleton),'[]'::jsonb),'planningDictionary',coalesce((select entries from private.shared_planning_dictionary where singleton),'[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('term',w.term,'target',w.target) order by w.term) from private.learned_planning_words w where w.confirmations>=3 and w.companies>=2 and not w.disabled and not w.conflict and not exists(select 1 from private.shared_planning_dictionary d,jsonb_array_elements(d.entries) x where x->>'term'=w.term)),'[]'::jsonb),'planningLearnedWords',case when exists(select 1 from private.shared_dictionary_editors where user_id=auth.uid()) then coalesce((select jsonb_agg(to_jsonb(w) order by w.term) from private.learned_planning_words w),'[]'::jsonb) else '[]'::jsonb end,'planningDictionaryEditable',exists(select 1 from private.shared_dictionary_editors where user_id=auth.uid()));
end $$;
