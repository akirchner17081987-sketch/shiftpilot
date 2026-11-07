-- Read-only preflight. Verify the project in the dashboard before execution.
-- Results contain aggregate counts and schema definitions, not employee details.
with fingerprints as (
 select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
        md5(pg_get_functiondef(p.oid)) as definition_fingerprint
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname,p.proname) in (
  ('private','sf_employee_id'),('private','sf_confirmed_work_minutes'),
  ('private','sf_guard_personnel_leadership_identity'),('private','sf_normalize_access_profile'),
  ('private','employee_respond_disruption_offer_impl'),('private','employee_list_disruption_offers_impl'),
  ('public','employee_respond_to_shift_change'),('public','apply_shift_change'))
), indexes as (
 select indexname,indexdef from pg_indexes where schemaname='public'
  and tablename='employees' and indexdef ilike '%auth_user_id%'
), latest_migrations as (
 select version,name from supabase_migrations.schema_migrations order by version desc limit 10
)
select jsonb_build_object(
 'linked_profiles',(select count(*) from public.employees where auth_user_id is not null),
 'linked_accounts',(select count(distinct auth_user_id) from public.employees where auth_user_id is not null),
 'duplicate_company_user_pairs',(select count(*) from (select company_id,auth_user_id from public.employees
   where auth_user_id is not null group by company_id,auth_user_id having count(*)>1) d),
 'indexes',(select coalesce(jsonb_agg(to_jsonb(i) order by indexname),'[]'::jsonb) from indexes i),
 'latest_migrations',(select coalesce(jsonb_agg(to_jsonb(m) order by version desc),'[]'::jsonb) from latest_migrations m),
 'function_fingerprints',(select coalesce(jsonb_agg(to_jsonb(f) order by nspname,proname,arguments),'[]'::jsonb) from fingerprints f)
) as preflight;
