-- Only Secontec Services - 9h opts into the additional TL shift rotation.
-- Shift permissions remain the hard boundary for OT-only employees and 115.
update public.company_compliance_policy p
set solid_planning_rules=jsonb_set(
  coalesce(p.solid_planning_rules,'{}'::jsonb),
  '{teamLeaderShiftBalance}',
  '{"enabled":true}'::jsonb,
  true
),updated_at=now()
from public.companies c
where c.id=p.company_id
  and c.name='Secontec Services - 9h'
  and exists (
    select 1 from public.employees e
    where e.company_id=c.id and e.personnel_no='115'
      and e.deleted_at is null and e.shift_permissions=array['O3']::text[]
  );
