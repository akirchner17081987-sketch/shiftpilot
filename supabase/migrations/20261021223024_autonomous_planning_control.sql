-- Company-scoped, opt-in automation. Worker capabilities never reach clients.
create table private.autonomous_planning_settings (
 company_id uuid primary key references public.companies(id) on delete cascade,
 enabled boolean not null default false, mode text not null default 'PREVIEW' check(mode in('PREVIEW','DRAFT')),
 run_day int not null default 20 check(run_day between 1 and 31), run_time time not null default '06:00',
 lead_months int not null default 1 check(lead_months between 0 and 3), month_count int not null default 1 check(month_count between 1 and 3),
 on_changes boolean not null default false, history_months int not null default 3 check(history_months between 0 and 6),
 actor_id uuid, revision int not null default 0, updated_at timestamptz not null default now(),
 dirty_revision bigint not null default 0, dirty_at timestamptz, dirty_first date, dirty_last date
);
alter table private.autonomous_planning_settings enable row level security;
revoke all on private.autonomous_planning_settings from public,anon,authenticated;
create table private.autonomous_planning_runs (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 actor_id uuid not null,source text not null check(source in('MANUAL','MONTHLY','CHANGE')),schedule_key text not null,
 first_month date not null,month_count int not null check(month_count between 1 and 3),
 status text not null default 'QUEUED' check(status in('QUEUED','PREPARING','CALCULATING','ASSESS_QUEUED','ASSESSING','READY','REVIEW','APPLIED','FAILED','CANCELLED')),
 settings_revision int not null,context jsonb,parts jsonb not null default '[]',background_job_id uuid,
 summary jsonb,error text,token uuid not null default gen_random_uuid(),lease uuid,lease_until timestamptz,dispatched_at timestamptz,
 revision int not null default 0,attempts int not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),completed_at timestamptz,
 unique(company_id,schedule_key)
);
alter table private.autonomous_planning_runs enable row level security;
revoke all on private.autonomous_planning_runs from public,anon,authenticated;
create unique index autonomous_planning_one_active on private.autonomous_planning_runs(company_id) where status in('QUEUED','PREPARING','CALCULATING','ASSESS_QUEUED','ASSESSING');
create index autonomous_planning_due on private.autonomous_planning_runs(created_at) where status in('QUEUED','PREPARING','ASSESS_QUEUED','ASSESSING');
create index autonomous_planning_history on private.autonomous_planning_runs(company_id,created_at desc);

create function private.sf_autonomy_status(r private.autonomous_planning_runs) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'source',r.source,'first_month',r.first_month,'month_count',r.month_count,'status',r.status,'summary',r.summary,'error',r.error,'created_at',r.created_at,'updated_at',r.updated_at,'background_job_id',r.background_job_id)
$$;
revoke all on function private.sf_autonomy_status(private.autonomous_planning_runs) from public,anon,authenticated;

create function private.sf_autonomy_queue(company_ uuid,actor_ uuid,first_ date,count_ int,source_ text,key_ text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.autonomous_planning_settings;r private.autonomous_planning_runs;claims_ text;sub_ text;
begin
 perform pg_advisory_xact_lock(hashtextextended('autonomy:'||company_::text,0));
 if not exists(select 1 from public.company_members where company_id=company_ and user_id=actor_ and status='ACTIVE' and role in('OWNER','ADMIN','PLANNER','DISPATCHER')) then raise exception 'Aktive Planungsrechte fehlen.' using errcode='42501';end if;
 if first_ is null or extract(day from first_)<>1 or count_ not between 1 and 3 then raise exception 'Ungültiger Automatikzeitraum.';end if;
 select * into r from private.autonomous_planning_runs where company_id=company_ and schedule_key=key_;if found then return private.sf_autonomy_status(r);end if;
 if exists(select 1 from private.autonomous_planning_runs where company_id=company_ and status in('QUEUED','PREPARING','CALCULATING','ASSESS_QUEUED','ASSESSING')) or exists(select 1 from private.background_auto_plan_jobs where company_id=company_ and status in('QUEUED','RUNNING')) then raise exception 'Für dieses Unternehmen läuft bereits eine Planung.';end if;
 if (select count(*) from private.autonomous_planning_runs where company_id=company_ and created_at>now()-interval '1 hour')>=12 then raise exception 'Zu viele Automatikläufe. Bitte später erneut versuchen.';end if;
 insert into private.autonomous_planning_settings(company_id) values(company_) on conflict do nothing;
 select * into s from private.autonomous_planning_settings where company_id=company_;
 insert into private.autonomous_planning_runs(company_id,actor_id,source,schedule_key,first_month,month_count,settings_revision) values(company_,actor_,source_,key_,first_,count_,s.revision) returning * into r;
 claims_:=current_setting('request.jwt.claims',true);sub_:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',actor_::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_,'role','authenticated')::text,true);
 begin update private.autonomous_planning_runs set context=private.sf_autonomy_snapshot(company_,first_,count_,r.id,s.history_months) where id=r.id returning * into r;
 exception when others then update private.autonomous_planning_runs set status='REVIEW',error=left(SQLERRM,700),completed_at=now() where id=r.id returning * into r;end;
 perform set_config('request.jwt.claim.sub',coalesce(sub_,''),true);perform set_config('request.jwt.claims',coalesce(claims_,'{}'),true);
 return private.sf_autonomy_status(r);
end $$;
revoke all on function private.sf_autonomy_queue(uuid,uuid,date,int,text,text) from public,anon,authenticated;

create function private.sf_autonomy_control(company_ uuid,action_ text,config_ jsonb,run_ uuid,month_ date) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_ uuid:=auth.uid();s private.autonomous_planning_settings;r private.autonomous_planning_runs;role_ text;j private.background_auto_plan_jobs;
begin
 perform private.sf_background_plan_authorize(company_);if private.sf_has_time_only_login() then raise exception 'Planungszugang erforderlich.' using errcode='42501';end if;
 select role into role_ from public.company_members where company_id=company_ and user_id=actor_ and status='ACTIVE';
 if action_='SAVE' then
  if role_ not in('OWNER','ADMIN') then raise exception 'Nur Inhaber und Administratoren können den Automatikmodus einstellen.' using errcode='42501';end if;
  if jsonb_typeof(config_)<>'object' or exists(select 1 from jsonb_object_keys(config_) k where k not in('enabled','mode','run_day','run_time','lead_months','month_count','on_changes','history_months','revision')) then raise exception 'Ungültige Automatik-Einstellungen.';end if;
  if jsonb_typeof(config_->'enabled') is distinct from 'boolean' or jsonb_typeof(config_->'on_changes') is distinct from 'boolean' or config_->>'mode' not in('PREVIEW','DRAFT') or config_->>'run_day' !~ '^\d+$' or config_->>'lead_months' !~ '^\d+$' or config_->>'month_count' !~ '^\d+$' or config_->>'history_months' !~ '^\d+$' or config_->>'run_time' !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Bitte alle Automatik-Einstellungen vollständig angeben.';end if;
  insert into private.autonomous_planning_settings(company_id) values(company_) on conflict do nothing;
  select * into s from private.autonomous_planning_settings where company_id=company_ for update;
  if (config_->>'revision')::int is distinct from s.revision then raise exception 'Die Einstellungen wurden inzwischen geändert. Bitte neu laden.';end if;
  update private.autonomous_planning_settings set enabled=(config_->>'enabled')::boolean,mode=config_->>'mode',run_day=(config_->>'run_day')::int,run_time=(config_->>'run_time')::time,lead_months=(config_->>'lead_months')::int,month_count=(config_->>'month_count')::int,on_changes=(config_->>'on_changes')::boolean,history_months=(config_->>'history_months')::int,actor_id=actor_,revision=revision+1,updated_at=now(),dirty_at=null,dirty_first=null,dirty_last=null where company_id=company_;
 elsif action_='RUN' then
  perform private.sf_autonomy_queue(company_,actor_,month_,1,'MANUAL','manual:'||gen_random_uuid()::text);
 elsif action_='CANCEL' then
  select * into r from private.autonomous_planning_runs where id=run_ and company_id=company_ for update;
  if not found then raise exception 'Automatiklauf nicht gefunden.';end if;
  if r.status='APPLIED' then raise exception 'Ein gespeicherter Entwurf wird hier nicht gelöscht.';end if;
  if r.background_job_id is not null then perform private.sf_change_background_auto_plan(company_,r.background_job_id,'CANCEL');end if;
  update private.autonomous_planning_runs set status='CANCELLED',context=null,parts='[]',lease=null,lease_until=null,completed_at=now(),updated_at=now() where id=r.id;
 elsif action_='RESULT' then
  select * into r from private.autonomous_planning_runs where id=run_ and company_id=company_;
  if not found or r.status not in('READY','REVIEW') or r.background_job_id is null then raise exception 'Noch kein öffnungsfähiger Vorschlag vorhanden.';end if;
  select * into j from private.background_auto_plan_jobs where id=r.background_job_id and company_id=company_;
  return private.sf_background_plan_status(j);
 elsif action_<>'GET' then raise exception 'Unbekannte Automatikaktion.';end if;
 select * into s from private.autonomous_planning_settings where company_id=company_;
 return jsonb_build_object('config',coalesce(case when s.company_id is not null then to_jsonb(s)-'actor_id'-'dirty_at'-'dirty_revision'-'dirty_first'-'dirty_last' end,jsonb_build_object('company_id',company_,'enabled',false,'mode','PREVIEW','run_day',20,'run_time','06:00','lead_months',1,'month_count',1,'history_months',3,'on_changes',false,'revision',0)),'can_edit',role_ in('OWNER','ADMIN'),'runs',(select coalesce(jsonb_agg(v),'[]') from (select private.sf_autonomy_status(history) v from private.autonomous_planning_runs history where history.company_id=company_ order by history.created_at desc limit 12) q));
end $$;
revoke all on function private.sf_autonomy_control(uuid,text,jsonb,uuid,date) from public,anon;
grant execute on function private.sf_autonomy_control(uuid,text,jsonb,uuid,date) to authenticated;
create function public.autonomous_planning_control(p_company_id uuid,p_action text default 'GET',p_config jsonb default null,p_run_id uuid default null,p_month date default null) returns jsonb language sql security invoker set search_path='' set statement_timeout='60s' as $$select private.sf_autonomy_control(p_company_id,p_action,p_config,p_run_id,p_month)$$;
revoke all on function public.autonomous_planning_control(uuid,text,jsonb,uuid,date) from public,anon;
grant execute on function public.autonomous_planning_control(uuid,text,jsonb,uuid,date) to authenticated;

create function private.sf_autonomy_dirty() returns trigger language plpgsql security definer set search_path='' as $$
declare row_ jsonb;company_ uuid;first_ date;last_ date;tz_ text;lead_ int;
begin
 if current_setting('sf.autonomy_mutation',true)='yes' then return null;end if;
 if TG_OP='DELETE' then row_:=to_jsonb(OLD);else row_:=to_jsonb(NEW);end if;
 company_:=(row_->>'company_id')::uuid;
 if not exists(select 1 from private.autonomous_planning_settings where company_id=company_ and enabled and on_changes) then return null;end if;
 select coalesce(c.timezone,'Europe/Berlin'),s.lead_months into tz_,lead_ from public.companies c join private.autonomous_planning_settings s on s.company_id=c.id where c.id=company_;
 if TG_TABLE_NAME not in('shift_assignments','absences','daily_staffing_overrides','planning_wishes') then
  first_:=(date_trunc('month',now() at time zone tz_)+make_interval(months=>lead_))::date;last_:=first_;
 else
 first_:=coalesce((row_->>'start_date')::date,(row_->>'work_date')::date,((row_->>'starts_at')::timestamptz at time zone tz_)::date,(date_trunc('month',now() at time zone tz_)+make_interval(months=>lead_))::date);
 last_:=coalesce((row_->>'end_date')::date,((row_->>'ends_at')::timestamptz at time zone tz_)::date,first_);
 if TG_OP='UPDATE' then
  first_:=least(first_,coalesce((to_jsonb(OLD)->>'start_date')::date,(to_jsonb(OLD)->>'work_date')::date,((to_jsonb(OLD)->>'starts_at')::timestamptz at time zone tz_)::date,first_));
  last_:=greatest(last_,coalesce((to_jsonb(OLD)->>'end_date')::date,((to_jsonb(OLD)->>'ends_at')::timestamptz at time zone tz_)::date,last_));
 end if;
 end if;
 update private.autonomous_planning_settings set dirty_revision=dirty_revision+1,dirty_at=now(),dirty_first=least(coalesce(dirty_first,first_),first_),dirty_last=greatest(coalesce(dirty_last,last_),last_) where company_id=company_;
 return null;
end $$;
revoke all on function private.sf_autonomy_dirty() from public,anon,authenticated;
create trigger autonomous_planning_dirty after insert or update or delete on public.shift_assignments for each row execute function private.sf_autonomy_dirty();
create trigger autonomous_planning_dirty after insert or update or delete on public.absences for each row execute function private.sf_autonomy_dirty();
create trigger autonomous_planning_dirty after insert or update or delete on public.employees for each row execute function private.sf_autonomy_dirty();
create trigger autonomous_planning_dirty after insert or update or delete on public.shift_templates for each row execute function private.sf_autonomy_dirty();
create trigger autonomous_planning_dirty after insert or update or delete on public.company_compliance_policy for each row execute function private.sf_autonomy_dirty();
create trigger autonomous_planning_dirty after insert or update or delete on public.global_staffing_requirements for each row execute function private.sf_autonomy_dirty();
create trigger autonomous_planning_dirty after insert or update or delete on public.daily_staffing_overrides for each row execute function private.sf_autonomy_dirty();
create trigger autonomous_planning_dirty after insert or update or delete on public.company_planning_teams for each row execute function private.sf_autonomy_dirty();
create trigger autonomous_planning_dirty after insert or update or delete on public.planning_wishes for each row execute function private.sf_autonomy_dirty();

create trigger autonomous_planning_dirty after insert or update or delete on public.planning_assistant_preferences for each row execute function private.sf_autonomy_dirty();
