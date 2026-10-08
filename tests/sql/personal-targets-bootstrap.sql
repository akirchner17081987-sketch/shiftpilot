-- Fictitious PostgreSQL fixture for target calculations. Work/absence helpers return zero because these tests exercise SOLL only.
\ir employee-erasure-bootstrap.sql
ALTER TABLE time_account_settings RENAME CONSTRAINT fixture_constraint_63 TO time_account_settings_target_method_check;

CREATE FUNCTION private.sf_public_holidays(integer,text) RETURNS TABLE(holiday_date date,name text) LANGUAGE sql AS $$SELECT make_date($1,1,1),'Neujahr'::text$$;
CREATE FUNCTION private.german_holiday_name(date,text) RETURNS text LANGUAGE sql AS $$SELECT CASE WHEN extract(month from $1)=1 AND extract(day from $1)=1 THEN 'Neujahr' END$$;
CREATE FUNCTION private.german_public_holidays(integer,text) RETURNS TABLE(holiday_date date,holiday_name text,holiday_scope text) LANGUAGE sql AS $$SELECT make_date($1,1,1),'Neujahr'::text,'federal'::text$$;
CREATE FUNCTION private.sf_confirmed_work_minutes(uuid,date,date) RETURNS integer LANGUAGE sql AS $$SELECT 0$$;
CREATE FUNCTION private.sf_absence_credit_minutes(uuid,date,date,text[],integer,text) RETURNS integer LANGUAGE sql AS $$SELECT 0$$;
CREATE FUNCTION private.sf_month_meta(values_ text[],key_ text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT substring(q FROM length('__sp:'||key_||'=')+1) FROM unnest(values_) q WHERE starts_with(q,'__sp:'||key_||'=') LIMIT 1$$;

CREATE OR REPLACE FUNCTION private.sf_target_minutes(p_weekly_hours numeric, p_from date, p_to date, p_state text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(round(count(*) * greatest(coalesce(p_weekly_hours,0),0) * 60 / 5.0),0)::integer
  from generate_series(p_from,p_to,interval '1 day') g(day)
  where extract(isodow from g.day) between 1 and 5
    and not exists (
      select 1 from private.sf_public_holidays(extract(year from g.day)::integer,p_state) h
      where h.holiday_date=g.day::date
    );
$function$
;
;
