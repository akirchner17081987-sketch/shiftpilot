create or replace function private.enforce_closed_month_absence()
returns trigger
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
begin
  if tg_op in ('UPDATE','DELETE') and private.time_month_overlap_closed(old.company_id,old.start_date,old.end_date) then
    raise exception 'Abwesenheit berührt einen abgeschlossenen Monat und ist gesperrt.';
  end if;
  if tg_op in ('INSERT','UPDATE') and private.time_month_overlap_closed(new.company_id,new.start_date,new.end_date) then
    raise exception 'Für einen abgeschlossenen Monat können keine Abwesenheiten mehr angelegt oder geändert werden.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.enforce_closed_month_time_account_settings()
returns trigger
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare v_company uuid:=coalesce(new.company_id,old.company_id);
begin
  if exists(select 1 from public.time_month_closures c where c.company_id=v_company and c.status='CLOSED') then
    raise exception 'Stundenkonto-Einstellungen sind gesperrt, solange abgeschlossene Monate existieren. Öffne den betroffenen Monatsabschluss zuerst wieder.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_closed_month_time_account_settings() from public,anon,authenticated;

drop trigger if exists trg_time_account_settings_closed_month on public.time_account_settings;
create trigger trg_time_account_settings_closed_month
before insert or update or delete on public.time_account_settings
for each row execute function private.enforce_closed_month_time_account_settings();

create or replace function private.opening_affects_closed_month(p_company_id uuid,p_effective_date date)
returns boolean
language sql
stable
security definer
set search_path='public','private','pg_temp'
as $$
  select exists(
    select 1 from public.time_month_closures c
    where c.company_id=p_company_id and c.status='CLOSED'
      and (c.month_start + interval '1 month - 1 day')::date >= p_effective_date
  );
$$;
revoke all on function private.opening_affects_closed_month(uuid,date) from public,anon;

create or replace function private.enforce_closed_month_time_account_opening()
returns trigger
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
begin
  if tg_op in ('UPDATE','DELETE') and private.opening_affects_closed_month(old.company_id,old.effective_date) then
    raise exception 'Der Startsaldo beeinflusst einen abgeschlossenen Monat und ist gesperrt.';
  end if;
  if tg_op in ('INSERT','UPDATE') and private.opening_affects_closed_month(new.company_id,new.effective_date) then
    raise exception 'Der Startsaldo würde einen abgeschlossenen Monat beeinflussen. Öffne den Monatsabschluss zuerst wieder.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_closed_month_time_account_opening() from public,anon,authenticated;

drop trigger if exists trg_time_account_openings_closed_month on public.employee_time_account_openings;
create trigger trg_time_account_openings_closed_month
before insert or update or delete on public.employee_time_account_openings
for each row execute function private.enforce_closed_month_time_account_opening();;
