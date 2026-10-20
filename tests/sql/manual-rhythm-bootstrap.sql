-- Isolated supporting schema. Existing production guard functions are loaded separately.
create table public.company_compliance_policy(company_id uuid primary key,solid_planning_rules jsonb,standard_min_rest_hours numeric,standard_max_shift_hours numeric);
create table public.company_planning_teams(company_id uuid,team_code text,start_date date,pattern text[],start_offset integer);
create table public.absences(company_id uuid,employee_id uuid,start_date date,end_date date,status text,full_day boolean default true);
alter table public.shift_assignments add unique(company_id,legacy_id);
create function private.sf_ot_day_holiday(uuid,date) returns boolean language sql as $$select false$$;
create function private.sf_ot_day(uuid,date,uuid) returns boolean language sql as $$select true$$;
create function private.sf_approved_absence_overlaps(company_ uuid,employee_ uuid,starts_ timestamptz,ends_ timestamptz,tz_ text) returns boolean language sql as $$select exists(select 1 from public.absences where company_id=company_ and employee_id=employee_ and status in('Genehmigt','Erfasst') and start_date<=(ends_ at time zone tz_)::date and end_date>=(starts_ at time zone tz_)::date)$$;
create function private.sf_month_optimization_snapshot(company_ uuid,month_ date) returns jsonb language plpgsql set search_path='' as $$declare ids_ jsonb;begin select coalesce(jsonb_agg(a.id),'[]') into ids_ from public.shift_assignments a where a.company_id=company_ and (a.status<>'DRAFT' OR coalesce(a.note,'')~*'(markt|market|freiwill|tausch)');return jsonb_build_object('protectedIds',ids_);end$$;
create table public.shift_change_requests(id uuid default gen_random_uuid(),company_id uuid,employee_id uuid,assignment_id uuid,action text,status text,compliance_status text,requires_employee_approval boolean,requires_works_council boolean,base_version integer,proposed_snapshot jsonb,old_snapshot jsonb,applied_at timestamptz);
create table public.shift_change_approvals(change_request_id uuid,approval_type text,status text);
create table public.compliance_findings(change_request_id uuid,status text);
grant select,insert,update,delete on all tables in schema public to authenticated;

-- Mirror the pre-existing backend audit capture, not a new privilege for feature clients.
create function private.capture_audit_change() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,new_values) values(new.company_id,upper(tg_op||'_'||tg_table_name),tg_table_name,new.id,auth.uid(),to_jsonb(new));return new;end$$;
create trigger sf_audit_shift_assignments after insert or update on public.shift_assignments for each row execute function private.capture_audit_change();
create trigger sf_audit_shift_change_requests after insert or update on public.shift_change_requests for each row execute function private.capture_audit_change();
revoke insert on public.audit_events from authenticated;
