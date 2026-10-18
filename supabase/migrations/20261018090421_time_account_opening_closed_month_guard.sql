-- The active RPC writes time_account_openings; the older table retains its own guard.
-- Reuse the existing guard, including the controlled employee-erasure exception.
DROP TRIGGER IF EXISTS trg_time_account_openings_closed_month ON public.time_account_openings;
CREATE TRIGGER trg_time_account_openings_closed_month
BEFORE INSERT OR UPDATE OR DELETE ON public.time_account_openings
FOR EACH ROW EXECUTE FUNCTION private.enforce_closed_month_time_account_opening();
