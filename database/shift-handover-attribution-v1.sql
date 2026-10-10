-- Approval attribution stays internal; external reports contain no automatic staff identity.
alter table public.shift_handover_events add column actor_id uuid;
alter table public.shift_handover_reports add column created_by uuid;
alter table public.shift_handover_reports add column approved_by uuid;
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
notify pgrst,'reload schema';
