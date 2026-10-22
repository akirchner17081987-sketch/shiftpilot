import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const display=fs.readFileSync(new URL('../supabase/migrations/20261020210525_editable_shift_display_codes.sql',import.meta.url),'utf8');
const shared=fs.readFileSync(new URL('../supabase/migrations/20261022134331_shared_shift_model_edit.sql',import.meta.url),'utf8');

test('shared TL editing updates only its company, atomically, preserving existing duty times',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
  create table company_members(company_id uuid,user_id uuid,status text,role text);
  create table shift_templates(id uuid primary key default gen_random_uuid(),company_id uuid,code text,name text,default_start time,default_end time,css_class text,active boolean,sort_order integer,planning_mode text,optional_staffing integer,responsible_employee_id uuid,responsible_only boolean,optional_weekdays integer[],site_id uuid,coverage_group text,coverage_required integer not null default 0,unique(company_id,code),constraint shift_templates_coverage_rule check((coverage_group is null and coverage_required=0) or (coverage_group is not null and coverage_required between 1 and 99 and planning_mode='required')));
  create table employees(id uuid,company_id uuid,status text,deleted_at timestamptz,shift_permissions text[],qualifications text[]);
  create table shift_assignments(company_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz);
  create table shift_change_requests(company_id uuid,old_snapshot jsonb,proposed_snapshot jsonb);
  create table datev_lodas_rules(company_id uuid,source_key text);
  create table global_staffing_requirements(company_id uuid,shift_code text,required_count integer,unique(company_id,shift_code));
  create table daily_staffing_overrides(company_id uuid,shift_code text);
  create table company_locations(id uuid,company_id uuid,is_active boolean);`);
  await db.exec(display);
  await db.exec(`create function validate_shared_shift_coverage() returns trigger language plpgsql as $$begin
   if new.coverage_group is not null and exists(select 1 from shift_templates t where t.company_id=new.company_id and t.coverage_group=new.coverage_group and t.id<>new.id and (t.default_start<>new.default_start or t.default_end<>new.default_end or t.coverage_required<>new.coverage_required)) then raise exception 'Gemeinsame TL-Besetzung benötigt identische Zeiten und Mindestbesetzung.';end if;return new;end$$;
   create trigger shift_templates_shared_coverage before insert or update on shift_templates for each row execute function validate_shared_shift_coverage();`);
  const company='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222',user='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  await db.query("select set_config('test.user_id',$1,false)",[user]);
  await db.query("insert into company_members values($1,$2,'ACTIVE','OWNER')",[company,user]);
  for(const id of [company,other])for(const code of ['TL-LE','TL-RE']){
   await db.query("insert into shift_templates(company_id,code,display_code,name,default_start,default_end,css_class,active,sort_order,planning_mode,optional_staffing,responsible_only,optional_weekdays,coverage_group,coverage_required) values($1,$2,$2,$2,'20:00','05:00','teal',true,1,'required',0,false,array[1,2,3,4,5,6,7],'TL',1)",[id,code]);
   await db.query('insert into global_staffing_requirements values($1,$2,1)',[id,code]);
  }
  await db.query("insert into shift_assignments values($1,'TL-LE','2027-01-01T20:00:00Z','2027-01-02T05:00:00Z')",[company]);
  await db.exec(shared);
  const payload={code:'TL-LE',display_code:'TL-LE',name:'Teamleitung LE',start:'19:00',end:'07:00',color:'teal',soll:2,planning_mode:'required',optional_staffing:0,responsible_only:false,optional_weekdays:[1,2,3,4,5,6,7]};
  const call=(id,p)=>db.query('select manager_manage_shared_shift_model($1,$2) result',[id,p]);
  await assert.rejects(call(other,payload),/Planungsrechte/);
  const changed=(await call(company,payload)).rows[0].result;
  assert.equal(changed.updated_models,2);
  const values=(await db.query('select company_id,code,default_start,default_end,coverage_required from shift_templates order by company_id,code')).rows;
  assert.deepEqual(values.filter(x=>x.company_id===company).map(x=>[x.default_start,x.default_end,x.coverage_required]),[['19:00:00','07:00:00',2],['19:00:00','07:00:00',2]]);
  assert.deepEqual(values.filter(x=>x.company_id===other).map(x=>[x.default_start,x.coverage_required]),[['20:00:00',1],['20:00:00',1]]);
  assert.deepEqual((await db.query('select shift_code,required_count from global_staffing_requirements where company_id=$1 order by shift_code',[company])).rows.map(x=>x.required_count),[2,2]);
  assert.equal((await db.query('select starts_at,ends_at from shift_assignments')).rows[0].starts_at.toISOString(),'2027-01-01T20:00:00.000Z');
  await assert.rejects(db.query("update shift_templates set default_start='21:00' where company_id=$1 and code='TL-LE'",[company]),/identische Zeiten/);
  assert.equal((await db.query("select default_start from shift_templates where company_id=$1 and code='TL-LE'",[company])).rows[0].default_start,'19:00:00');
  await assert.rejects(call(company,{...payload,soll:0}),/Pflichtbesetzung/);
 }finally{await db.close()}
});
