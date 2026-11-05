-- QA ONLY: guard object-based actions with the selected employee and company.
create function private.qa_cancel_swap_scoped(p_company uuid,p_swap uuid) returns text
language plpgsql security definer set search_path='' as $$
declare emp uuid:=private.qa_employee_identity(p_company);
begin
 perform 1 from public.shift_swap_requests s where s.id=p_swap and s.company_id=p_company and s.original_employee_id=emp for update;
 if not found then raise exception 'Tauschanfrage nicht gefunden oder nicht berechtigt' using errcode='42501'; end if;
 return private.employee_cancel_shift_swap_impl(p_swap);
end $$;
create function private.qa_respond_swap_scoped(p_company uuid,p_swap uuid,p_decision text,p_comment text default '') returns text
language plpgsql security definer set search_path='' as $$
declare emp uuid:=private.qa_employee_identity(p_company);
begin
 perform 1 from public.shift_swap_requests s where s.id=p_swap and s.company_id=p_company and s.target_employee_id=emp for update;
 if not found then raise exception 'Tauschanfrage nicht gefunden oder nicht berechtigt' using errcode='42501'; end if;
 return private.employee_respond_shift_swap_impl(p_swap,p_decision,p_comment);
end $$;
create function private.qa_respond_offer_scoped(p_company uuid,p_offer uuid,p_decision text,p_comment text default '')
returns table(status text,message text,assignment_id uuid) language plpgsql security definer set search_path='' as $$
declare emp uuid:=private.qa_employee_identity(p_company);
begin
 -- Lock order matches the original function: incident first, then offer.
 perform 1 from public.disruption_incidents i where i.id=(select o.incident_id from public.disruption_offers o where o.id=p_offer and o.company_id=p_company and o.employee_id=emp) and i.company_id=p_company for update;
 if not found then raise exception 'Angebot nicht gefunden oder nicht berechtigt' using errcode='42501'; end if;
 perform 1 from public.disruption_offers o where o.id=p_offer and o.company_id=p_company and o.employee_id=emp for update;
 if not found then raise exception 'Angebot nicht gefunden oder nicht berechtigt' using errcode='42501'; end if;
 return query select * from private.employee_respond_disruption_offer_impl(p_offer,p_decision,p_comment);
end $$;
revoke all on function private.qa_cancel_swap_scoped(uuid,uuid) from public,anon;
revoke all on function private.qa_respond_swap_scoped(uuid,uuid,text,text) from public,anon;
revoke all on function private.qa_respond_offer_scoped(uuid,uuid,text,text) from public,anon;
grant execute on function private.qa_cancel_swap_scoped(uuid,uuid) to authenticated;
grant execute on function private.qa_respond_swap_scoped(uuid,uuid,text,text) to authenticated;
grant execute on function private.qa_respond_offer_scoped(uuid,uuid,text,text) to authenticated;
create function public.qa_cancel_swap_scoped(p_company uuid,p_swap uuid) returns text language sql set search_path='' as $$select private.qa_cancel_swap_scoped(p_company,p_swap)$$;
create function public.qa_respond_swap_scoped(p_company uuid,p_swap uuid,p_decision text,p_comment text default '') returns text language sql set search_path='' as $$select private.qa_respond_swap_scoped(p_company,p_swap,p_decision,p_comment)$$;
create function public.qa_respond_offer_scoped(p_company uuid,p_offer uuid,p_decision text,p_comment text default '') returns table(status text,message text,assignment_id uuid) language sql set search_path='' as $$select * from private.qa_respond_offer_scoped(p_company,p_offer,p_decision,p_comment)$$;
revoke all on function public.qa_cancel_swap_scoped(uuid,uuid) from public,anon;
revoke all on function public.qa_respond_swap_scoped(uuid,uuid,text,text) from public,anon;
revoke all on function public.qa_respond_offer_scoped(uuid,uuid,text,text) from public,anon;
grant execute on function public.qa_cancel_swap_scoped(uuid,uuid) to authenticated;
grant execute on function public.qa_respond_swap_scoped(uuid,uuid,text,text) to authenticated;
grant execute on function public.qa_respond_offer_scoped(uuid,uuid,text,text) to authenticated;

