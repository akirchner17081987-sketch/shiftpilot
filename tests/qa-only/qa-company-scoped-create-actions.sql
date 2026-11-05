-- QA ONLY: all actions validate the explicit company and own employee profile.
create function private.qa_swap_candidates_scoped(p_company uuid,p_assignment uuid)
returns table(employee_id uuid,display_name text,employee_role text)
language plpgsql stable security definer set search_path='' as $$
declare emp uuid:=private.qa_employee_identity(p_company);
begin
 if not exists(select 1 from public.shift_assignments a where a.id=p_assignment and a.company_id=p_company and a.employee_id=emp)
 then raise exception 'Schicht nicht gefunden oder nicht berechtigt' using errcode='42501'; end if;
 return query select c.employee_id,c.display_name,c.employee_role from private.employee_list_shift_swap_candidates_impl(p_assignment) c
 join public.employees e on e.id=c.employee_id and e.company_id=p_company
 where e.auth_user_id is not null and e.access_status='ACTIVE' and e.status='active' and e.deleted_at is null
 and not exists(select 1 from public.company_members m where m.company_id=p_company and m.user_id=e.auth_user_id and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING') or 'read_only'=any(m.extra_permissions)));
end $$;
create function private.qa_create_swap_scoped(p_company uuid,p_assignment uuid,p_target uuid,p_reason text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare emp uuid:=private.qa_employee_identity(p_company);
begin
 perform 1 from public.shift_assignments a where a.id=p_assignment and a.company_id=p_company and a.employee_id=emp for update;
 if not found then raise exception 'Schicht nicht gefunden oder nicht berechtigt' using errcode='42501'; end if;
 if not exists(select 1 from public.employees e where e.id=p_target and e.company_id=p_company and e.status='active' and e.access_status='ACTIVE' and e.auth_user_id is not null and e.deleted_at is null and not exists(select 1 from public.company_members m where m.company_id=p_company and m.user_id=e.auth_user_id and (m.status<>'ACTIVE' or m.role in ('VIEWER','TIME_TRACKING') or 'read_only'=any(m.extra_permissions))))
 then raise exception 'Zielprofil nicht verfügbar' using errcode='42501'; end if;
 return private.employee_create_shift_swap_impl(p_assignment,p_target,p_reason);
end $$;
create function private.qa_offer_market_scoped(p_company uuid,p_assignment uuid,p_reason text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare emp uuid:=private.qa_employee_identity(p_company);
begin
 perform 1 from public.shift_assignments a where a.id=p_assignment and a.company_id=p_company and a.employee_id=emp for update;
 if not found then raise exception 'Schicht nicht gefunden oder nicht berechtigt' using errcode='42501'; end if;
 return private.employee_offer_shift_marketplace_impl(p_assignment,p_reason);
end $$;
create function private.qa_claim_market_scoped(p_company uuid,p_offer uuid,p_comment text default '')
returns text language plpgsql security definer set search_path='' as $$
declare emp uuid:=private.qa_employee_identity(p_company);
begin
 perform 1 from public.shift_swap_requests s where s.id=p_offer and s.company_id=p_company for update;
 if not found then raise exception 'Angebot nicht gefunden oder nicht berechtigt' using errcode='42501'; end if;
 return private.employee_claim_shift_marketplace_impl(p_offer,p_comment);
end $$;
revoke all on function private.qa_swap_candidates_scoped(uuid,uuid),private.qa_create_swap_scoped(uuid,uuid,uuid,text),private.qa_offer_market_scoped(uuid,uuid,text),private.qa_claim_market_scoped(uuid,uuid,text) from public,anon;
grant execute on function private.qa_swap_candidates_scoped(uuid,uuid),private.qa_create_swap_scoped(uuid,uuid,uuid,text),private.qa_offer_market_scoped(uuid,uuid,text),private.qa_claim_market_scoped(uuid,uuid,text) to authenticated;
create function public.qa_swap_candidates_scoped(p_company uuid,p_assignment uuid) returns table(employee_id uuid,display_name text,employee_role text) language sql stable set search_path='' as $$select * from private.qa_swap_candidates_scoped(p_company,p_assignment)$$;
create function public.qa_create_swap_scoped(p_company uuid,p_assignment uuid,p_target uuid,p_reason text default '') returns uuid language sql set search_path='' as $$select private.qa_create_swap_scoped(p_company,p_assignment,p_target,p_reason)$$;
create function public.qa_offer_market_scoped(p_company uuid,p_assignment uuid,p_reason text default '') returns uuid language sql set search_path='' as $$select private.qa_offer_market_scoped(p_company,p_assignment,p_reason)$$;
create function public.qa_claim_market_scoped(p_company uuid,p_offer uuid,p_comment text default '') returns text language sql set search_path='' as $$select private.qa_claim_market_scoped(p_company,p_offer,p_comment)$$;
revoke all on function public.qa_swap_candidates_scoped(uuid,uuid),public.qa_create_swap_scoped(uuid,uuid,uuid,text),public.qa_offer_market_scoped(uuid,uuid,text),public.qa_claim_market_scoped(uuid,uuid,text) from public,anon;
grant execute on function public.qa_swap_candidates_scoped(uuid,uuid),public.qa_create_swap_scoped(uuid,uuid,uuid,text),public.qa_offer_market_scoped(uuid,uuid,text),public.qa_claim_market_scoped(uuid,uuid,text) to authenticated;
