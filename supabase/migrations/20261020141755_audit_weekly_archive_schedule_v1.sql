create function private.sf_weekly_audit_archives(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
declare company_ record; to_ timestamptz; from_ timestamptz; count_ integer:=0;
begin
 -- Two UTC candidates cover DST, but only the Berlin 03:00 candidate performs work.
 if extract(isodow from p_now at time zone 'Europe/Berlin')<>1 or extract(hour from p_now at time zone 'Europe/Berlin')<>3 then return 0; end if;
 to_:=date_trunc('week',p_now at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
 from_:=(date_trunc('week',p_now at time zone 'Europe/Berlin')-interval '7 days') at time zone 'Europe/Berlin';
 for company_ in select id from public.companies loop
  perform private.sf_build_audit_archive(company_.id,from_,to_,'WEEKLY');count_:=count_+1;
 end loop;
 return count_;
end $$;
revoke all on function private.sf_weekly_audit_archives(timestamptz) from public,anon,authenticated,service_role;
select cron.schedule('schichtfunk-weekly-audit-archives','0 1,2 * * 1','select private.sf_weekly_audit_archives();');
notify pgrst,'reload schema';
