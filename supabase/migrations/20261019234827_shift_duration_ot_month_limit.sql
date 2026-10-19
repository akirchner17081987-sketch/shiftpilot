-- Use actual OT model duration instead of assuming every OT duty is ten hours.
-- An explicitly configured monthly cap applies only to full-time staff exclusively permitted for OT1/OT2/OT3.
CREATE OR REPLACE FUNCTION private.sf_ot_only_month_error(rows_ jsonb,month_ date,tz_ text,max_hours_ numeric,incoming_ boolean)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE a_ timestamptz:=date_trunc('month',month_)::timestamp AT TIME ZONE tz_;
 b_ timestamptz:=(date_trunc('month',month_::timestamp)+interval '1 month') AT TIME ZONE tz_;
 count_ int; hours_ numeric; calendar_ numeric; shift_hours_ numeric;
BEGIN
 SELECT count(*) FILTER(WHERE starts_at>=a_ AND NOT coalesce(market_approved,false)),
 coalesce(sum(extract(epoch FROM ends_at-starts_at)/3600) FILTER(WHERE starts_at>=a_),0),
 coalesce(sum(extract(epoch FROM least(ends_at,b_)-greatest(starts_at,a_))/3600),0),
 coalesce(max(extract(epoch FROM ((ends_at AT TIME ZONE tz_)-(starts_at AT TIME ZONE tz_)))/3600) FILTER(WHERE starts_at>=a_ AND NOT coalesce(market_approved,false)),10)
 INTO count_,hours_,calendar_,shift_hours_
 FROM jsonb_to_recordset(coalesce(rows_,'[]')) x(starts_at timestamptz,ends_at timestamptz,market_approved boolean)
 WHERE starts_at<b_ AND ends_at>a_;
 IF NOT incoming_ AND count_>floor(max_hours_/greatest(shift_hours_,0.25)) THEN
  RETURN format('Maximal %s reguläre OT-Dienste pro Monat.',floor(max_hours_/greatest(shift_hours_,0.25)));
 END IF;
 IF hours_>max_hours_+.000001 OR calendar_>max_hours_+.000001 THEN
  RETURN format('OT-Monatsgrenze %s Stunden einschließlich Monatsübertrag überschritten.',max_hours_);
 END IF;
 RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION private.sf_ot_only_month_error(jsonb,date,text,numeric,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sf_ot_only_month_error(jsonb,date,text,numeric,boolean) TO authenticated,service_role;

