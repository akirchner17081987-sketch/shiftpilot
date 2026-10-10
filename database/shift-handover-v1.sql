-- Shared operational records. No direct client access: every RPC checks company and published duty.
create table public.shift_handovers (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 site_id uuid references public.company_locations(id), shift_code text not null, starts_at timestamptz not null, ends_at timestamptz not null,
 state text not null default 'WORKING' check(state in ('WORKING','SENT')),
 target_id uuid references public.shift_handovers(id), sent_at timestamptz, received_at timestamptz,
 employee_id uuid references public.employees(id) on delete set null, revision bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at>starts_at)
);
create unique index shift_handovers_scope on public.shift_handovers(company_id,coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid),shift_code,starts_at,ends_at);
create index shift_handovers_incoming on public.shift_handovers(target_id) where target_id is not null;
create table public.shift_handover_items (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 board_id uuid not null references public.shift_handovers(id), source_id uuid references public.shift_handover_items(id) on delete set null,
 employee_id uuid references public.employees(id), responsible_employee_id uuid references public.employees(id),
 kind text not null check(kind in ('TASK','CHECK','INCIDENT','NOTE')), title text not null check(length(title) between 3 and 160),
 detail text not null default '' check(length(detail)<=4000), status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','DONE','CARRIED')),
 critical boolean not null default false, due_at timestamptz, escalation text not null default '' check(length(escalation)<=300),
 report_include boolean not null default false, resolution text not null default '' check(length(resolution)<=2000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(not critical or (due_at is not null and length(trim(escalation))>=3)), unique(board_id,source_id)
);
create index shift_handover_items_board on public.shift_handover_items(company_id,board_id);
create index shift_handover_items_employee on public.shift_handover_items(employee_id);
create index shift_handover_items_responsible on public.shift_handover_items(responsible_employee_id);
create index shift_handover_items_source on public.shift_handover_items(source_id);
create table public.shift_handover_reports (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 board_id uuid not null references public.shift_handovers(id), version integer not null,
 snapshot jsonb not null, state text not null default 'DRAFT' check(state in ('DRAFT','APPROVED','REJECTED')),
 approved_at timestamptz, created_by uuid, approved_by uuid, employee_id uuid references public.employees(id),
 review_note text not null default '' check(length(review_note)<=1000), created_at timestamptz not null default now(), unique(board_id,version)
);
create index shift_handover_reports_company on public.shift_handover_reports(company_id,board_id);
create index shift_handover_reports_employee on public.shift_handover_reports(employee_id);
create table public.shift_handover_events (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 board_id uuid not null references public.shift_handovers(id), employee_id uuid references public.employees(id),
 actor_id uuid not null, action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create index shift_handover_events_board on public.shift_handover_events(company_id,board_id,created_at);
create index shift_handover_events_employee on public.shift_handover_events(employee_id);
create index shift_handovers_employee on public.shift_handovers(employee_id);
create index shift_handovers_site on public.shift_handovers(site_id);
create index shift_handovers_company on public.shift_handovers(company_id,starts_at);

create or replace function private.sf_handover_employee(p_company uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select e.id from public.employees e
 where e.company_id=p_company and e.auth_user_id=(select auth.uid()) and e.deleted_at is null
 and e.status='active' and e.access_status='ACTIVE'
 and not exists(select 1 from public.company_members m where m.company_id=p_company and m.user_id=e.auth_user_id
 and (m.status<>'ACTIVE' or m.role in ('TIME_TRACKING','VIEWER'))) limit 1;
$$;
create or replace function private.sf_handover_access(p_board uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.uid() is not null and not private.sf_has_time_only_login() and exists(
 select 1 from public.shift_handovers b where b.id=p_board and (private.sf_is_manager(b.company_id,false) or exists(
 select 1 from public.shift_assignments a join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code
 where a.company_id=b.company_id and a.employee_id=private.sf_handover_employee(b.company_id)
 and a.status='PUBLISHED' and a.published_at is not null and a.shift_code=b.shift_code
 and a.starts_at=b.starts_at and a.ends_at=b.ends_at and t.site_id is not distinct from b.site_id))),false);
$$;
-- Private report snapshots omit names, personnel numbers, addresses and internal content.
create or replace function private.sf_handover_snapshot(p_board uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b public.shift_handovers%rowtype; planned_ integer; confirmed_ integer; count_ integer; confirmed_count_ integer;
begin
 if not private.sf_handover_access(p_board) then raise exception 'Keine Übergaberechte.' using errcode='42501'; end if;
 select * into strict b from public.shift_handovers where id=p_board;
 select count(*),coalesce(sum(greatest(0,extract(epoch from(a.ends_at-a.starts_at))/60-a.break_minutes)),0)::integer,
 count(t.assignment_id) filter(where t.status='confirmed' and t.actual_start is not null and t.actual_end is not null and t.actual_end<=now()),
 coalesce(sum(greatest(0,extract(epoch from(t.actual_end-t.actual_start))/60-t.break_minutes)) filter(where t.status='confirmed' and t.actual_start is not null and t.actual_end is not null and t.actual_end<=now()),0)::integer
 into count_,planned_,confirmed_count_,confirmed_
 from public.shift_assignments a join public.shift_templates s on s.company_id=a.company_id and s.code=a.shift_code
 left join public.time_entries t on t.assignment_id=a.id and t.company_id=a.company_id
 where a.company_id=b.company_id and a.shift_code=b.shift_code and a.starts_at=b.starts_at and a.ends_at=b.ends_at
 and a.status='PUBLISHED' and a.published_at is not null and s.site_id is not distinct from b.site_id;
 return jsonb_build_object('company',(select name from public.companies where id=b.company_id),
 'site',coalesce((select name from public.company_locations where id=b.site_id),'Ohne Standort'),
 'shift',b.shift_code,'start',b.starts_at,'end',b.ends_at,'as_of',now(),'board_revision',b.revision,
 'planned_people',count_,'planned_minutes',planned_,'confirmed_people',confirmed_count_,'confirmed_minutes',confirmed_,
 'time_evidence','Nur bestätigte Dienstplan-Zeitbuchungen; QR-Zeiten ohne eindeutige Dienstzuordnung und offene Buchungen sind nicht enthalten.',
 'handover_sent',b.sent_at,'handover_received',b.received_at,
 'items',coalesce((select jsonb_agg(jsonb_build_object('kind',i.kind,'title',i.title,'detail',i.detail,'status',i.status,
 'critical',i.critical,'due_at',i.due_at,'resolution',i.resolution) order by i.created_at,i.id)
 from public.shift_handover_items i where i.board_id=b.id and i.report_include),'[]'));
end $$;

create or replace function private.shift_handover_bundle(p_company_id uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare manager_ boolean; employee_ uuid; tz text; boards_ jsonb; shifts_ jsonb;
begin
 manager_:=private.sf_is_manager(p_company_id,false);employee_:=private.sf_handover_employee(p_company_id);
 if auth.uid() is null or private.sf_has_time_only_login() or (not manager_ and employee_ is null) then
 raise exception 'Keine Übergaberechte.' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>31 then raise exception 'Bitte höchstens 32 Tage auswählen.'; end if;
 select timezone into strict tz from public.companies where id=p_company_id;
 select coalesce(jsonb_agg(x order by x->>'start',x->>'shift'),'[]') into shifts_ from (
 select jsonb_build_object('assignment_id',min(a.id::text),'shift',a.shift_code,'start',a.starts_at,'end',a.ends_at,
 'site_id',s.site_id,'site',coalesce(l.name,'Ohne Standort'),'people',count(*)) x
 from public.shift_assignments a join public.shift_templates s on s.company_id=a.company_id and s.code=a.shift_code
 left join public.company_locations l on l.id=s.site_id and l.company_id=p_company_id
 where a.company_id=p_company_id and a.status='PUBLISHED' and a.published_at is not null
 and a.starts_at>=p_from::timestamp at time zone tz and a.starts_at<(p_to+1)::timestamp at time zone tz
 and (manager_ or a.employee_id=employee_) group by a.shift_code,a.starts_at,a.ends_at,s.site_id,l.name) grouped;
 select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object(
 'site',coalesce((select name from public.company_locations where id=b.site_id),'Ohne Standort'),
 'crew_ids',coalesce((select jsonb_agg(a.employee_id) from public.shift_assignments a join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code where a.company_id=b.company_id and a.shift_code=b.shift_code and a.starts_at=b.starts_at and a.ends_at=b.ends_at and a.status='PUBLISHED' and a.published_at is not null and t.site_id is not distinct from b.site_id),'[]'),
 'next_shift',(select jsonb_build_object('assignment_id',x.id,'shift',x.shift_code,'start',x.starts_at,'end',x.ends_at) from public.shift_assignments x join public.shift_templates t on t.company_id=x.company_id and t.code=x.shift_code where x.company_id=b.company_id and x.status='PUBLISHED' and x.published_at is not null and x.starts_at>=b.ends_at and x.starts_at<=b.ends_at+interval '7 days' and t.site_id is not distinct from b.site_id and (b.site_id is not null or x.shift_code=b.shift_code) order by x.starts_at,x.shift_code,x.ends_at,x.id limit 1),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.critical desc,i.due_at,i.created_at) from public.shift_handover_items i where i.board_id=b.id),'[]'),
 'incoming',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'shift',o.shift_code,'start',o.starts_at,'sent_at',o.sent_at,'received_at',o.received_at,'revision',o.revision)) from public.shift_handovers o where o.target_id=b.id),'[]'),
 'reports',case when manager_ and private.sf_can_manage_time(p_company_id) then coalesce((select jsonb_agg(to_jsonb(r) order by r.version desc) from public.shift_handover_reports r where r.board_id=b.id),'[]') else '[]'::jsonb end,
 'events',coalesce((select jsonb_agg(jsonb_build_object('action',ev.action,'detail',ev.detail,'created_at',ev.created_at) order by ev.created_at desc) from public.shift_handover_events ev where ev.board_id=b.id),'[]')
 ) order by b.starts_at desc),'[]') into boards_ from public.shift_handovers b
 where b.company_id=p_company_id and b.starts_at>=(p_from-1)::timestamp at time zone tz
 and b.starts_at<(p_to+1)::timestamp at time zone tz and private.sf_handover_access(b.id);
 return jsonb_build_object('company_id',p_company_id,'manager',manager_,'can_report',manager_ and private.sf_can_manage_time(p_company_id),'timezone',tz,'as_of',now(),'shifts',shifts_,'boards',boards_,
 'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'first',e.first_name,'last',e.last_name) order by e.last_name,e.first_name)
 from public.employees e where e.company_id=p_company_id and e.deleted_at is null and exists(
 select 1 from public.shift_assignments a join public.shift_templates t on t.company_id=a.company_id and t.code=a.shift_code
 join public.shift_handovers b on b.company_id=a.company_id and b.shift_code=a.shift_code and b.starts_at=a.starts_at and b.ends_at=a.ends_at and b.site_id is not distinct from t.site_id
 where a.employee_id=e.id and a.status='PUBLISHED' and a.published_at is not null and private.sf_handover_access(b.id)
 and b.starts_at>=(p_from-1)::timestamp at time zone tz and b.starts_at<(p_to+1)::timestamp at time zone tz)),'[]'));
end $$;

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
create or replace function private.shift_handover_action(p_company_id uuid,p_action text,p_id uuid default null,p_revision bigint default null,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare manager_ boolean; employee_ uuid; a public.shift_assignments%rowtype; b public.shift_handovers%rowtype;
 target_ public.shift_handovers%rowtype; item_ public.shift_handover_items%rowtype; r public.shift_handover_reports%rowtype;
 site_ uuid; responsible_ uuid; new_id uuid; snap_ jsonb; ver_ integer; kind_ text; status_ text; title_ text; due_ timestamptz;
begin
 manager_:=private.sf_is_manager(p_company_id,false);employee_:=private.sf_handover_employee(p_company_id);
 if auth.uid() is null or private.sf_has_time_only_login() or (not manager_ and employee_ is null) then raise exception 'Keine Übergaberechte.' using errcode='42501';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'Ungültige Eingabe.';end if;
 -- Serialize scope creation, transfers, item edits and report version numbering for one company.
 perform pg_advisory_xact_lock(hashtextextended('open-market:'||p_company_id::text,0));
 if p_action='OPEN' then
 select * into a from public.shift_assignments where id=nullif(p_input->>'assignment_id','')::uuid and company_id=p_company_id;
 if a.id is null or a.status<>'PUBLISHED' or a.published_at is null or (not manager_ and a.employee_id is distinct from employee_) then raise exception 'Nur eigene veröffentlichte Schichten dürfen geöffnet werden.' using errcode='42501';end if;
 select site_id into site_ from public.shift_templates where company_id=p_company_id and code=a.shift_code;
 insert into public.shift_handovers(company_id,site_id,shift_code,starts_at,ends_at) values(p_company_id,site_,a.shift_code,a.starts_at,a.ends_at) on conflict do nothing;
 select * into b from public.shift_handovers where company_id=p_company_id and site_id is not distinct from site_ and shift_code=a.shift_code and starts_at=a.starts_at and ends_at=a.ends_at;
 return to_jsonb(b);
 end if;
 select * into b from public.shift_handovers where id=p_id and company_id=p_company_id for update;
 if b.id is null or not private.sf_handover_access(b.id) then raise exception 'Keine Rechte für diese Schichtübergabe.' using errcode='42501';end if;
 perform private.sf_handover_freeze(b.id);
 if p_revision is distinct from b.revision then raise exception 'Die Übergabe wurde inzwischen geändert. Bitte aktualisieren.' using errcode='40001';end if;
 if p_action in ('ADD','UPDATE') then
 if b.state<>'WORKING' then raise exception 'Die gesendete Übergabe ist abgeschlossen. In der Folgeschicht weiterarbeiten.';end if;
 if p_action='UPDATE' then
 select * into item_ from public.shift_handover_items where id=nullif(p_input->>'item_id','')::uuid and board_id=b.id and company_id=p_company_id;
 if item_.id is null then raise exception 'Aufgabe nicht gefunden.';end if;
 end if;
 kind_:=coalesce(p_input->>'kind',item_.kind,'TASK');status_:=coalesce(p_input->>'status',item_.status,'OPEN');title_:=trim(coalesce(p_input->>'title',item_.title,''));
 if kind_ not in ('TASK','CHECK','INCIDENT','NOTE') or status_ not in ('OPEN','IN_PROGRESS','DONE') or length(title_) not between 3 and 160 then raise exception 'Titel und Aufgabenstatus prüfen.';end if;
 responsible_:=nullif(p_input->>'responsible_employee_id','')::uuid;due_:=nullif(p_input->>'due_at','')::timestamptz;
 if responsible_ is not null and not exists(select 1 from public.shift_assignments x join public.shift_templates t on t.company_id=x.company_id and t.code=x.shift_code join public.employees e on e.id=x.employee_id and e.company_id=x.company_id and e.deleted_at is null
 where x.company_id=b.company_id and x.employee_id=responsible_ and x.shift_code=b.shift_code and x.starts_at=b.starts_at and x.ends_at=b.ends_at and t.site_id is not distinct from b.site_id and x.status='PUBLISHED' and x.published_at is not null) then raise exception 'Verantwortliche müssen zu dieser veröffentlichten Schicht gehören.';end if;
 if status_='DONE' and kind_<>'NOTE' and length(trim(coalesce(p_input->>'resolution','')))<3 then raise exception 'Bitte Erledigung kurz dokumentieren.';end if;
 if p_action='ADD' then
 if (select count(*) from public.shift_handover_items where board_id=b.id)>=200 then raise exception 'Höchstens 200 Punkte je Übergabe.';end if;
 new_id:=nullif(p_input->>'client_id','')::uuid;if new_id is null then raise exception 'Speicherkennung fehlt.';end if;
 insert into public.shift_handover_items(id,company_id,board_id,employee_id,kind,title,detail,status,critical,due_at,escalation,report_include,responsible_employee_id,resolution)
 values(new_id,p_company_id,b.id,employee_,kind_,title_,coalesce(p_input->>'detail',''),status_,coalesce((p_input->>'critical')::boolean,false),due_,coalesce(p_input->>'escalation',''),coalesce((p_input->>'report_include')::boolean,false),responsible_,coalesce(p_input->>'resolution',''));
 else
 update public.shift_handover_items set kind=kind_,title=title_,detail=coalesce(p_input->>'detail',''),status=status_,critical=coalesce((p_input->>'critical')::boolean,false),due_at=due_,escalation=coalesce(p_input->>'escalation',''),report_include=coalesce((p_input->>'report_include')::boolean,false),responsible_employee_id=responsible_,resolution=coalesce(p_input->>'resolution',''),updated_at=now() where id=item_.id;
 new_id:=item_.id;
 end if;
 elsif p_action='SEND' then
 if b.state<>'WORKING' then raise exception 'Übergabe bereits gesendet.';end if;
 if not coalesce((p_input->>'confirmed')::boolean,false) then raise exception 'Übergabe bitte bestätigen.';end if;
 -- The earliest next published shift at the same site. Unscoped models stay within their shift code.
 select x.* into a from public.shift_assignments x join public.shift_templates t on t.company_id=x.company_id and t.code=x.shift_code
 where x.company_id=b.company_id and x.status='PUBLISHED' and x.published_at is not null and x.starts_at>=b.ends_at
 and x.starts_at<=b.ends_at+interval '7 days' and t.site_id is not distinct from b.site_id
 and (b.site_id is not null or x.shift_code=b.shift_code) order by x.starts_at,x.shift_code,x.ends_at,x.id limit 1;
 if a.id is distinct from nullif(p_input->>'target_assignment_id','')::uuid then raise exception 'Die Folgeschicht hat sich geändert. Bitte aktualisieren.' using errcode='40001';end if;
 if a.id is null then raise exception 'Keine nächste veröffentlichte Schicht am selben Standort innerhalb von sieben Tagen vorhanden.';end if;
 insert into public.shift_handovers(company_id,site_id,shift_code,starts_at,ends_at) values(p_company_id,b.site_id,a.shift_code,a.starts_at,a.ends_at) on conflict do nothing;
 select * into target_ from public.shift_handovers where company_id=p_company_id and site_id is not distinct from b.site_id and shift_code=a.shift_code and starts_at=a.starts_at and ends_at=a.ends_at for update;
 perform private.sf_handover_freeze(target_.id);
 if (select count(*) from public.shift_handover_items where board_id=target_.id)+(select count(*) from public.shift_handover_items where board_id=b.id and status in ('OPEN','IN_PROGRESS'))>200 then raise exception 'Die Folgeschicht hätte mehr als 200 Punkte. Bitte Aufgaben vorher erledigen.';end if;
 if target_.state<>'WORKING' then raise exception 'Die Folgeschicht wurde bereits übergeben. Bitte Planungsleitung informieren.';end if;
 insert into public.shift_handover_items(company_id,board_id,source_id,employee_id,kind,title,detail,status,critical,due_at,escalation,report_include,resolution)
 select company_id,target_.id,id,employee_id,kind,title,detail,'OPEN',critical,due_at,escalation,report_include,resolution from public.shift_handover_items where board_id=b.id and status in ('OPEN','IN_PROGRESS');
 update public.shift_handover_items set status='CARRIED',updated_at=now() where board_id=b.id and status in ('OPEN','IN_PROGRESS');
 update public.shift_handovers set state='SENT',sent_at=now(),target_id=target_.id where id=b.id;
 update public.shift_handovers set revision=revision+1,updated_at=now() where id=target_.id;
 insert into public.shift_handover_events(company_id,board_id,employee_id,actor_id,action,detail) values(p_company_id,target_.id,employee_,auth.uid(),'INCOMING',jsonb_build_object('source_id',b.id));
 elsif p_action='RECEIVE' then
 select * into target_ from public.shift_handovers where id=nullif(p_input->>'source_id','')::uuid and company_id=p_company_id and target_id=b.id for update;
 if target_.id is null or target_.received_at is not null then raise exception 'Keine unbestätigte Übergabe vorhanden.';end if;
 if not manager_ and not private.sf_handover_access(b.id) then raise exception 'Nur das Folgeteam kann übernehmen.' using errcode='42501';end if;
 if not coalesce((p_input->>'confirmed')::boolean,false) then raise exception 'Übernahme bitte bestätigen.';end if;
 update public.shift_handovers set received_at=now(),employee_id=employee_,revision=revision+1,updated_at=now() where id=target_.id;
 elsif p_action='DRAFT' then
 if not manager_ or not private.sf_can_manage_time(p_company_id) then raise exception 'Für Leistungsberichte sind Zeitverwaltungsrechte erforderlich.' using errcode='42501';end if;
 if b.ends_at>now() then raise exception 'Leistungsberichte erst nach Schichtende erstellen.';end if;
 if (select count(*) from public.shift_handover_reports where board_id=b.id)>=25 then raise exception 'Höchstens 25 Berichtsversionen je Schicht.';end if;
 snap_:=private.sf_handover_snapshot(b.id);select coalesce(max(version),0)+1 into ver_ from public.shift_handover_reports where board_id=b.id;
 insert into public.shift_handover_reports(company_id,board_id,version,snapshot,employee_id,created_by) values(p_company_id,b.id,ver_,snap_,employee_,auth.uid()) returning id into new_id;
 elsif p_action in ('APPROVE','REJECT') then
 if not manager_ or not private.sf_can_manage_time(p_company_id) then raise exception 'Keine Berichtsfreigaberechte.' using errcode='42501';end if;
 select * into r from public.shift_handover_reports where id=nullif(p_input->>'report_id','')::uuid and board_id=b.id and company_id=p_company_id for update;
 if r.id is null or r.state<>'DRAFT' then raise exception 'Nur Berichtsentwürfe können entschieden werden.';end if;
 if length(trim(coalesce(p_input->>'review_note','')))<5 then raise exception 'Bitte Prüfung oder Ablehnung kurz begründen.';end if;
 if p_action='APPROVE' and not coalesce((p_input->>'confirmed')::boolean,false) then raise exception 'Freigabe bitte bestätigen.';end if;
 if p_action='APPROVE' and (r.snapshot - 'as_of' - 'board_revision') is distinct from (private.sf_handover_snapshot(b.id) - 'as_of' - 'board_revision') then raise exception 'Berichtsgrundlage geändert. Bitte neuen Entwurf erstellen.' using errcode='40001';end if;
 update public.shift_handover_reports set state=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,approved_at=case when p_action='APPROVE' then now() end,review_note=trim(p_input->>'review_note'),approved_by=case when p_action='APPROVE' then auth.uid() end where id=r.id;
 new_id:=r.id;
 else raise exception 'Unbekannte Übergabeaktion.';end if;
 update public.shift_handovers set revision=revision+1,updated_at=now() where id=b.id;
 insert into public.shift_handover_events(company_id,board_id,employee_id,actor_id,action,detail) values(p_company_id,b.id,employee_,auth.uid(),p_action,jsonb_strip_nulls(jsonb_build_object('item_id',case when p_action in ('ADD','UPDATE') then new_id end,'report_id',case when p_action in ('DRAFT','APPROVE','REJECT') then new_id end)));
 return jsonb_build_object('id',b.id,'result_id',new_id);
end $$;
-- Defense in depth: an approved version cannot be rewritten, even by accidental internal SQL.
create or replace function private.sf_handover_report_guard() returns trigger language plpgsql set search_path='' as $$
begin if old.state<>'DRAFT' then raise exception 'Entschiedene Leistungsberichte sind unveränderlich.';end if;
 if new.snapshot is distinct from old.snapshot or new.version<>old.version or new.board_id<>old.board_id or new.company_id<>old.company_id then raise exception 'Berichtsentwürfe dürfen nicht überschrieben werden. Neue Version erstellen.';end if;
 return new;end $$;
create trigger handover_report_immutable before update on public.shift_handover_reports for each row execute function private.sf_handover_report_guard();

revoke all on function private.sf_handover_employee(uuid),private.sf_handover_access(uuid),private.sf_handover_snapshot(uuid),private.sf_handover_report_guard() from public,anon,authenticated;
revoke all on function private.shift_handover_bundle(uuid,date,date),private.shift_handover_action(uuid,text,uuid,bigint,jsonb) from public,anon;
grant execute on function private.shift_handover_bundle(uuid,date,date),private.shift_handover_action(uuid,text,uuid,bigint,jsonb) to authenticated;
create or replace function public.shift_handover_bundle(p_company_id uuid,p_from date,p_to date) returns jsonb language sql stable security invoker set search_path='' as $$ select private.shift_handover_bundle(p_company_id,p_from,p_to);$$;
create or replace function public.shift_handover_action(p_company_id uuid,p_action text,p_id uuid default null,p_revision bigint default null,p_input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.shift_handover_action(p_company_id,p_action,p_id,p_revision,p_input);$$;
revoke all on function public.shift_handover_bundle(uuid,date,date),public.shift_handover_action(uuid,text,uuid,bigint,jsonb) from public,anon;
grant execute on function public.shift_handover_bundle(uuid,date,date),public.shift_handover_action(uuid,text,uuid,bigint,jsonb) to authenticated;
DO $$declare t text;begin foreach t in array array['shift_handovers','shift_handover_items','shift_handover_reports','shift_handover_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('create trigger a00_employee_erasure_freeze before insert or update or delete on public.%I for each row execute function private.sf_guard_employee_erasure_pending()',t);
 end loop;end $$;
notify pgrst,'reload schema';
