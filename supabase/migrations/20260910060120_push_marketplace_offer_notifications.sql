create or replace function private.sf_notify_shift_swap()
returns trigger
language plpgsql
security definer
set search_path = 'public','private','pg_temp'
as $$
declare
  v_original_user uuid;
  v_target_user uuid;
  v_original_name text;
  v_target_name text;
  v_tz text;
  v_when text;
  a public.shift_assignments%rowtype;
  r record;
begin
  select e.auth_user_id,trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,''))
    into v_original_user,v_original_name
  from public.employees e where e.id=new.original_employee_id;

  select e.auth_user_id,trim(coalesce(e.first_name,'')||' '||coalesce(e.last_name,''))
    into v_target_user,v_target_name
  from public.employees e where e.id=new.target_employee_id;

  select * into a from public.shift_assignments where id=new.assignment_id;
  select coalesce(c.timezone,'Europe/Berlin') into v_tz from public.companies c where c.id=new.company_id;
  if a.id is not null then
    v_when:=to_char(a.starts_at at time zone coalesce(v_tz,'Europe/Berlin'),'DD.MM.YYYY HH24:MI');
  else
    v_when:='veröffentlichte Schicht';
  end if;

  if tg_op='INSERT' and new.status='MARKET_OPEN' then
    for r in
      select e.id as employee_id,e.auth_user_id
      from public.employees e
      where e.company_id=new.company_id
        and e.status='active'
        and e.access_status='ACTIVE'
        and e.auth_user_id is not null
        and e.id<>new.original_employee_id
        and a.id is not null
        and private.sf_swap_candidate_reason(a.id,e.id) is null
    loop
      perform private.sf_put_notification(
        new.company_id,r.auth_user_id,r.employee_id,
        'SHIFT_MARKETPLACE_OFFER','Neue Schicht im Marktplatz',
        coalesce(nullif(v_original_name,''),'Ein Kollege')||' bietet '||coalesce(a.shift_code,'eine Schicht')||' am '||v_when||' an.',
        'employee-marketplace','shift_swap_request',new.id,
        jsonb_build_object('swapId',new.id,'assignmentId',new.assignment_id,'shiftCode',a.shift_code,'startsAt',a.starts_at,'endsAt',a.ends_at)
      );
    end loop;

  elsif tg_op='INSERT' and new.status='PENDING_COLLEAGUE' then
    perform private.sf_put_notification(new.company_id,v_target_user,new.target_employee_id,'SHIFT_SWAP_COLLEAGUE','Schichttausch-Anfrage',coalesce(nullif(v_original_name,''),'Ein Kollege')||' möchte dir '||coalesce(a.shift_code,'eine Schicht')||' am '||v_when||' übertragen.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id,'assignmentId',new.assignment_id));

  elsif tg_op='UPDATE' and old.status is distinct from new.status then
    if new.status='PENDING_MANAGER' then
      perform private.sf_put_notification(new.company_id,v_original_user,new.original_employee_id,'SHIFT_SWAP_COLLEAGUE_ACCEPTED','Schichttausch angenommen',coalesce(nullif(v_target_name,''),'Der Kollege')||' hat den Tausch angenommen. Die Disposition muss noch freigeben.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id));
      perform private.sf_notify_managers(new.company_id,'SHIFT_SWAP_MANAGER','Schichttausch wartet auf Freigabe',coalesce(nullif(v_original_name,''),'Mitarbeiter')||' → '||coalesce(nullif(v_target_name,''),'Mitarbeiter')||' · '||coalesce(a.shift_code,'Schicht')||' · '||v_when||'.','schedule','shift_swap_request',new.id,jsonb_build_object('swapId',new.id,'assignmentId',new.assignment_id));
    elsif new.status='REJECTED_COLLEAGUE' then
      perform private.sf_put_notification(new.company_id,v_original_user,new.original_employee_id,'SHIFT_SWAP_REJECTED','Schichttausch abgelehnt',coalesce(nullif(v_target_name,''),'Der Kollege')||' hat deine Tauschanfrage abgelehnt.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id));
    elsif new.status='REJECTED_MANAGER' then
      perform private.sf_put_notification(new.company_id,v_original_user,new.original_employee_id,'SHIFT_SWAP_MANAGER_REJECTED','Schichttausch nicht freigegeben','Die Disposition hat den Schichttausch nicht freigegeben.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id,'comment',new.manager_comment));
      perform private.sf_put_notification(new.company_id,v_target_user,new.target_employee_id,'SHIFT_SWAP_MANAGER_REJECTED','Schichttausch nicht freigegeben','Die Disposition hat den Schichttausch nicht freigegeben.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id,'comment',new.manager_comment));
    elsif new.status='APPLIED' then
      perform private.sf_put_notification(new.company_id,v_original_user,new.original_employee_id,'SHIFT_SWAP_APPLIED','Schichttausch freigegeben','Deine Schicht wurde erfolgreich an '||coalesce(nullif(v_target_name,''),'den Kollegen')||' übertragen.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id,'assignmentId',new.assignment_id));
      perform private.sf_put_notification(new.company_id,v_target_user,new.target_employee_id,'SHIFT_SWAP_APPLIED','Neue Schicht durch Tausch','Der Schichttausch wurde freigegeben. Die Schicht '||coalesce(a.shift_code,'')||' am '||v_when||' ist jetzt dir zugeordnet.','employee-shifts','shift_swap_request',new.id,jsonb_build_object('swapId',new.id,'assignmentId',new.assignment_id));
    elsif new.status='CANCELLED' then
      perform private.sf_put_notification(new.company_id,v_target_user,new.target_employee_id,'SHIFT_SWAP_CANCELLED','Schichttausch zurückgezogen',coalesce(nullif(v_original_name,''),'Der Mitarbeiter')||' hat die Tauschanfrage zurückgezogen.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id));
    elsif new.status='SUPERSEDED' then
      perform private.sf_put_notification(new.company_id,v_original_user,new.original_employee_id,'SHIFT_SWAP_SUPERSEDED','Schichttausch nicht mehr möglich','Die Schicht oder Verfügbarkeit hat sich geändert. Der Tausch wurde beendet.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id));
      perform private.sf_put_notification(new.company_id,v_target_user,new.target_employee_id,'SHIFT_SWAP_SUPERSEDED','Schichttausch nicht mehr möglich','Die Schicht oder Verfügbarkeit hat sich geändert. Der Tausch wurde beendet.','employee-swaps','shift_swap_request',new.id,jsonb_build_object('swapId',new.id));
    end if;
  end if;
  return new;
end
$$;;
