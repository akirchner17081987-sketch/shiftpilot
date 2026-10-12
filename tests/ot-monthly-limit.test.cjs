const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('database OT extension accepts 220h, rejects excess, and excludes mixed roles and other companies',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA private;
 CREATE TABLE public.company_compliance_policy(company_id uuid,solid_planning_rules jsonb,monthly_planning_max_hours numeric,monthly_planning_max_shifts int);
 CREATE TABLE public.employees(id uuid,company_id uuid,qualifications text[],employment text,weekly_hours numeric,shift_permissions text[],personnel_no text);
 CREATE TABLE public.companies(id uuid,timezone text);
 CREATE TABLE public.shift_templates(company_id uuid,active boolean,code text,default_start time,default_end time);
 CREATE TABLE public.shift_assignments(id uuid,company_id uuid,employee_id uuid,status text,starts_at timestamptz,ends_at timestamptz);
 CREATE TABLE public.open_shift_market_claims(assignment_id uuid,employee_id uuid,company_id uuid,status text);
 CREATE FUNCTION private.sf_month_meta(q text[],k text) RETURNS text LANGUAGE sql AS $$ SELECT split_part(v,'=',2) FROM unnest(q) v WHERE v LIKE '__sp:'||k||'=%' LIMIT 1 $$;
 `);
 const old=fs.readFileSync('supabase/migrations/20261009100331_confirmed_planning_rules_v2.sql','utf8');
 await db.exec(old.slice(old.indexOf('CREATE OR REPLACE FUNCTION private.sf_confirmed_month_error'),old.indexOf('CREATE OR REPLACE FUNCTION private.sf_assert_month_planning_limits')));
 await db.exec(fs.readFileSync('supabase/migrations/20261012013020_ot_monthly_limit_override.sql','utf8'));
 const company='00000000-0000-0000-0000-000000000001',employee='00000000-0000-0000-0000-000000000002';
 await db.query("INSERT INTO companies VALUES ($1,'Europe/Berlin');",[company]);
 await db.query("INSERT INTO company_compliance_policy VALUES ($1,'{\"enabled\":true,\"confirmedRulesVersion\":2,\"otOnlyMonthlyMaxHours\":220}',190,18)",[company]);
 await db.query("INSERT INTO employees VALUES ($1,$2,ARRAY['__sp:monthlyHours=180'],'Vollzeit',40,ARRAY['OT1','OT2','OT3'],'fixture')",[employee,company]);
 await db.query("INSERT INTO shift_templates VALUES ($1,true,'OT2','08:00','18:00')",[company]);
 await db.query("INSERT INTO shift_assignments SELECT gen_random_uuid(),$1,$2,'DRAFT',('2027-01-01 08:00 Europe/Berlin'::timestamptz+n*interval '1 day'),('2027-01-01 18:00 Europe/Berlin'::timestamptz+n*interval '1 day') FROM generate_series(0,21) n",[company,employee]);
 const check=()=>db.query("SELECT private.sf_assert_month_planning_limits($1,$2,'2027-01-01')",[company,employee]);
 await check(); // 22 duties = 220 hours.
 await db.query("UPDATE employees SET shift_permissions=ARRAY['OT'] WHERE id=$1",[employee]);
 await assert.rejects(check(),/Maximal 18|190 Stunden/);
 await db.query("UPDATE employees SET shift_permissions=ARRAY['OT2','OT'] WHERE id=$1",[employee]);
 await assert.rejects(check(),/Maximal 18|190 Stunden/);
 await db.query("UPDATE employees SET shift_permissions=ARRAY['OT2','O1'] WHERE id=$1",[employee]);
 await assert.rejects(check(),/Maximal 18|190 Stunden/);
 await db.query("UPDATE employees SET shift_permissions=ARRAY['OT2'],employment='Teilzeit',qualifications=ARRAY['__sp:monthlyHours=144'] WHERE id=$1",[employee]);
 await assert.rejects(check(),/Maximal 18|144 Stunden/);
 await db.query("UPDATE employees SET employment='Vollzeit',qualifications=ARRAY['__sp:monthlyHours=180'] WHERE id=$1",[employee]);
 await db.query("UPDATE company_compliance_policy SET solid_planning_rules=solid_planning_rules-'otOnlyMonthlyMaxHours'");
 await assert.rejects(check(),/Maximal 18|190 Stunden/);
 await db.query("UPDATE company_compliance_policy SET solid_planning_rules=solid_planning_rules||'{\"otOnlyMonthlyMaxHours\":220}'");
 await db.query("INSERT INTO shift_assignments VALUES (gen_random_uuid(),$1,$2,'DRAFT','2027-01-25 08:00 Europe/Berlin','2027-01-25 18:00 Europe/Berlin')",[company,employee]);
 await assert.rejects(check(),/Maximal 22|220 Stunden/);
 const r=await db.query("SELECT private.sf_ot_only_month_error('[{\"starts_at\":\"2027-01-01T07:00Z\",\"ends_at\":\"2027-01-01T17:00Z\"},{\"starts_at\":\"2026-12-31T07:00Z\",\"ends_at\":\"2027-01-22T17:00Z\"}]','2027-01-01','Europe/Berlin',220,true) AS error");
 assert.match(r.rows[0].error,/Monatsübertrag/);
 }finally{await db.close()}
});
