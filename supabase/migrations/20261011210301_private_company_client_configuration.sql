-- Internal display assignments and operational help are never static assets.
create table if not exists private.company_client_configuration (
 company_id uuid primary key references public.companies(id) on delete cascade,
 configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
 updated_at timestamptz not null default now()
);
alter table private.company_client_configuration enable row level security;
revoke all on private.company_client_configuration from public, anon, authenticated;
grant select on private.company_client_configuration to authenticated;
create policy company_client_configuration_read
 on private.company_client_configuration for select to authenticated
 using ((select private.sf_company_profile_can_read(company_id)));

create or replace function public.company_private_client_configuration(p_company_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $function$
begin
 if auth.uid() is null or not private.sf_company_profile_can_read(p_company_id) then
  raise exception using errcode = '42501', message = 'Unternehmenszugriff verweigert';
 end if;
 if private.sf_is_manager(p_company_id, true) then
  perform private.sf_assert_aal2('company_private_client_configuration');
 end if;
 return coalesce((select c.configuration from private.company_client_configuration c
                  where c.company_id = p_company_id), '{}'::jsonb);
end;
$function$;
revoke all on function public.company_private_client_configuration(uuid) from public, anon;
grant execute on function public.company_private_client_configuration(uuid) to authenticated;

-- Provision company-specific values through a trusted, authenticated administration channel.
-- Never commit personnel assignments or operational configuration values to source control.
