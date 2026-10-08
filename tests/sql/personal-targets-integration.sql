insert into auth.users(id) values('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');insert into companies(id,name,created_by) values('10000000-0000-4000-8000-000000000001','Fictitious planning','20000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002','Other fixture','20000000-0000-4000-8000-000000000001');insert into company_members(company_id,user_id,role,status) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','OWNER','ACTIVE'),('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','VIEWER','ACTIVE');insert into time_account_settings(company_id,account_start_date,federal_state) values('10000000-0000-4000-8000-000000000001','2026-09-01','DE-SN'),('10000000-0000-4000-8000-000000000002','2026-09-01','DE-SN');insert into time_month_closures(company_id,month_start,status,closed_at,closed_by,report_snapshot) values('10000000-0000-4000-8000-000000000001','2026-08-01','CLOSED',now(),'20000000-0000-4000-8000-000000000001','{}');select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false);
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END$$;
SELECT public.manager_set_time_account_target_method('10000000-0000-4000-8000-000000000001','PERSONAL_MONTHLY','2027-01-01');
DO $$DECLARE h integer;BEGIN
 FOREACH h IN ARRAY ARRAY[180,162,144,160] LOOP
 PERFORM pg_temp.assert_true(private.sf_employee_target_minutes('10000000-0000-4000-8000-000000000001',40,ARRAY['__sp:monthlyHours='||h],'2027-01-01','2027-01-31','DE-SN')=h*60,'personal monthly target');END LOOP;
END$$;
SELECT pg_temp.assert_true(private.sf_employee_target_minutes('10000000-0000-4000-8000-000000000002',40,ARRAY['__sp:monthlyHours=180'],'2027-01-01','2027-01-31','DE-SN')=9600,'other company remains unchanged');
SELECT pg_temp.assert_true(private.sf_employee_target_minutes('10000000-0000-4000-8000-000000000001',40,ARRAY['__sp:monthlyHours=180'],'2026-12-01','2026-12-31','DE-SN')=private.sf_target_minutes(40,'2026-12-01','2026-12-31','DE-SN'),'previous month unchanged');
SELECT pg_temp.assert_true(private.sf_employee_target_minutes('10000000-0000-4000-8000-000000000001',40,ARRAY['__sp:monthlyHours=180'],'2027-01-16','2027-01-31','DE-SN')=round(10800.0*16/31),'partial month uses calendar days');
SELECT pg_temp.assert_true(private.sf_employee_target_minutes('10000000-0000-4000-8000-000000000001',40,ARRAY['__sp:monthlyHours=180'],'2026-12-01','2027-01-31','DE-SN')=private.sf_target_minutes(40,'2026-12-01','2026-12-31','DE-SN')+10800,'cumulative period crosses method change');
DO $$BEGIN
 BEGIN PERFORM public.manager_set_time_account_target_method('10000000-0000-4000-8000-000000000001','PERSONAL_MONTHLY','2026-08-01');RAISE EXCEPTION 'Retroactive change accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%abgeschlossene%' THEN RAISE;END IF;END;
 BEGIN UPDATE time_account_settings SET account_start_date='2026-10-01' WHERE company_id='10000000-0000-4000-8000-000000000001';RAISE EXCEPTION 'Closed-period base settings changed';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%abgeschlossene%' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
 BEGIN PERFORM public.manager_set_time_account_target_method('10000000-0000-4000-8000-000000000001','PERSONAL_MONTHLY','2027-01-01');RAISE EXCEPTION 'VIEWER accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%OWNER%' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false);
 BEGIN PERFORM public.manager_set_time_account_target_method('10000000-0000-4000-8000-000000000002','PERSONAL_MONTHLY','2027-01-01');RAISE EXCEPTION 'Cross-tenant accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%OWNER%' THEN RAISE;END IF;END;
END$$;
INSERT INTO employees(id,company_id,personnel_no,first_name,last_name,employment,weekly_hours,status,shift_permissions,qualifications) VALUES('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','AUDIT','Fictitious','Person','Vollzeit',40,'active',ARRAY['SD','ND','FD-WE'],ARRAY['__sp:monthlyHours=180','__sp:maxConsecutive=5','__sp:rhythmMode=off']);
SELECT pg_temp.assert_true((private.time_account_row_v1('30000000-0000-4000-8000-000000000001','2027-01-01')->>'target_minutes')::integer=10800,'employee account target');
SELECT pg_temp.assert_true((private.time_account_row_v1('30000000-0000-4000-8000-000000000001','2027-01-01')->>'target_method')='PERSONAL_MONTHLY','employee account method');
SELECT pg_temp.assert_true((SELECT target_minutes=10800 AND holiday_minutes=0 FROM private.sf_time_account_rows('10000000-0000-4000-8000-000000000001','2027-01-01','30000000-0000-4000-8000-000000000001')),'manager account target and holiday method');
CREATE FUNCTION pg_temp.set_duties(dates date[],types text[]) RETURNS void LANGUAGE plpgsql AS $$DECLARE i integer;BEGIN
 DELETE FROM shift_assignments WHERE company_id='10000000-0000-4000-8000-000000000001';
 FOR i IN 1..array_length(dates,1) LOOP
 INSERT INTO shift_assignments(company_id,employee_id,shift_code,starts_at,ends_at,status) VALUES('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',types[i],(dates[i]+CASE WHEN types[i]='ND' THEN '22:00'::time ELSE '14:00'::time END) AT TIME ZONE 'Europe/Berlin',((dates[i]+CASE WHEN types[i]='ND' THEN 1 ELSE 0 END)+CASE WHEN types[i]='ND' THEN '06:00'::time ELSE '22:00'::time END) AT TIME ZONE 'Europe/Berlin','DRAFT');END LOOP;
END$$;
CREATE FUNCTION pg_temp.expect_night_error() RETURNS void LANGUAGE plpgsql AS $$BEGIN
 BEGIN PERFORM private.sf_validate_individual_month('10000000-0000-4000-8000-000000000001','2027-01-01',ARRAY['30000000-0000-4000-8000-000000000001'::uuid]);RAISE EXCEPTION 'Invalid night block accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%freien Starttag%' THEN RAISE;END IF;END;
END$$;
SELECT pg_temp.set_duties(ARRAY['2027-01-02','2027-01-03','2027-01-04','2027-01-05']::date[],ARRAY['SD','SD','ND','ND']);SELECT pg_temp.expect_night_error();
SELECT pg_temp.set_duties(ARRAY['2027-01-04','2027-01-05','2027-01-07','2027-01-08']::date[],ARRAY['ND','ND','SD','SD']);SELECT pg_temp.expect_night_error();
SELECT pg_temp.set_duties(ARRAY['2027-01-04','2027-01-05','2027-01-09','2027-01-10']::date[],ARRAY['ND','ND','SD','SD']);SELECT private.sf_validate_individual_month('10000000-0000-4000-8000-000000000001','2027-01-01',ARRAY['30000000-0000-4000-8000-000000000001'::uuid]);
SELECT pg_temp.set_duties(ARRAY['2026-12-30','2026-12-31','2027-01-02','2027-01-03']::date[],ARRAY['ND','ND','SD','SD']);SELECT pg_temp.expect_night_error();
SELECT pg_temp.set_duties(ARRAY['2027-01-29','2027-01-30','2027-02-02']::date[],ARRAY['ND','ND','SD']);SELECT pg_temp.expect_night_error();
SELECT 'Personal monthly targets and night recovery integration passed' AS result;
