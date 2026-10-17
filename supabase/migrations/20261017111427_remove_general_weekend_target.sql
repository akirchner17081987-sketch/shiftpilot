-- No additional weekend target for the operational company. OT weekdays and all fixed rhythms remain intact.
SELECT set_config('sf.planning_rule_change_reason','Freie Wochenenden nur für OT1/OT2/OT3 planmäßig; alle anderen nach Rhythmus und Bedarf, ohne zusätzliches Wochenendziel.',true);
UPDATE public.company_compliance_policy p
SET solid_planning_rules=p.solid_planning_rules||jsonb_build_object('weekendPlanningByRhythm',true,'minFreeWeekendsPerMonth',0),updated_at=now()
FROM public.companies c
WHERE c.id=p.company_id AND c.name IN('SchichtFunk','Secontec Services')
 AND coalesce((p.solid_planning_rules->>'enabled')::boolean,false)
 AND coalesce((p.solid_planning_rules->>'confirmedRulesVersion')::int,0)>=2;
