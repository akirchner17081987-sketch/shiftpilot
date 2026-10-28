-- Entirely synthetic, transaction-local completion test. NEVER commit this script.
begin;
do $$
declare actor_ uuid:=gen_random_uuid(); recipient_ uuid:=gen_random_uuid(); stranger_ uuid:=gen_random_uuid();company_ uuid:=gen_random_uuid();original_ uuid:=gen_random_uuid();target_ uuid:=gen_random_uuid();other_ uuid:=gen_random_uuid();site_ uuid:=gen_random_uuid();source_ uuid;
begin
 insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
 select u,'authenticated','authenticated','disruption-synthetic-'||u||'@example.invalid','{}','{}',now(),now() from unnest(array[actor_,recipient_,stranger_]) u;
 perform set_config('request.jwt.claim.sub',actor_::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_,'role','authenticated','aal','aal2')::text,true);
 insert into public.companies(id,name,timezone,created_by) values(company_,'QA completion rollback only','Europe/Berlin',actor_);
 insert into public.company_members(company_id,user_id,role,status,access_role) values(company_,actor_,'OWNER','ACTIVE','OWNER') on conflict(company_id,user_id) do update set status='ACTIVE',access_role=excluded.access_role;
 insert into public.company_compliance_policy(company_id,solid_planning_rules) values(company_,'{}') on conflict(company_id) do update set solid_planning_rules='{}',works_council_enabled=false;
 insert into public.company_locations(id,company_id,name,code) values(site_,company_,'QA Teststandort','QA');
 insert into public.shift_templates(company_id,code,name,default_start,default_end,site_id) values(company_,'QA','Completion rollback','06:00','14:00',site_);
 insert into public.employees(id,company_id,first_name,last_name,personnel_no,shift_permissions,auth_user_id,access_status)
 values(original_,company_,'Synthetic','Original','QA-1',array['QA'],actor_,'ACTIVE'),(target_,company_,'Synthetic','Replacement','QA-2',array['QA'],recipient_,'ACTIVE'),(other_,company_,'Synthetic','Unrelated','QA-3',array['QA'],stranger_,'ACTIVE');
 insert into public.shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status,published_at,created_by)
 values(company_,original_,'QA',date_trunc('minute',now())+interval '2 days',date_trunc('minute',now())+interval '2 days 8 hours','PUBLISHED',now(),actor_) returning id into source_;
 perform set_config('test.disruption.company',company_::text,true);perform set_config('test.disruption.actor',actor_::text,true);perform set_config('test.disruption.recipient',recipient_::text,true);perform set_config('test.disruption.stranger',stranger_::text,true);perform set_config('test.disruption.source',source_::text,true);perform set_config('test.disruption.target',target_::text,true);perform set_config('test.disruption.original',original_::text,true);
end $$;
set local role authenticated;
do $$
declare company_ uuid:=current_setting('test.disruption.company')::uuid;source_ uuid:=current_setting('test.disruption.source')::uuid;target_ uuid:=current_setting('test.disruption.target')::uuid;incident_ uuid;offer_ uuid;r record;blocked_ boolean:=false;
begin
 if public.manager_disruption_replacement(company_,source_,'{"action":"PREVIEW"}')->'assignment'->>'site' is distinct from 'QA Teststandort' then raise exception 'FAIL authoritative site';end if;
 incident_:=public.manager_create_disruption(company_,source_,'SICKNESS','SYNTHETIC INTERNAL HEALTH NOTE');
 if public.manager_send_disruption_offers(incident_,array[target_])<>1 then raise exception 'FAIL offer creation';end if;
 perform set_config('test.disruption.incident',incident_::text,true);
 perform set_config('request.jwt.claim.sub',current_setting('test.disruption.recipient'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.disruption.recipient'),'role','authenticated','aal','aal1')::text,true);
 select * into r from public.employee_list_disruption_offers();offer_:=r.offer_id;
 if r.incident_type<>'OTHER' or r.note<>'' or r.shift_code<>'QA' then raise exception 'FAIL private note disclosure';end if;
 perform set_config('test.disruption.offer',offer_::text,true);
 perform set_config('request.jwt.claim.sub',current_setting('test.disruption.stranger'),true);
 if exists(select 1 from public.employee_list_disruption_offers()) then raise exception 'FAIL unrelated offer read';end if;
 begin perform public.employee_respond_disruption_offer(offer_,'ACCEPT','');exception when others then blocked_:=true;end;
 if not blocked_ then raise exception 'FAIL unrelated acceptance';end if;
 perform set_config('request.jwt.claim.sub',current_setting('test.disruption.recipient'),true);
 select * into r from public.employee_respond_disruption_offer(offer_,'DECLINE','Synthetic refusal');
 if r.status<>'DECLINED' then raise exception 'FAIL decline';end if;
end $$;
reset role;
do $$
declare company_ uuid:=current_setting('test.disruption.company')::uuid;offer_ uuid:=current_setting('test.disruption.offer')::uuid;
begin
 if not exists(select 1 from public.notifications where company_id=company_ and user_id=current_setting('test.disruption.actor')::uuid and kind='DISRUPTION_RESPONSE' and entity_id=offer_) then raise exception 'FAIL manager decline notification';end if;
end $$;
set local role authenticated;
do $$
declare incident_ uuid:=current_setting('test.disruption.incident')::uuid;offer_ uuid:=current_setting('test.disruption.offer')::uuid;target_ uuid:=current_setting('test.disruption.target')::uuid;r record;
begin
 perform set_config('request.jwt.claim.sub',current_setting('test.disruption.actor'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.disruption.actor'),'role','authenticated','aal','aal2')::text,true);
 if public.manager_retry_disruption_offer(incident_,target_,true)<>1 then raise exception 'FAIL retry';end if;
 perform set_config('request.jwt.claim.sub',current_setting('test.disruption.recipient'),true);
 select * into r from public.employee_respond_disruption_offer(offer_,'ACCEPT','Synthetic acceptance');
 if r.status<>'ACCEPTED' then raise exception 'FAIL acceptance';end if;
end $$;
reset role;
do $$
declare company_ uuid:=current_setting('test.disruption.company')::uuid;incident_ uuid:=current_setting('test.disruption.incident')::uuid;
begin
 if not exists(select 1 from public.shift_assignments where id=current_setting('test.disruption.source')::uuid and employee_id=current_setting('test.disruption.target')::uuid) then raise exception 'FAIL plan replacement';end if;
 if not exists(select 1 from public.disruption_incidents where id=incident_ and status='RESOLVED') then raise exception 'FAIL resolved';end if;
 if not exists(select 1 from public.notifications where company_id=company_ and employee_id=current_setting('test.disruption.original')::uuid and kind='DISRUPTION_REPLACED' and entity_id=incident_) then raise exception 'FAIL original employee notification';end if;
 if not exists(select 1 from public.notifications where company_id=company_ and user_id=current_setting('test.disruption.recipient')::uuid and kind='SHIFT_CHANGE_APPLIED') then raise exception 'FAIL replacement notification';end if;
 if exists(select 1 from public.notifications where company_id=company_ and (message like '%SYNTHETIC INTERNAL HEALTH NOTE%' or metadata::text like '%SYNTHETIC INTERNAL HEALTH NOTE%')) then raise exception 'FAIL notification privacy';end if;
 if exists(select 1 from public.shift_change_requests where company_id=company_ and reason_text like '%SYNTHETIC INTERNAL HEALTH NOTE%') then raise exception 'FAIL employee change request privacy';end if;
 if not exists(select 1 from public.audit_events where company_id=company_ and event_type='DISRUPTION_RESOLVED') then raise exception 'FAIL missing audit';end if;
end $$;
set constraints all immediate;
rollback;
