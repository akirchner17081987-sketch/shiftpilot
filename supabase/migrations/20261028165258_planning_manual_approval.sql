-- All autonomous runs remain proposals until a planner explicitly applies them.
-- Bump revisions so an already running job cannot use its former DRAFT setting.
update private.autonomous_planning_settings
set mode = 'PREVIEW', revision = revision + 1, updated_at = now()
where mode = 'DRAFT';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'private.autonomous_planning_settings'::regclass and conname = 'autonomous_planning_requires_manual_approval') then
    alter table private.autonomous_planning_settings
      add constraint autonomous_planning_requires_manual_approval check (mode = 'PREVIEW');
  end if;
end $$;
