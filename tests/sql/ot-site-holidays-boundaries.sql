DO $test$
DECLARE co_ uuid;le_ uuid;re_ uuid;other_ uuid;r_ record;got_ boolean;
BEGIN
 SELECT id INTO STRICT co_ FROM public.companies WHERE name='SchichtFunk';
 SELECT id INTO STRICT le_ FROM public.employees WHERE company_id=co_ AND personnel_no='2001' AND deleted_at IS NULL;
 SELECT id INTO STRICT re_ FROM public.employees WHERE company_id=co_ AND personnel_no='2048' AND deleted_at IS NULL;
 SELECT id INTO STRICT other_ FROM public.employees WHERE company_id=co_ AND personnel_no='109' AND deleted_at IS NULL;
 FOR r_ IN SELECT * FROM (VALUES
  (date '2027-11-01',le_,false),(date '2027-11-01',re_,true),
  (date '2027-11-17',le_,true),(date '2027-11-17',re_,false),
  (date '2027-05-27',le_,false),(date '2027-05-27',re_,true),
  (date '2027-03-08',le_,false),(date '2027-03-08',re_,false),
  (date '2027-01-01',le_,true),(date '2027-01-02',re_,true)
 ) x(day_,employee_,expected_) LOOP
  got_:=private.sf_ot_day(co_,r_.day_,r_.employee_);
  IF got_ IS DISTINCT FROM r_.expected_ THEN RAISE EXCEPTION 'OT holiday boundary failed: % / %',r_.day_,r_.employee_; END IF;
 END LOOP;
 IF private.sf_ot_day(co_,date '2027-11-01') IS DISTINCT FROM true THEN RAISE EXCEPTION 'Aggregate holiday need failed'; END IF;
 IF private.sf_ot_day(co_,date '2027-03-08') IS DISTINCT FROM false THEN RAISE EXCEPTION 'Berlin holiday leaked'; END IF;
 FOR r_ IN SELECT code,default_start,default_end FROM public.shift_templates WHERE company_id=co_ AND code IN('OT1','OT2','OT3') LOOP
  IF private.sf_shift_scope_error(co_,other_,r_.code,(date '2027-01-04'+r_.default_start) AT TIME ZONE 'Europe/Berlin',(date '2027-01-04'+r_.default_end) AT TIME ZONE 'Europe/Berlin') IS NULL THEN RAISE EXCEPTION 'Exclusive OT staff restriction failed: %',r_.code; END IF;
  IF private.sf_shift_scope_error(co_,le_,r_.code,(date '2027-01-04'+r_.default_start) AT TIME ZONE 'Europe/Berlin',(date '2027-01-04'+r_.default_end) AT TIME ZONE 'Europe/Berlin') IS NOT NULL THEN RAISE EXCEPTION 'Tagdienst OT switch failed: %',r_.code; END IF;
 END LOOP;
 IF private.sf_shift_scope_error(co_,le_,'OT',timestamptz '2027-11-01 08:00+01',timestamptz '2027-11-01 18:00+01') IS NULL THEN RAISE EXCEPTION 'Wrong-site OT duty accepted'; END IF;
 IF private.sf_shift_scope_error(co_,re_,'OT',timestamptz '2027-11-01 08:00+01',timestamptz '2027-11-01 18:00+01') IS NOT NULL THEN RAISE EXCEPTION 'Right-site OT duty rejected'; END IF;
 IF (private.sf_open_market_slot(co_,date '2027-11-01','OT')->>'target')::int<>3 THEN RAISE EXCEPTION 'Holiday OT market target missing'; END IF;
 IF (private.sf_open_market_slot(co_,date '2027-03-08','OT')->>'target')::int<>0 THEN RAISE EXCEPTION 'Berlin OT market target leaked'; END IF;
END $test$;
SELECT '22 OT/site boundary checks passed' result;