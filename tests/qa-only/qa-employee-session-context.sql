-- QA ONLY: selected company is bound to the verified auth session, not a global user setting.
create table private.qa_employee_session_context (
 session_id uuid primary key references auth.sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 company_id uuid not null references public.companies(id),
 updated_at timestamptz not null default now()
);
alter table private.qa_employee_session_context enable row level security;
revoke all on private.qa_employee_session_context from public,anon,authenticated;

create function private.qa_session_id() returns uuid language plpgsql stable security definer set search_path='' as $$
declare sid uuid; uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Nicht angemeldet' using errcode='42501'; end if;
 begin sid:=(auth.jwt()->>'session_id')::uuid; exception when invalid_text_representation then raise exception 'Ungültige Sitzung' using errcode='42501'; end;
 if sid is null or not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=uid and (s.not_after is null or s.not_after>now()))
 then raise exception 'Sitzung nicht verfügbar' using errcode='42501'; end if;
 return sid;
end $$;

create function private.qa_set_employee_session_company(p_company uuid) returns void
language plpgsql security definer set search_path='' as $$
declare sid uuid:=private.qa_session_id();
begin
 perform private.qa_employee_identity(p_company);
 insert into private.qa_employee_session_context(session_id,user_id,company_id) values(sid,auth.uid(),p_company)
 on conflict(session_id) do update set company_id=excluded.company_id,updated_at=now()
 where private.qa_employee_session_context.user_id=excluded.user_id;
 if not found then raise exception 'Sitzung gehört einem anderen Konto' using errcode='42501'; end if;
end $$;

create function private.qa_get_employee_session_company() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=private.qa_session_id(); result uuid;
begin
 select c.company_id into result from private.qa_employee_session_context c where c.session_id=sid and c.user_id=auth.uid();
 if result is null then return null; end if;
 perform private.qa_employee_identity(result);
 return result;
end $$;

revoke all on function private.qa_session_id(),private.qa_set_employee_session_company(uuid),private.qa_get_employee_session_company() from public,anon;
grant execute on function private.qa_set_employee_session_company(uuid),private.qa_get_employee_session_company() to authenticated;
create function public.qa_set_employee_session_company(p_company uuid) returns void language sql set search_path='' as $$select private.qa_set_employee_session_company(p_company)$$;
create function public.qa_get_employee_session_company() returns uuid language sql stable set search_path='' as $$select private.qa_get_employee_session_company()$$;
revoke all on function public.qa_set_employee_session_company(uuid),public.qa_get_employee_session_company() from public,anon;
grant execute on function public.qa_set_employee_session_company(uuid),public.qa_get_employee_session_company() to authenticated;
