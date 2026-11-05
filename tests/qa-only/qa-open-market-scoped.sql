-- QA ONLY: retain existing market rules while explicitly selecting the employee company.
CREATE OR REPLACE FUNCTION private.sf_open_market_api(p_action text, p_company uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid(); role_name text; emp public.employees%rowtype; o public.open_shift_market_offers%rowtype; cl public.open_shift_market_claims%rowtype;
 company uuid:=p_company; ctx jsonb; row_data jsonb; out_rows jsonb:='[]'; item jsonb; oid uuid; claim_id uuid; asg uuid; change_id uuid;
 n integer; total integer:=0; groups integer:=0; reason text; warning text; decision text; tz text; info jsonb;
BEGIN
 IF uid IS NULL OR private.sf_has_time_only_login() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='F�r diesen Zugang ist der Schicht-Marktplatz nicht freigegeben.'; END IF;
 IF p_action LIKE 'employee_%' THEN
  IF p_company IS NOT NULL THEN
   SELECT * INTO emp FROM public.employees WHERE id=private.qa_employee_identity(p_company);
  ELSE
  SELECT * INTO emp FROM public.employees WHERE auth_user_id=uid AND status='active' AND access_status='ACTIVE' AND deleted_at IS NULL ORDER BY id LIMIT 1;
  END IF;
  IF emp.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Kein aktiver Mitarbeiterzugang'; END IF;
  PERFORM private.qa_employee_identity(emp.company_id);
  company:=emp.company_id;role_name:='EMPLOYEE';
 ELSE
  IF p_action IN ('review','cancel_offer') THEN
   IF p_action='review' THEN SELECT c.company_id INTO company FROM public.open_shift_market_claims c WHERE c.id=(p_data->>'id')::uuid;
   ELSE SELECT f.company_id INTO company FROM public.open_shift_market_offers f WHERE f.id=(p_data->>'id')::uuid; END IF;
  END IF;
  SELECT m.role INTO role_name FROM public.company_members m WHERE m.company_id=company AND m.user_id=uid AND m.status='ACTIVE' AND m.role IN ('OWNER','ADMIN','PLANNER','DISPATCHER') LIMIT 1;
  IF role_name IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Keine aktiven Planungsrechte f�r dieses Unternehmen'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('open-market:'||company::text,0));
 -- Reconcile current demand. Completed offers never reopen without planner confirmation.
 FOR o IN SELECT * FROM public.open_shift_market_offers WHERE company_id=company AND status='MARKET_OPEN' ORDER BY id FOR UPDATE LOOP
  ctx:=private.sf_open_market_slot(company,o.work_date,o.shift_code);
  IF o.starts_at<=now() OR (ctx->>'missing')::integer=0 OR o.remaining_count=0 OR o.starts_at IS DISTINCT FROM (ctx->>'starts_at')::timestamptz OR o.ends_at IS DISTINCT FROM (ctx->>'ends_at')::timestamptz OR private.time_month_is_closed(company,o.work_date) THEN
   UPDATE public.open_shift_market_offers SET status=CASE WHEN (ctx->>'missing')::integer=0 OR remaining_count=0 THEN 'FILLED' ELSE 'SUPERSEDED' END,remaining_count=0,updated_at=now() WHERE id=o.id;
   UPDATE public.open_shift_market_claims SET status='SUPERSEDED',reviewed_at=now() WHERE offer_id=o.id AND status='PENDING_MANAGER';
  ELSE UPDATE public.open_shift_market_offers SET remaining_count=least(remaining_count,(ctx->>'missing')::integer) WHERE id=o.id; END IF;
 END LOOP;
 IF p_action='publish' THEN
  IF jsonb_typeof(p_data->'slots') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'slots') NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Bitte offene Pl�tze ausw�hlen'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'slots') s GROUP BY s->>'date',s->>'type' HAVING count(*)>1) THEN RAISE EXCEPTION 'Doppelte Auswahl f�r denselben Dienst'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->'slots') LOOP
   ctx:=private.sf_open_market_slot(company,(item->>'date')::date,item->>'type');
   n:=least((item->>'count')::integer,(ctx->>'missing')::integer);
   IF coalesce(n,0)<1 OR (ctx->>'starts_at')::timestamptz<=now() THEN CONTINUE; END IF;
   IF private.time_month_is_closed(company,(item->>'date')::date) THEN RAISE EXCEPTION 'Der Planungsmonat ist abgeschlossen'; END IF;
   SELECT id INTO oid FROM public.open_shift_market_offers WHERE company_id=company AND work_date=(item->>'date')::date AND shift_code=item->>'type' AND status='MARKET_OPEN';
   IF oid IS NULL THEN
    INSERT INTO public.open_shift_market_offers(company_id,work_date,shift_code,starts_at,ends_at,remaining_count,reason,created_by) VALUES(company,(item->>'date')::date,item->>'type',(ctx->>'starts_at')::timestamptz,(ctx->>'ends_at')::timestamptz,n,left(coalesce(p_data->>'note',''),1000),uid) RETURNING id INTO oid;
   ELSE
    UPDATE public.open_shift_market_offers SET remaining_count=greatest(remaining_count,n),reason=left(coalesce(p_data->>'note',''),1000),updated_at=now() WHERE id=oid;
   END IF;
   total:=total+n;groups:=groups+1;
  END LOOP;
  IF groups=0 THEN RAISE EXCEPTION 'Keine ver�ffentlichbaren offenen Pl�tze mehr vorhanden'; END IF;
  info:=jsonb_build_object('published_positions',total,'offer_count',groups);
 ELSIF p_action='employee_claim' THEN
  SELECT * INTO o FROM public.open_shift_market_offers WHERE id=(p_data->>'id')::uuid AND company_id=company FOR UPDATE;
  reason:=private.sf_open_market_candidate(o.id,emp.id);
  IF reason IS NOT NULL THEN RAISE EXCEPTION '%',reason; END IF;
  IF EXISTS(SELECT 1 FROM public.open_shift_market_claims WHERE offer_id=o.id AND employee_id=emp.id AND status IN ('PENDING_MANAGER','APPLIED')) THEN RAISE EXCEPTION 'F�r diesen Dienst liegt bereits eine �bernahme vor'; END IF;
  warning:=private.sf_open_market_rhythm(emp.id,o.work_date,o.shift_code);
  INSERT INTO public.open_shift_market_claims(offer_id,company_id,employee_id,comment,requested_by,rhythm_warning) VALUES(o.id,company,emp.id,left(coalesce(p_data->>'note',''),1000),uid,warning) RETURNING id INTO claim_id;
  info:=jsonb_build_object('status','PENDING_MANAGER','id',claim_id);
 ELSIF p_action='review' THEN
  SELECT * INTO cl FROM public.open_shift_market_claims WHERE id=(p_data->>'id')::uuid AND company_id=company FOR UPDATE;
  IF cl.status IS DISTINCT FROM 'PENDING_MANAGER' THEN RETURN jsonb_build_object('status',coalesce(cl.status,'SUPERSEDED'),'message','Diese Anfrage wartet nicht mehr auf Freigabe.'); END IF;
  SELECT * INTO o FROM public.open_shift_market_offers WHERE id=cl.offer_id AND company_id=company FOR UPDATE;
  decision:=upper(p_data->>'decision');
  IF decision NOT IN ('APPROVE','REJECT') OR decision IS NULL THEN RAISE EXCEPTION 'Ung�ltige Entscheidung'; END IF;
  IF decision='REJECT' THEN
   UPDATE public.open_shift_market_claims SET status='REJECTED_MANAGER',manager_comment=left(coalesce(p_data->>'note',''),1000),reviewed_by=uid,reviewed_at=now() WHERE id=cl.id;
   info:=jsonb_build_object('status','REJECTED_MANAGER','message','�bernahme abgelehnt. Der Platz bleibt verf�gbar.');
  ELSE
   PERFORM 1 FROM public.employees WHERE id=cl.employee_id FOR UPDATE;
   reason:=private.sf_open_market_candidate(o.id,cl.employee_id);
   IF reason IS NOT NULL THEN
    UPDATE public.open_shift_market_claims SET status='SUPERSEDED',manager_comment=reason,reviewed_by=uid,reviewed_at=now() WHERE id=cl.id;
    RETURN jsonb_build_object('status','SUPERSEDED','message',reason);
   END IF;
   warning:=private.sf_open_market_rhythm(cl.employee_id,o.work_date,o.shift_code);
   IF warning<>'' AND NOT coalesce((p_data->>'accept_rhythm')::boolean,false) THEN RAISE EXCEPTION 'Rhythmusabweichung bitte ausdr�cklich best�tigen: %',warning; END IF;
   row_data:=jsonb_build_object('employeeId',cl.employee_id,'type',o.shift_code,'startsAt',o.starts_at,'endsAt',o.ends_at,'breakMinutes',0,'note','�bernahme aus dem Schicht-Marktplatz');
   INSERT INTO public.shift_change_requests(company_id,action,employee_id,old_snapshot,proposed_snapshot,reason_code,reason_text,predictable,notice_minutes,compliance_status,status,requires_employee_approval,requires_works_council,requested_by)
    VALUES(company,'CREATE',cl.employee_id,NULL,row_data,'Marktplatz',left('Freiwillige �bernahme #'||cl.id||CASE WHEN warning<>'' THEN ' � '||warning ELSE '' END,2000),'YES',greatest(0,floor(extract(epoch FROM(o.starts_at-now()))/60))::integer,'GREEN','READY_TO_APPLY',false,false,uid) RETURNING id INTO change_id;
   asg:=public.apply_shift_change(change_id);
   UPDATE public.open_shift_market_claims SET status='APPLIED',assignment_id=asg,rhythm_warning=warning,manager_comment=left(coalesce(p_data->>'note',''),1000),reviewed_by=uid,reviewed_at=now() WHERE id=cl.id;
   UPDATE public.open_shift_market_offers SET remaining_count=remaining_count-1,status=CASE WHEN remaining_count<=1 THEN 'FILLED' ELSE 'MARKET_OPEN' END,updated_at=now() WHERE id=o.id;
   ctx:=private.sf_open_market_slot(company,o.work_date,o.shift_code);
   IF (ctx->>'missing')::integer=0 OR o.remaining_count<=1 THEN
    UPDATE public.open_shift_market_offers SET remaining_count=0,status='FILLED' WHERE id=o.id;
    UPDATE public.open_shift_market_claims SET status='SUPERSEDED',reviewed_at=now() WHERE offer_id=o.id AND status='PENDING_MANAGER';
   END IF;
   info:=jsonb_build_object('status','APPLIED','assignment_id',asg,'message','�bernahme freigegeben und verbindlich im Dienstplan eingetragen.');
  END IF;
 ELSIF p_action='cancel_offer' THEN
  SELECT * INTO o FROM public.open_shift_market_offers WHERE id=(p_data->>'id')::uuid AND company_id=company FOR UPDATE;
  UPDATE public.open_shift_market_offers SET status='CANCELLED',remaining_count=0,updated_at=now() WHERE id=o.id AND status='MARKET_OPEN';
  UPDATE public.open_shift_market_claims SET status='SUPERSEDED',reviewed_at=now() WHERE offer_id=o.id AND status='PENDING_MANAGER';
  info:=jsonb_build_object('status','CANCELLED');
 ELSIF p_action='employee_cancel' THEN
  UPDATE public.open_shift_market_claims SET status='CANCELLED',reviewed_at=now() WHERE id=(p_data->>'id')::uuid AND company_id=company AND employee_id=emp.id AND status='PENDING_MANAGER';
  IF NOT FOUND THEN RAISE EXCEPTION 'Diese Anfrage kann nicht zur�ckgezogen werden'; END IF;
  info:=jsonb_build_object('status','CANCELLED');
 ELSIF p_action IN ('manager_list','employee_list') THEN
  FOR o IN SELECT * FROM public.open_shift_market_offers WHERE company_id=company AND status='MARKET_OPEN' ORDER BY work_date,shift_code LOOP
   reason:=CASE WHEN p_action='employee_list' THEN private.sf_open_market_candidate(o.id,emp.id) END;
   warning:=CASE WHEN p_action='employee_list' THEN private.sf_open_market_rhythm(emp.id,o.work_date,o.shift_code) ELSE '' END;
   IF p_action='employee_list' AND EXISTS(SELECT 1 FROM public.open_shift_market_claims WHERE offer_id=o.id AND employee_id=emp.id AND status IN ('PENDING_MANAGER','APPLIED')) THEN reason:='�bernahme bereits eingereicht'; END IF;
   out_rows:=out_rows||jsonb_build_array(jsonb_build_object('id',o.id,'kind','OPEN_POSITION','is_claim',false,'is_own',false,'status','MARKET_OPEN','assignment_id',NULL,'shift_code',o.shift_code,'starts_at',o.starts_at,'ends_at',o.ends_at,'offered_by','Offener Bedarf � Planung','reason',o.reason,'requested_at',o.created_at,'can_take',reason IS NULL,'block_reason',reason,'rhythm_warning',warning,'remaining_count',o.remaining_count,'company_name',(SELECT name FROM public.companies WHERE id=company)));
  END LOOP;
  FOR cl IN SELECT * FROM public.open_shift_market_claims WHERE company_id=company AND (p_action='manager_list' OR employee_id=emp.id) ORDER BY requested_at DESC LIMIT 1000 LOOP
   SELECT * INTO o FROM public.open_shift_market_offers WHERE id=cl.offer_id;
   warning:=private.sf_open_market_rhythm(cl.employee_id,o.work_date,o.shift_code);
   out_rows:=out_rows||jsonb_build_array(jsonb_build_object('id',cl.id,'offer_id',o.id,'kind','OPEN_POSITION','is_claim',true,'is_own',false,'status',cl.status,'assignment_id',cl.assignment_id,'shift_code',o.shift_code,'starts_at',o.starts_at,'ends_at',o.ends_at,'offered_by','Offener Bedarf � Planung','claimed_by',(SELECT trim(first_name||' '||last_name) FROM public.employees WHERE id=cl.employee_id),'reason',o.reason,'colleague_comment',cl.comment,'manager_comment',cl.manager_comment,'requested_at',cl.requested_at,'can_take',false,'rhythm_warning',warning));
  END LOOP;
  RETURN out_rows;
 ELSE RAISE EXCEPTION 'Unbekannter Marktplatzvorgang'; END IF;
 INSERT INTO public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,new_values,metadata) VALUES(company,'OPEN_SHIFT_MARKET_'||upper(p_action),'open_shift_market',coalesce(cl.id,claim_id,oid,o.id),uid,role_name,info,jsonb_build_object('note',left(coalesce(p_data->>'note',''),1000)));
 RETURN info;
END $function$
;

create function private.qa_open_market_scoped(p_company uuid,p_action text,p_id uuid default null,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.qa_employee_identity(p_company);
 if p_action is null or p_action not in ('employee_list','employee_claim','employee_cancel') then raise exception 'Ungültige Aktion' using errcode='42501'; end if;
 return private.sf_open_market_api(p_action,p_company,jsonb_build_object('id',p_id,'note',p_note));
end $$;
revoke all on function private.qa_open_market_scoped(uuid,text,uuid,text) from public,anon;
grant execute on function private.qa_open_market_scoped(uuid,text,uuid,text) to authenticated;
create function public.qa_open_market_scoped(p_company uuid,p_action text,p_id uuid default null,p_note text default '')
returns jsonb language sql set search_path='' as $$select private.qa_open_market_scoped(p_company,p_action,p_id,p_note)$$;
revoke all on function public.qa_open_market_scoped(uuid,text,uuid,text) from public,anon;
grant execute on function public.qa_open_market_scoped(uuid,text,uuid,text) to authenticated;

