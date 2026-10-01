-- Detached legacy offers and colleague requests must not remain available.
CREATE FUNCTION private.sf_cancel_detached_swap() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF old.assignment_id IS NOT NULL AND new.assignment_id IS NULL
  AND new.status IN('MARKET_OPEN','PENDING_COLLEAGUE','PENDING_MANAGER')
 THEN new.status:='CANCELLED'; END IF;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION private.sf_cancel_detached_swap() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER shift_swap_detached_assignment BEFORE UPDATE OF assignment_id ON public.shift_swap_requests
 FOR EACH ROW EXECUTE FUNCTION private.sf_cancel_detached_swap();
