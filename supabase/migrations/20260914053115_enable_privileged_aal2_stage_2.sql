-- Explicitly approved production rollout: require AAL2 for the four stage-2
-- user and permission management RPCs. Later stages remain disabled.

update private.sf_mfa_protected_rpcs
set enabled = true,
    updated_at = now()
where rollout_stage = 2;

do $$
declare
  v_enabled_stage_2 integer;
  v_enabled_later_stages integer;
begin
  select count(*)
  into v_enabled_stage_2
  from private.sf_mfa_protected_rpcs
  where rollout_stage = 2
    and enabled;

  select count(*)
  into v_enabled_later_stages
  from private.sf_mfa_protected_rpcs
  where rollout_stage between 3 and 5
    and enabled;

  if v_enabled_stage_2 <> 4 then
    raise exception 'Expected exactly 4 enabled stage-2 RPCs, found %',
      v_enabled_stage_2;
  end if;

  if v_enabled_later_stages <> 0 then
    raise exception 'Later AAL2 stages must remain disabled; found % enabled RPCs',
      v_enabled_later_stages;
  end if;
end;
$$;
