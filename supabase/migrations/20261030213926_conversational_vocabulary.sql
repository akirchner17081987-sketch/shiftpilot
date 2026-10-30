create function private.sf_learning_term_allowed(v text) returns boolean language sql immutable set search_path='' as $$
 select coalesce((v ~ '^[a-z]{6,32}$' and v ~ '(bedarf|besetzung|luecke|stunden|vertretung|auslastung|abwesenheit|dienste|planung|belastung)$') or
 (length(v)<=100 and v ~ '^[a-z]+( [a-z]+){1,5}$' and not exists(select 1 from unnest(string_to_array(v,' ')) w where w not in('wer','wo','hat','haben','ist','sind','kann','koennen','noch','uns','jemand','luft','fehlt','fehlen','wie','viele','die','den','der','das','mir','bitte','offene','offenen','frei','freien','dienste','schichten','stunden','besetzung','auslastung','vertretung','einspringen')) and v ~ '(^| )(luft|fehlt|fehlen|dienste|schichten|stunden|besetzung|auslastung|vertretung|einspringen)( |$)'),false)
$$;
revoke all on function private.sf_learning_term_allowed(text) from public,anon,authenticated;
alter table private.learned_planning_words drop constraint learned_planning_words_term_check;
alter table private.learned_planning_words add constraint learned_planning_words_term_check check(private.sf_learning_term_allowed(term));
alter table private.learned_planning_words add column approved boolean not null default false;
create function private.sf_approve_learned_word(p_company_id uuid,p_term text,p_target text) returns void language plpgsql security definer set search_path='' as $$
declare w private.learned_planning_words;begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,true) or private.sf_has_time_only_login() or not exists(select 1 from private.shared_dictionary_editors where user_id=auth.uid()) then raise exception 'Zentrale Pflegeberechtigung erforderlich';end if;
 perform private.sf_assert_aal2('approve_learned_word');
 select * into w from private.learned_planning_words where term=p_term for update;
 if not found or w.target is distinct from p_target then raise exception 'Zuordnung wurde geändert. Bitte neu laden.';end if;
 if w.conflict or w.disabled then raise exception 'Widersprüchliche oder deaktivierte Zuordnung bitte zunächst zentral klären.';end if;
 update private.learned_planning_words set approved=true where term=p_term;
end $$;
revoke all on function private.sf_approve_learned_word(uuid,text,text) from public,anon;
grant execute on function private.sf_approve_learned_word(uuid,text,text) to authenticated;
create function public.approve_learned_planning_word(p_company_id uuid,p_term text,p_target text) returns void language sql security invoker set search_path='' as $$select private.sf_approve_learned_word(p_company_id,p_term,p_target)$$;
revoke all on function public.approve_learned_planning_word(uuid,text,text) from public,anon;
grant execute on function public.approve_learned_planning_word(uuid,text,text) to authenticated;

create or replace function private.sf_record_word_choice(p_company_id uuid,p_term text,p_target text) returns jsonb language plpgsql security definer set search_path='' as $$
declare w private.learned_planning_words; begin
 if auth.uid() is null or not private.sf_is_manager(p_company_id,false) or private.sf_has_time_only_login() then raise exception 'Planungsrechte erforderlich';end if;
 perform private.sf_assert_aal2('record_planning_word_choice');
 if p_term is null or p_target is null or not private.sf_learning_term_allowed(p_term) or p_target not in('topic:open','topic:replacement','topic:workload','topic:absence','topic:loadCheck') or exists(select 1 from public.employees e where e.company_id=p_company_id and (lower(e.first_name)=any(string_to_array(p_term,' ')) or lower(e.last_name)=any(string_to_array(p_term,' ')))) then raise exception 'Begriff nicht zum automatischen Lernen geeignet';end if;
 perform 1 from private.shared_planning_dictionary where singleton for update;
 if exists(select 1 from private.shared_planning_dictionary d,jsonb_array_elements(d.entries) x where x->>'term'=p_term) then return '{"ignored":true}';end if;
 if not exists(select 1 from private.learned_planning_words where term=p_term) and (select count(*) from private.learned_planning_words)>=500 then return '{"limited":true}';end if;
 insert into private.learned_planning_words(term,target) values(p_term,p_target) on conflict do nothing;
 select * into w from private.learned_planning_words where term=p_term for update;
 if w.disabled then return '{"disabled":true}';end if;
 if w.target<>p_target then update private.learned_planning_words set conflict=true where term=p_term;return '{"conflict":true}';end if;
 if w.confirmations<5 then insert into private.planning_word_votes(term,user_id,company_id) values(p_term,auth.uid(),p_company_id) on conflict do nothing;end if;
 update private.learned_planning_words set confirmations=(select count(*) from private.planning_word_votes where term=p_term),companies=(select count(distinct company_id) from private.planning_word_votes where term=p_term) where term=p_term returning * into w;
 return jsonb_build_object('active',(w.approved or w.confirmations>=3 and w.companies>=2) and not w.conflict and not w.disabled);
end $$;

create or replace function public.company_private_client_configuration(p_company_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or not private.sf_company_profile_can_read(p_company_id) then raise exception using errcode='42501',message='Unternehmenszugriff verweigert';end if;
 if private.sf_is_manager(p_company_id,true) then perform private.sf_assert_aal2('company_private_client_configuration');end if;
 return coalesce((select configuration from private.company_client_configuration where company_id=p_company_id),'{}'::jsonb)||jsonb_build_object('planningDictionaryManual',coalesce((select entries from private.shared_planning_dictionary where singleton),'[]'::jsonb),'planningDictionary',coalesce((select entries from private.shared_planning_dictionary where singleton),'[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('term',w.term,'target',w.target) order by w.term) from private.learned_planning_words w where (w.approved or w.confirmations>=3 and w.companies>=2) and not w.disabled and not w.conflict and not exists(select 1 from private.shared_planning_dictionary d,jsonb_array_elements(d.entries) x where x->>'term'=w.term)),'[]'::jsonb),'planningLearnedWords',case when exists(select 1 from private.shared_dictionary_editors where user_id=auth.uid()) then coalesce((select jsonb_agg(to_jsonb(w) order by w.term) from private.learned_planning_words w),'[]'::jsonb) else '[]'::jsonb end,'planningDictionaryEditable',exists(select 1 from private.shared_dictionary_editors where user_id=auth.uid()));
end $$;
