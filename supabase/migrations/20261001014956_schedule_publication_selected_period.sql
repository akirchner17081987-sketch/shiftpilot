-- Exact date boundaries and an explicit, authorized tenant. Audit writes retain
-- the existing narrowly scoped private definer pattern.
CREATE OR REPLACE FUNCTION private.publish_schedule_period_impl(p_company_id uuid,p_start_date date,p_end_date date)
RETURNS TABLE(published_at timestamptz,assignment_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_user uuid:=auth.uid(); v_role text; v_tz text; v_now timestamptz:=now(); v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date<p_start_date OR p_end_date-p_start_date>30 THEN
    RAISE EXCEPTION 'Select a valid publication period of at most 31 days';
  END IF;
  SELECT cm.role,coalesce(c.timezone,'Europe/Berlin') INTO v_role,v_tz
  FROM public.company_members cm JOIN public.companies c ON c.id=cm.company_id
  WHERE cm.company_id=p_company_id AND cm.user_id=v_user AND cm.status='ACTIVE'
    AND cm.role IN ('OWNER','ADMIN','DISPATCHER','PLANNER') FOR SHARE OF cm;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Not authorized to publish this company schedule'; END IF;

  UPDATE public.shift_assignments s SET status='PUBLISHED',published_at=coalesce(s.published_at,v_now)
  WHERE s.company_id=p_company_id AND s.status='DRAFT'
    AND s.starts_at >= p_start_date::timestamp AT TIME ZONE v_tz
    AND s.starts_at < (p_end_date+1)::timestamp AT TIME ZONE v_tz;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  -- A boundary week must not mark neighboring dates as published. Individual
  -- published_at flags protect the released shifts in those partial weeks.
  INSERT INTO public.plan_publications(company_id,week_start,published_at,published_by)
  SELECT p_company_id,d::date,v_now,v_user
  FROM pg_catalog.generate_series(p_start_date::timestamp,p_end_date::timestamp,interval '1 day') d
  WHERE extract(isodow FROM d)=1 AND d::date+6<=p_end_date
  ON CONFLICT(company_id,week_start) DO UPDATE SET published_at=excluded.published_at,published_by=excluded.published_by;
  INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
  VALUES(p_company_id,'PLAN_PUBLISHED','plan_publication',NULL,v_user,v_role,
    pg_catalog.jsonb_build_object('start_date',p_start_date,'end_date',p_end_date,'assignment_count',v_count,'source','server_rpc'));
  RETURN QUERY SELECT v_now,v_count;
END;
$$;
REVOKE ALL ON FUNCTION private.publish_schedule_period_impl(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.publish_schedule_period_impl(uuid,date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.publish_schedule_period(p_company_id uuid,p_start_date date,p_end_date date)
RETURNS TABLE(published_at timestamptz,assignment_count integer)
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT * FROM private.publish_schedule_period_impl(p_company_id,p_start_date,p_end_date) $$;
REVOKE ALL ON FUNCTION public.publish_schedule_period(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_schedule_period(uuid,date,date) TO authenticated;
