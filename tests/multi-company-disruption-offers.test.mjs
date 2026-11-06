import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=name=>readFileSync(new URL('../drafts/multi-company-roles/'+name,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [u,v,a,b,c,ea,eb,ec,sa,sb,sc,ia,ib,ic,oa,ob,oc]=Array.from({length:17},(_,i)=>id(i+1));

test('disruption offers use explicit active company identity',async t=>{
 const db=new PGlite();
 const actor=async value=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[value]);await db.exec('set role authenticated')};
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function private.sf_has_time_only_login() returns boolean language sql stable as $$select false$$;
   create table public.companies(id uuid primary key,name text);
   create table public.employees(id uuid primary key,company_id uuid,auth_user_id uuid,status text,access_status text,deleted_at timestamptz,role text,first_name text,last_name text);
   create table public.company_members(company_id uuid,user_id uuid,status text,role text,extra_permissions text[]);
   create table public.shift_assignments(id uuid primary key,company_id uuid,shift_code text,starts_at timestamptz,ends_at timestamptz,version int,employee_id uuid,status text,break_minutes int,note text);
   create table public.disruption_incidents(id uuid primary key,company_id uuid,assignment_id uuid,status text,assignment_version int,original_employee_id uuid);
   create table public.disruption_offers(id uuid primary key,company_id uuid,incident_id uuid,employee_id uuid,status text,expires_at timestamptz,employee_comment text,offered_at timestamptz,responded_at timestamptz,updated_at timestamptz);
   create table public.shift_change_requests(id uuid primary key,status text);
   create table private.disruption_replacements(incident_id uuid,change_id uuid);
   create table public.time_entries(assignment_id uuid);
   create table public.company_compliance_policy(company_id uuid,works_council_enabled boolean);
   create table public.notifications(company_id uuid,user_id uuid,kind text,title text,message text,link_view text,entity_type text,entity_id uuid);
   create function private.sf_swap_candidate_reason(uuid,uuid) returns text language sql as $$select null::text$$;
   create function private.sf_disruption_candidate(public.shift_assignments,uuid,timestamptz,timestamptz) returns jsonb language sql as $$select '{}'::jsonb$$;
   grant usage on schema public,private,auth to authenticated;
   insert into public.companies values('${a}','A'),('${b}','B'),('${c}','Foreign');
   insert into public.employees values('${ea}','${a}','${u}','active','ACTIVE',null,'Sicherheitsmitarbeiter','QA','A'),('${eb}','${b}','${u}','active','ACTIVE',null,'Sicherheitsmitarbeiter','QA','B'),('${ec}','${c}','${v}','active','ACTIVE',null,'Sicherheitsmitarbeiter','QA','C');
   insert into public.shift_assignments(id,company_id,shift_code,starts_at,ends_at) values('${sa}','${a}','A',now(),now()+interval '8 hours'),('${sb}','${b}','B',now(),now()+interval '8 hours'),('${sc}','${c}','C',now(),now()+interval '8 hours');
   insert into public.disruption_incidents(id,company_id,assignment_id,status) values('${ia}','${a}','${sa}','OPEN'),('${ib}','${b}','${sb}','OPEN'),('${ic}','${c}','${sc}','OPEN');
   insert into public.disruption_offers(id,company_id,incident_id,employee_id,status,expires_at,offered_at) values('${oa}','${a}','${ia}','${ea}','OFFERED',now()+interval '1 day',now()),('${ob}','${b}','${ib}','${eb}','OFFERED',now()+interval '1 day',now()),('${oc}','${c}','${ic}','${ec}','OFFERED',now()+interval '1 day',now());`);
  await db.exec(read('company-options-candidate.sql'));await db.exec(read('employee-company-identity-candidate.sql'));
  await db.exec(read('company-swap-list-candidate.sql').split('CREATE OR REPLACE FUNCTION private.sf_list_shift_swaps_for_company')[0]);
  await db.exec(read('disruption-offers-company-candidate.sql'));await actor(u);
  const list=async company=>(await db.query('select * from public.employee_list_disruption_offers_for_company($1)',[company])).rows;
  await t.test('each company lists only its own offer',async()=>{
   assert.deepEqual((await list(a)).map(x=>x.offer_id),[oa]);assert.deepEqual((await list(b)).map(x=>x.offer_id),[ob]);await assert.rejects(list(c),/Mitarbeiterzugang/);
   await assert.rejects(db.query('select * from private.employee_list_disruption_offers_impl()'),/Unternehmen auswählen/);
  });
  await t.test('foreign and disabled offers cannot be answered',async()=>{
   await assert.rejects(db.query("select * from private.employee_respond_disruption_offer_impl($1,'DECLINE','')",[oc]),/Mitarbeiterzugang|gehört/);
   await db.exec('reset role');await db.exec(`update public.employees set access_status='DISABLED' where id='${eb}'`);await actor(u);
   await assert.rejects(list(b),/Mitarbeiterzugang/);await assert.rejects(db.query("select * from private.employee_respond_disruption_offer_impl($1,'DECLINE','')",[ob]),/Mitarbeiterzugang|gehört/);
   await db.exec('reset role');await db.exec(`update public.employees set access_status='ACTIVE' where id='${eb}'`);await actor(u);
  });
  await t.test('cross-company incident or shift references are rejected',async()=>{
   const badOffer=id(22),badIncident=id(23),badShiftOffer=id(24);
   await db.exec('reset role');await db.exec(`insert into public.disruption_offers(id,company_id,incident_id,employee_id,status,expires_at,offered_at) values('${badOffer}','${a}','${ib}','${ea}','OFFERED',now()+interval '1 day',now());
    insert into public.disruption_incidents(id,company_id,assignment_id,status) values('${badIncident}','${a}','${sb}','OPEN');
    insert into public.disruption_offers(id,company_id,incident_id,employee_id,status,expires_at,offered_at) values('${badShiftOffer}','${a}','${badIncident}','${ea}','OFFERED',now()+interval '1 day',now());`);
   await actor(u);assert.deepEqual((await list(a)).map(x=>x.offer_id),[oa]);
   await assert.rejects(db.query("select * from private.employee_respond_disruption_offer_impl($1,'DECLINE','')",[badOffer]),/Angebot nicht verfügbar/);
   await assert.rejects(db.query("select * from private.employee_respond_disruption_offer_impl($1,'ACCEPT','')",[badShiftOffer]),/Angebot nicht verfügbar/);
  });
  await t.test('own offers can be declined in both companies',async()=>{
   for(const offer of [oa,ob])assert.equal((await db.query("select * from private.employee_respond_disruption_offer_impl($1,'DECLINE','test')",[offer])).rows[0].status,'DECLINED');
  });
  await t.test('acceptance keeps required works-council review and notifies only the right company',async()=>{
   const incident=id(18),offer=id(19),manager=id(20),foreignManager=id(21);
   await db.exec('reset role');await db.exec(`update public.shift_assignments set version=1,employee_id='${ea}',status='PUBLISHED' where id='${sa}';
    insert into public.disruption_incidents(id,company_id,assignment_id,status,assignment_version,original_employee_id) values('${incident}','${a}','${sa}','OPEN',1,'${ea}');
    insert into public.disruption_offers(id,company_id,incident_id,employee_id,status,expires_at,offered_at) values('${offer}','${a}','${incident}','${ea}','OFFERED',now()+interval '1 day',now());
    insert into public.company_compliance_policy values('${a}',true);
    insert into public.company_members values('${a}','${manager}','ACTIVE','ADMIN','{}'),('${b}','${foreignManager}','ACTIVE','ADMIN','{}');`);
   await actor(u);const answer=(await db.query("select * from private.employee_respond_disruption_offer_impl($1,'ACCEPT','')",[offer])).rows[0];
   assert.equal(answer.status,'ACCEPTED_PENDING');await db.exec('reset role');
   assert.deepEqual((await db.query('select user_id from public.notifications')).rows.map(x=>x.user_id),[manager]);
  });
 }finally{await db.close()}
});

test('portal loads scoped offers only when multi-company mode is enabled and demo stays compatible',async()=>{
 const source=readFileSync(new URL('../assets/disruption-autopilot-v1.js',import.meta.url),'utf8');
 const start=source.indexOf('  async function employeeLoad()'),end=source.indexOf('  function responseDialog(',start);
 assert.ok(start>=0&&end>start);
 const make=new Function('enabled','demo','calls',`const B={role:'EMPLOYEE',__sfEmployeeMultiCompanyReady:enabled};let employeeBusy=false,employeeOffers=[];
  const capture=()=>({value:{company:'company-b'},valid:()=>true}),rpc=async(name,args)=>{calls.push({name,args});return []},renderEmployee=()=>{};
  const sessionStorage={getItem:()=>demo?'active':null},document={getElementById:()=>null};
  ${source.slice(start,end)};return employeeLoad;`);
 for(const [enabled,demo,expected] of [[true,false,'employee_list_disruption_offers_for_company'],[false,false,'employee_list_disruption_offers'],[true,true,'employee_list_disruption_offers']]){
  const calls=[];await make(enabled,demo,calls)();assert.equal(calls[0].name,expected);
  if(enabled&&!demo)assert.equal(calls[0].args.p_company_id,'company-b');
 }
});
