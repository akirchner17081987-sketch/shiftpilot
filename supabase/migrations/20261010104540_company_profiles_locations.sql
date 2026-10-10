-- Company profiles and locations: tenant-scoped, optimistic writes and filtered employee contacts.
create table public.company_profiles (
  company_id uuid primary key references public.companies(id) on delete cascade,
  display_location text not null default '' check(length(display_location)<=200),
  business_address text not null default '' check(length(business_address)<=500),
  logo_data_url text not null default '' check(length(logo_data_url)<=320000),
  contacts jsonb not null default '[]'::jsonb check(jsonb_typeof(contacts)='array' and jsonb_array_length(contacts)<=20),
  revision bigint not null default 1 check(revision>0),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null
);
create table public.company_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null check(code ~ '^[A-Z0-9][A-Z0-9_-]{0,11}$'),
  name text not null check(length(btrim(name)) between 1 and 100),
  address text not null default '' check(length(address)<=500),
  contact_name text not null default '' check(length(contact_name)<=100),
  contact_email text not null default '' check(length(contact_email)<=254),
  contact_phone text not null default '' check(length(contact_phone)<=40),
  is_active boolean not null default true,
  revision bigint not null default 1 check(revision>0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  unique(company_id,id), unique(company_id,code)
);
alter table public.company_profiles enable row level security;
alter table public.company_locations enable row level security;
revoke all on public.company_profiles,public.company_locations from anon,authenticated;
grant select on public.company_profiles,public.company_locations to authenticated;
grant all on public.company_profiles,public.company_locations to service_role;

create or replace function private.sf_company_profile_can_read(p_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.company_members cm
 where cm.company_id=p_company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
 and cm.role in ('OWNER','ADMIN','PLANNER','DISPATCHER','VIEWER'));
$$;
create or replace function private.sf_company_profile_can_write(p_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.company_members cm
 where cm.company_id=p_company_id and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
 and cm.role in ('OWNER','ADMIN') and not ('read_only'=any(cm.extra_permissions)));
$$;
revoke all on function private.sf_company_profile_can_read(uuid),private.sf_company_profile_can_write(uuid) from public,anon;
grant execute on function private.sf_company_profile_can_read(uuid),private.sf_company_profile_can_write(uuid) to authenticated;
create policy company_profiles_manager_read on public.company_profiles for select to authenticated using(private.sf_company_profile_can_read(company_id));
create policy company_locations_manager_read on public.company_locations for select to authenticated using(private.sf_company_profile_can_read(company_id));

alter table public.shift_templates add column site_id uuid;
alter table public.shift_templates add constraint shift_template_company_site_fk foreign key(company_id,site_id) references public.company_locations(company_id,id);
create index shift_templates_site_idx on public.shift_templates(company_id,site_id) where site_id is not null;
alter table public.time_qr_terminals add column site_id uuid;
alter table public.time_qr_terminals add constraint qr_terminal_company_site_fk foreign key(company_id,site_id) references public.company_locations(company_id,id);
create index time_qr_terminals_site_idx on public.time_qr_terminals(company_id,site_id) where site_id is not null;

create or replace function private.manager_company_profile(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare co public.companies%rowtype; p public.company_profiles%rowtype; sites jsonb;
begin
 if not private.sf_company_profile_can_read(p_company_id) then raise exception using errcode='42501',message='Für dieses Unternehmen fehlen Leserechte.'; end if;
 select * into strict co from public.companies where id=p_company_id;
 select * into p from public.company_profiles where company_id=p_company_id;
 select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('shift_count',(select count(*) from public.shift_templates t where t.company_id=p_company_id and t.site_id=s.id),'terminal_count',(select count(*) from public.time_qr_terminals t where t.company_id=p_company_id and t.site_id=s.id)) order by s.is_active desc,s.name,s.code),'[]'::jsonb) into sites from public.company_locations s where s.company_id=p_company_id;
 return jsonb_build_object('company_id',co.id,'name',co.name,'timezone',co.timezone,'company_updated_at',co.updated_at,
 'display_location',coalesce(p.display_location,''),'business_address',coalesce(p.business_address,''),'logo_data_url',coalesce(p.logo_data_url,''),'contacts',coalesce(p.contacts,'[]'::jsonb),'revision',coalesce(p.revision,0),'updated_at',coalesce(p.updated_at,co.updated_at),'can_edit',private.sf_company_profile_can_write(p_company_id),'sites',sites,
 'federal_state',(select federal_state from public.time_account_settings where company_id=p_company_id));
end;
$$;
create or replace function public.manager_company_profile(p_company_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$select private.manager_company_profile(p_company_id);$$;

create or replace function private.manager_save_company_profile(p_company_id uuid,p_profile jsonb,p_expected_revision bigint,p_expected_company_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare co public.companies%rowtype; oldp public.company_profiles%rowtype; newp public.company_profiles%rowtype;
 nm text; tz text; loc text; addr text; logo text; ct jsonb; c jsonb; clean jsonb:='[]'::jsonb; oldv jsonb; newv jsonb; b bytea;
begin
 if not private.sf_company_profile_can_write(p_company_id) then raise exception using errcode='42501',message='Nur Inhaber und Administratoren dürfen Unternehmensdaten bearbeiten.'; end if;
 if jsonb_typeof(p_profile) is distinct from 'object' or p_expected_revision is null or p_expected_company_updated_at is null then raise exception using errcode='22023',message='Ungültige Unternehmensdaten oder fehlender Versionsstand.'; end if;
 select * into strict co from public.companies where id=p_company_id for update;
 select * into oldp from public.company_profiles where company_id=p_company_id for update;
 if coalesce(oldp.revision,0)<>p_expected_revision or co.updated_at is distinct from p_expected_company_updated_at then raise exception using errcode='40001',message='Die Unternehmensdaten wurden inzwischen geändert. Bitte neu laden und deine Änderungen erneut prüfen.'; end if;
 nm:=btrim(coalesce(p_profile->>'name','')); tz:=p_profile->>'timezone'; loc:=btrim(coalesce(p_profile->>'display_location','')); addr:=btrim(coalesce(p_profile->>'business_address','')); logo:=coalesce(p_profile->>'logo_data_url',''); ct:=coalesce(p_profile->'contacts','[]'::jsonb);
 if length(nm) not between 2 and 120 or length(loc)>200 or length(addr)>500 or tz is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=tz) then raise exception using errcode='22023',message='Bitte einen gültigen Unternehmensnamen, Standort und eine gültige Zeitzone angeben.'; end if;
 if length(logo)>320000 or (logo<>'' and logo !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$') then raise exception using errcode='22023',message='Das Logo muss ein PNG mit höchstens 240 KB sein.'; end if;
 if logo<>'' then b:=decode(split_part(logo,',',2),'base64'); if octet_length(b)<33 or octet_length(b)>240000 or encode(substring(b from 1 for 8),'hex')<>'89504e470d0a1a0a' or encode(substring(b from 13 for 4),'hex')<>'49484452' then raise exception using errcode='22023',message='Das Logo ist kein gültiges PNG.'; end if; end if;
 if jsonb_typeof(ct) is distinct from 'array' then raise exception using errcode='22023',message='Ungültige Ansprechpartner.'; end if;
 if jsonb_array_length(ct)>20 then raise exception using errcode='22023',message='Maximal 20 Ansprechpartner sind möglich.'; end if;
 for c in select value from jsonb_array_elements(ct) loop
  if jsonb_typeof(c) is distinct from 'object' or length(coalesce(c->>'id',''))>80 or coalesce(c->>'kind','') not in ('planning','personnel','time') or length(btrim(coalesce(c->>'name',''))) not between 1 and 100 or length(coalesce(c->>'email',''))>254 or length(coalesce(c->>'phone',''))>40 or (coalesce(c->>'email','')<>'' and c->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (c ? 'visible_to_employees' and jsonb_typeof(c->'visible_to_employees')<>'boolean') then raise exception using errcode='22023',message='Bitte gültige Ansprechpartner mit Name, Bereich und optionaler E-Mail angeben.'; end if;
  clean:=clean||jsonb_build_array(jsonb_build_object('id',coalesce(nullif(c->>'id',''),'contact-'||jsonb_array_length(clean)::text),'kind',c->>'kind','name',btrim(c->>'name'),'email',btrim(coalesce(c->>'email','')),'phone',btrim(coalesce(c->>'phone','')),'visible_to_employees',coalesce((c->>'visible_to_employees')::boolean,false)));
 end loop;
 oldv:=(coalesce(to_jsonb(oldp),'{}'::jsonb)-'logo_data_url')||jsonb_build_object('name',co.name,'timezone',co.timezone,'logo_present',coalesce(oldp.logo_data_url,'')<>'');
 update public.companies set name=nm,timezone=tz where id=p_company_id;
 insert into public.company_profiles(company_id,display_location,business_address,logo_data_url,contacts,revision,updated_at,updated_by) values(p_company_id,loc,addr,logo,clean,1,clock_timestamp(),auth.uid())
 on conflict(company_id) do update set display_location=excluded.display_location,business_address=excluded.business_address,logo_data_url=excluded.logo_data_url,contacts=excluded.contacts,revision=public.company_profiles.revision+1,updated_at=excluded.updated_at,updated_by=excluded.updated_by returning * into newp;
 newv:=(to_jsonb(newp)-'logo_data_url')||jsonb_build_object('name',nm,'timezone',tz,'logo_present',logo<>'');
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata) select p_company_id,'COMPANY_PROFILE_UPDATED','company_profile',p_company_id,auth.uid(),cm.role,oldv,newv,jsonb_build_object('backendCaptured',true,'logo_changed',coalesce(oldp.logo_data_url,'')<>logo) from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid();
 return private.manager_company_profile(p_company_id);
end;
$$;
create or replace function public.manager_save_company_profile(p_company_id uuid,p_profile jsonb,p_expected_revision bigint,p_expected_company_updated_at timestamptz)
returns jsonb language sql security invoker set search_path='' as $$select private.manager_save_company_profile(p_company_id,p_profile,p_expected_revision,p_expected_company_updated_at);$$;

create or replace function private.manager_save_company_location(p_company_id uuid,p_location jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.company_locations%rowtype; oldv jsonb; idv uuid; cd text; nm text; addr text; cn text; ce text; cp text; activev boolean;
begin
 if not private.sf_company_profile_can_write(p_company_id) then raise exception using errcode='42501',message='Nur Inhaber und Administratoren dürfen Standorte verwalten.'; end if;
 if jsonb_typeof(p_location) is distinct from 'object' or p_expected_revision is null then raise exception using errcode='22023',message='Ungültiger Standort oder fehlender Versionsstand.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('company-locations:'||p_company_id::text,0));
 idv:=nullif(p_location->>'id','')::uuid;
 if idv is not null then select * into s from public.company_locations where id=idv and company_id=p_company_id for update; if not found then raise exception using errcode='42501',message='Der Standort gehört nicht zu diesem Unternehmen.'; end if; if s.revision<>p_expected_revision then raise exception using errcode='40001',message='Der Standort wurde inzwischen geändert. Bitte neu laden.'; end if; elsif p_expected_revision<>0 then raise exception using errcode='40001',message='Ungültiger Versionsstand für einen neuen Standort.'; end if;
 cd:=upper(btrim(coalesce(p_location->>'code',''))); nm:=btrim(coalesce(p_location->>'name','')); addr:=btrim(coalesce(p_location->>'address','')); cn:=btrim(coalesce(p_location->>'contact_name','')); ce:=btrim(coalesce(p_location->>'contact_email','')); cp:=btrim(coalesce(p_location->>'contact_phone','')); activev:=coalesce((p_location->>'is_active')::boolean,true);
 if cd !~ '^[A-Z0-9][A-Z0-9_-]{0,11}$' or length(nm) not between 1 and 100 or length(addr)>500 or length(cn)>100 or length(ce)>254 or length(cp)>40 or (ce<>'' and ce !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception using errcode='22023',message='Bitte gültiges Kürzel, Standortname und Kontaktdaten angeben.'; end if;
 if exists(select 1 from public.company_locations where company_id=p_company_id and code=cd and id is distinct from idv) then raise exception using errcode='23505',message='Dieses Standortkürzel ist bereits vergeben.'; end if;
 if idv is null and (select count(*) from public.company_locations where company_id=p_company_id)>=100 then raise exception using errcode='22023',message='Maximal 100 Standorte pro Unternehmen sind möglich.'; end if;
 oldv:=case when idv is null then null else to_jsonb(s) end;
 if idv is null then insert into public.company_locations(company_id,code,name,address,contact_name,contact_email,contact_phone,is_active,updated_by) values(p_company_id,cd,nm,addr,cn,ce,cp,activev,auth.uid()) returning * into s;
 else update public.company_locations set code=cd,name=nm,address=addr,contact_name=cn,contact_email=ce,contact_phone=cp,is_active=activev,revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=idv and company_id=p_company_id returning * into s; end if;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata) select p_company_id,case when oldv is null then 'COMPANY_LOCATION_CREATED' else 'COMPANY_LOCATION_UPDATED' end,'company_location',s.id,auth.uid(),cm.role,oldv,to_jsonb(s),jsonb_build_object('backendCaptured',true) from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid();
 return to_jsonb(s);
end;
$$;
create or replace function public.manager_save_company_location(p_company_id uuid,p_location jsonb,p_expected_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$select private.manager_save_company_location(p_company_id,p_location,p_expected_revision);$$;

create or replace function private.manager_company_profile_history(p_company_id uuid,p_before timestamptz default null,p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.sf_company_profile_can_write(p_company_id) then raise exception using errcode='42501',message='Der Änderungsverlauf ist nur für Inhaber und Administratoren sichtbar.'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into result from (select a.id,a.created_at,a.event_type,a.entity_type,a.actor_role,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,'System') actor_name,a.old_values,a.new_values,a.metadata from public.audit_events a left join auth.users u on u.id=a.actor_id where a.company_id=p_company_id and (a.event_type in ('COMPANY_PROFILE_UPDATED','COMPANY_LOCATION_CREATED','COMPANY_LOCATION_UPDATED','COMPANY_QR_LOCATION_UPDATED') or (a.entity_type='shift_templates' and a.old_values->>'site_id' is distinct from a.new_values->>'site_id')) and (p_before is null or a.created_at<p_before) order by a.created_at desc,a.id desc limit least(greatest(coalesce(p_limit,30),1),100))x;
 return result;
end;
$$;
create or replace function public.manager_company_profile_history(p_company_id uuid,p_before timestamptz default null,p_limit integer default 30)
returns jsonb language sql stable security invoker set search_path='' as $$select private.manager_company_profile_history(p_company_id,p_before,p_limit);$$;

create or replace function private.employee_my_company_profile(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.employees e where e.company_id=p_company_id and e.auth_user_id=auth.uid() and e.status='active' and e.access_status='ACTIVE' and e.deleted_at is null) then raise exception using errcode='42501',message='Kein aktiver Mitarbeiterzugang für dieses Unternehmen.'; end if;
 select jsonb_build_object('company_id',c.id,'name',c.name,'timezone',c.timezone,'display_location',coalesce(p.display_location,''),'logo_data_url',coalesce(p.logo_data_url,''),'contacts',coalesce((select jsonb_agg(x) from jsonb_array_elements(p.contacts)x where x->>'visible_to_employees'='true'),'[]'::jsonb)) into result from public.companies c left join public.company_profiles p on p.company_id=c.id where c.id=p_company_id;
 return result;
end;
$$;
create or replace function public.employee_my_company_profile(p_company_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$select private.employee_my_company_profile(p_company_id);$$;

create or replace function private.manager_create_time_qr_terminal_at_site(p_company_id uuid,p_name text,p_location_note text,p_site_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.sf_company_profile_can_write(p_company_id) then raise exception using errcode='42501',message='Keine Berechtigung zur Terminalverwaltung.'; end if;
 if p_site_id is not null and not exists(select 1 from public.company_locations where company_id=p_company_id and id=p_site_id and is_active) then raise exception using errcode='22023',message='Bitte einen aktiven Standort dieses Unternehmens auswählen.'; end if;
 result:=public.manager_create_time_qr_terminal(p_company_id,p_name,p_location_note);
 update public.time_qr_terminals set site_id=p_site_id where id=(result->>'id')::uuid and company_id=p_company_id;
 return result||jsonb_build_object('site_id',p_site_id);
end;
$$;
create or replace function public.manager_create_time_qr_terminal_at_site(p_company_id uuid,p_name text,p_location_note text,p_site_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.manager_create_time_qr_terminal_at_site(p_company_id,p_name,p_location_note,p_site_id);$$;

create or replace function private.manager_set_time_qr_terminal_site(p_company_id uuid,p_terminal_id uuid,p_site_id uuid,p_expected_site_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.time_qr_terminals%rowtype; oldv jsonb;
begin
 if not private.sf_company_profile_can_write(p_company_id) then raise exception using errcode='42501',message='Keine Berechtigung zur Terminalverwaltung.'; end if;
 select * into t from public.time_qr_terminals where company_id=p_company_id and id=p_terminal_id for update;
 if not found then raise exception using errcode='42501',message='Terminal nicht gefunden.'; end if;
 if t.site_id is distinct from p_expected_site_id then raise exception using errcode='40001',message='Die Standortzuordnung wurde inzwischen geändert. Bitte neu laden.'; end if;
 if p_site_id is not null and p_site_id is distinct from t.site_id and not exists(select 1 from public.company_locations where company_id=p_company_id and id=p_site_id and is_active) then raise exception using errcode='22023',message='Bitte einen aktiven Standort dieses Unternehmens auswählen.'; end if;
 oldv:=jsonb_build_object('name',t.name,'site_id',t.site_id);
 update public.time_qr_terminals set site_id=p_site_id,updated_at=clock_timestamp(),updated_by=auth.uid() where id=t.id and company_id=p_company_id;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,old_values,new_values,metadata) select p_company_id,'COMPANY_QR_LOCATION_UPDATED','time_qr_terminal',t.id,auth.uid(),cm.role,oldv,jsonb_build_object('name',t.name,'site_id',p_site_id),jsonb_build_object('backendCaptured',true) from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid();
 return jsonb_build_object('id',t.id,'site_id',p_site_id);
end;
$$;
create or replace function public.manager_set_time_qr_terminal_site(p_company_id uuid,p_terminal_id uuid,p_site_id uuid,p_expected_site_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.manager_set_time_qr_terminal_site(p_company_id,p_terminal_id,p_site_id,p_expected_site_id);$$;

-- Only authenticated RPC callers can reach these private implementations; each rechecks tenant and role.
revoke all on function private.manager_company_profile(uuid),private.manager_save_company_profile(uuid,jsonb,bigint,timestamptz),private.manager_save_company_location(uuid,jsonb,bigint),private.manager_company_profile_history(uuid,timestamptz,integer),private.employee_my_company_profile(uuid),private.manager_create_time_qr_terminal_at_site(uuid,text,text,uuid),private.manager_set_time_qr_terminal_site(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function private.manager_company_profile(uuid),private.manager_save_company_profile(uuid,jsonb,bigint,timestamptz),private.manager_save_company_location(uuid,jsonb,bigint),private.manager_company_profile_history(uuid,timestamptz,integer),private.employee_my_company_profile(uuid),private.manager_create_time_qr_terminal_at_site(uuid,text,text,uuid),private.manager_set_time_qr_terminal_site(uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.manager_company_profile(uuid),public.manager_save_company_profile(uuid,jsonb,bigint,timestamptz),public.manager_save_company_location(uuid,jsonb,bigint),public.manager_company_profile_history(uuid,timestamptz,integer),public.employee_my_company_profile(uuid),public.manager_create_time_qr_terminal_at_site(uuid,text,text,uuid),public.manager_set_time_qr_terminal_site(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.manager_company_profile(uuid),public.manager_save_company_profile(uuid,jsonb,bigint,timestamptz),public.manager_save_company_location(uuid,jsonb,bigint),public.manager_company_profile_history(uuid,timestamptz,integer),public.employee_my_company_profile(uuid),public.manager_create_time_qr_terminal_at_site(uuid,text,text,uuid),public.manager_set_time_qr_terminal_site(uuid,uuid,uuid,uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.manager_manage_shift_model(p_company_id uuid, p_action text, p_model jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_code text := btrim(coalesce(p_model->>'code',''));
  v_name text; v_start time; v_end time; v_color text; v_soll integer;
  v_model public.shift_templates%rowtype; v_used boolean;
  v_site uuid;
  v_mode text; v_optional integer; v_responsible uuid; v_only boolean; v_days integer[];
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_members WHERE company_id=p_company_id
      AND user_id=auth.uid() AND status='ACTIVE'
      AND role IN ('OWNER','ADMIN','PLANNER','DISPATCHER')
  ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Für dieses Unternehmen fehlen aktive Planungsrechte.'; END IF;
  IF p_action NOT IN ('CREATE','UPDATE','REMOVE','RESTORE') OR p_action IS NULL
    OR jsonb_typeof(p_model) IS DISTINCT FROM 'object'
    OR v_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Ungültige Aktion oder ungültiges Schichtkürzel.';
  END IF;
  -- Serialize catalogue edits within one company, including case-insensitive codes.
  PERFORM pg_advisory_xact_lock(hashtextextended('shift-model:'||p_company_id::text,0));
  SELECT * INTO v_model FROM public.shift_templates
    WHERE company_id=p_company_id AND lower(code)=lower(v_code) FOR UPDATE;
  IF p_action='CREATE' AND FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Dieses Kürzel ist bereits vorhanden. Entfernte Modelle können wiederhergestellt werden.';
  ELSIF p_action<>'CREATE' AND NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Das Schichtmodell wurde nicht gefunden.';
  END IF;
  IF p_action='REMOVE' THEN
    v_used := EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=p_company_id AND shift_code=v_model.code)
      OR EXISTS(SELECT 1 FROM public.shift_change_requests WHERE company_id=p_company_id
        AND (old_snapshot->>'type'=v_model.code OR proposed_snapshot->>'type'=v_model.code))
      OR EXISTS(SELECT 1 FROM public.employees WHERE company_id=p_company_id
        AND (v_model.code=ANY(shift_permissions) OR v_model.code=ANY(qualifications)))
      OR EXISTS(SELECT 1 FROM public.datev_lodas_rules WHERE company_id=p_company_id AND source_key=v_model.code);
    IF v_used THEN
      UPDATE public.shift_templates SET active=false WHERE id=v_model.id;
    ELSE
      DELETE FROM public.shift_templates WHERE id=v_model.id;
    END IF;
    DELETE FROM public.global_staffing_requirements WHERE company_id=p_company_id AND shift_code=v_model.code;
    DELETE FROM public.daily_staffing_overrides WHERE company_id=p_company_id AND shift_code=v_model.code;
    RETURN jsonb_build_object('code',v_model.code,'removed',true,'archived',v_used);
  END IF;
  v_site:=case when p_model ? 'site_id' then nullif(p_model->>'site_id','')::uuid else v_model.site_id end;
  if v_site is not null and v_site is distinct from v_model.site_id and not exists(select 1 from public.company_locations where id=v_site and company_id=p_company_id and is_active) then raise exception using errcode='22023',message='Bitte einen aktiven Standort dieses Unternehmens auswählen.'; end if;
  v_name:=btrim(coalesce(p_model->>'name','')); v_color:=p_model->>'color';
  IF length(v_name) NOT BETWEEN 1 AND 80 OR v_name ~ '[<>]'
    OR coalesce(p_model->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR coalesce(p_model->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR coalesce(p_model->>'soll','') !~ '^[0-9]{1,2}$'
    OR v_color IS NULL OR v_color NOT IN ('blue','amber','pink','teal','cyan','violet','magenta','olive','gray') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Bitte gültigen Namen, Zeiten, Farbe und eine SOLL-Stärke von 0 bis 99 angeben.';
  END IF;
  v_start:=(p_model->>'start')::time; v_end:=(p_model->>'end')::time; v_soll:=(p_model->>'soll')::integer;
  IF v_start=v_end THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Beginn und Ende müssen unterschiedlich sein.'; END IF;
  v_mode:=coalesce(p_model->>'planning_mode',v_model.planning_mode,'required');
  v_optional:=coalesce((p_model->>'optional_staffing')::integer,v_model.optional_staffing,0);
  v_responsible:=CASE WHEN p_model ? 'responsible_employee_id' THEN nullif(p_model->>'responsible_employee_id','')::uuid ELSE v_model.responsible_employee_id END;
  v_only:=coalesce((p_model->>'responsible_only')::boolean,v_model.responsible_only,false);
  IF p_model ? 'optional_weekdays' THEN
    IF jsonb_typeof(p_model->'optional_weekdays') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Ungültige Wochentage'; END IF;
    SELECT array_agg(value::integer ORDER BY value::integer) INTO v_days FROM jsonb_array_elements_text(p_model->'optional_weekdays');
  ELSE v_days:=coalesce(v_model.optional_weekdays,ARRAY[1,2,3,4,5,6,7]); END IF;
  IF v_mode NOT IN ('required','optional') OR v_optional NOT BETWEEN 0 AND 99
    OR (v_mode='optional' AND v_optional<1) OR (v_only AND (v_responsible IS NULL OR (v_mode='optional' AND v_optional>1)))
    OR v_days IS NULL OR cardinality(v_days) NOT BETWEEN 1 AND 7 OR NOT v_days <@ ARRAY[1,2,3,4,5,6,7]
    OR cardinality(v_days)<>(SELECT count(DISTINCT x) FROM unnest(v_days) x) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Ungültige optionale Planungsregel oder Zuständigkeit.';
  END IF;
  IF v_responsible IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.employees WHERE id=v_responsible AND company_id=p_company_id AND status='active' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Der zuständige Mitarbeiter muss im aktuellen Unternehmen aktiv sein.';
  END IF;
  IF v_mode='optional' THEN v_soll:=0; END IF;
  IF p_action='CREATE' THEN
    INSERT INTO public.shift_templates(company_id,code,name,default_start,default_end,css_class,active,sort_order,planning_mode,optional_staffing,responsible_employee_id,responsible_only,optional_weekdays,site_id)
      SELECT p_company_id,upper(v_code),v_name,v_start,v_end,v_color,true,coalesce(max(sort_order),0)+1,v_mode,v_optional,v_responsible,v_only,v_days,v_site
      FROM public.shift_templates WHERE company_id=p_company_id RETURNING * INTO v_model;
  ELSE
    IF (p_action='UPDATE' AND NOT v_model.active) OR (p_action='RESTORE' AND v_model.active) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Der Status wurde inzwischen geändert. Bitte lade die Schichtmodelle neu.';
    END IF;
    UPDATE public.shift_templates SET name=v_name,default_start=v_start,default_end=v_end,css_class=v_color,active=true,planning_mode=v_mode,optional_staffing=v_optional,responsible_employee_id=v_responsible,responsible_only=v_only,optional_weekdays=v_days,site_id=v_site
      WHERE id=v_model.id RETURNING * INTO v_model;
  END IF;
  INSERT INTO public.global_staffing_requirements(company_id,shift_code,required_count)
    VALUES(p_company_id,v_model.code,v_soll)
    ON CONFLICT(company_id,shift_code) DO UPDATE SET required_count=excluded.required_count;
  RETURN jsonb_build_object('model',to_jsonb(v_model),'soll',v_soll);
END $function$;

CREATE OR REPLACE FUNCTION public.manager_list_time_qr_terminals(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if not private.sf_is_manager(p_company_id,false) then raise exception 'Keine Berechtigung'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'name',t.name,'location_note',t.location_note,'site_id',t.site_id,'is_active',t.is_active,
    'start_window_minutes',t.start_window_minutes,'end_window_minutes',t.end_window_minutes,
    'pilot_mode',t.pilot_mode,'pilot_employee_id',t.pilot_employee_id,
    'pilot_employee_ids',coalesce((select jsonb_agg(p.employee_id order by e.last_name,e.first_name,e.personnel_no) from public.time_qr_pilot_employees p join public.employees e on e.id=p.employee_id and e.company_id=p.company_id where p.terminal_id=t.id and p.company_id=t.company_id),'[]'::jsonb),
    'pilot_employee_names',coalesce((select jsonb_agg(btrim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,'')) order by e.last_name,e.first_name,e.personnel_no) from public.time_qr_pilot_employees p join public.employees e on e.id=p.employee_id and e.company_id=p.company_id where p.terminal_id=t.id and p.company_id=t.company_id),'[]'::jsonb),
    'created_at',t.created_at,'updated_at',t.updated_at,'rotated_at',t.rotated_at,'disabled_at',t.disabled_at
  ) order by t.name),'[]'::jsonb) into v_result from public.time_qr_terminals t where t.company_id=p_company_id;
  return v_result;
end;$function$;

