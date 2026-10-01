-- One confirmed, company-scoped transaction; assigned shifts and history stay intact.
CREATE FUNCTION private.withdraw_all_market_offers(p_company_id uuid,p_confirm boolean,p_note text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); actor_role text; offers integer; claims integer; swaps integer; result jsonb;
BEGIN
 SELECT role INTO actor_role FROM public.company_members WHERE company_id=p_company_id
  AND user_id=actor AND status='ACTIVE' AND role IN('OWNER','ADMIN','PLANNER','DISPATCHER') LIMIT 1;
 IF actor IS NULL OR actor_role IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Keine aktiven Planungsrechte für dieses Unternehmen'; END IF;
 IF p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'Bitte das Zurückziehen aller Angebote ausdrücklich bestätigen.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('open-market:'||p_company_id::text,0));
 UPDATE public.open_shift_market_offers SET status='CANCELLED',remaining_count=0,updated_at=now()
  WHERE company_id=p_company_id AND status='MARKET_OPEN';
 GET DIAGNOSTICS offers=ROW_COUNT;
 UPDATE public.open_shift_market_claims SET status='SUPERSEDED',reviewed_by=actor,reviewed_at=now(),
  manager_comment=left('Alle Marktplatzangebote wurden zurückgezogen. '||coalesce(p_note,''),1000)
  WHERE company_id=p_company_id AND status='PENDING_MANAGER';
 GET DIAGNOSTICS claims=ROW_COUNT;
 UPDATE public.shift_swap_requests SET status='CANCELLED',manager_decided_by=actor,manager_decided_at=now(),updated_at=now(),
  manager_comment=left('Alle Marktplatzangebote wurden zurückgezogen. '||coalesce(p_note,''),1000)
  WHERE company_id=p_company_id AND status IN('MARKET_OPEN','PENDING_MANAGER');
 GET DIAGNOSTICS swaps=ROW_COUNT;
 result:=jsonb_build_object('withdrawnOffers',offers+swaps,'withdrawnOpenOffers',offers,'withdrawnLegacyOffers',swaps,'endedClaims',claims);
 IF offers+swaps+claims>0 THEN
  INSERT INTO public.audit_events(company_id,event_type,entity_type,actor_id,actor_role,metadata)
   VALUES(p_company_id,'SHIFT_MARKET_ALL_WITHDRAWN','shift_marketplace',actor,actor_role,result||jsonb_build_object('note',left(coalesce(p_note,''),1000)));
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.withdraw_all_market_offers(uuid,boolean,text) FROM PUBLIC,anon;
CREATE FUNCTION public.manager_withdraw_all_market_offers(p_company_id uuid,p_confirm boolean DEFAULT false,p_note text DEFAULT '')
 RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.withdraw_all_market_offers(p_company_id,p_confirm,p_note);
$$;
REVOKE ALL ON FUNCTION public.manager_withdraw_all_market_offers(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.withdraw_all_market_offers(uuid,boolean,text),public.manager_withdraw_all_market_offers(uuid,boolean,text) TO authenticated;
