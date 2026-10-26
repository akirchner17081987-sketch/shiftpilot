-- An overlapping request can start before another planner's save commits.
-- Bind the exception to the actual writing transaction, rather than a timestamp.
DO $migration$
DECLARE source_ text;
BEGIN
 source_:=pg_get_functiondef('private.sf_normalize_manual_rhythm_override()'::regprocedure);
 IF strpos(source_,'''confirmed_txid''')=0 THEN
  IF strpos(source_,'''confirmed_at'',clock_timestamp()')=0 THEN
   RAISE EXCEPTION 'Unexpected manual confirmation function; review migration.';
  END IF;
  EXECUTE replace(source_,'''confirmed_at'',clock_timestamp()',
   '''confirmed_at'',clock_timestamp(),''confirmed_txid'',pg_current_xact_id()::text');
 END IF;
END $migration$;

CREATE OR REPLACE FUNCTION private.sf_manual_preview_current(value_ jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(value_->'manualPlanning'='true'::jsonb
  AND value_->>'actor_id'=auth.uid()::text
  AND value_->>'confirmed_txid'=pg_current_xact_id_if_assigned()::text,false)
$$;
REVOKE ALL ON FUNCTION private.sf_manual_preview_current(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_manual_preview_current(jsonb) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
