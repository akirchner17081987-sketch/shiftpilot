import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const c='00000000-0000-4000-8000-000000000001',e='00000000-0000-4000-8000-000000000002',a='00000000-0000-4000-8000-000000000003',t='00000000-0000-4000-8000-000000000004';
test('month status covers local overnight work and accepts only complete finalized QR coverage',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema private;create table companies(id uuid,timezone text);create table employees(id uuid,company_id uuid);
 create table time_month_closures(company_id uuid,month_start date,status text,closed_at timestamptz,revision int);
 create table shift_assignments(id uuid,company_id uuid,employee_id uuid,status text,starts_at timestamptz,ends_at timestamptz);
 create table time_entries(assignment_id uuid,company_id uuid,status text,actual_start timestamptz,actual_end timestamptz,break_minutes int);
 create table absences(company_id uuid,start_date date,end_date date,status text);
 create table time_qr_terminals(id uuid,company_id uuid);create table time_qr_independent_shifts(company_id uuid,employee_id uuid,terminal_id uuid,started_at timestamptz,ended_at timestamptz);
 create function private.sf_is_manager(uuid,boolean) returns boolean language sql as $$select true$$;
 insert into companies values('${c}','Europe/Berlin');insert into employees values('${e}','${c}');insert into time_qr_terminals values('${t}','${c}');
 insert into shift_assignments values('${a}','${c}','${e}','PUBLISHED','2026-09-15 06:00Z','2026-09-15 14:00Z');`);
 const base=read('supabase/migrations/20261006032450_qr_central_time_integration.sql');await db.exec(base.slice(base.indexOf('create or replace function private.sf_paid_time_ranges'),base.indexOf('revoke all on function private.sf_paid_time_ranges')));
 await db.exec(read('supabase/migrations/20261018090914_month_close_local_period_and_qr_coverage.sql'));
 const status=async()=>(await db.query("select public.manager_time_month_status($1,'2026-09-01') v",[c])).rows[0].v;
 assert.equal((await status()).missing_confirmed_assignments,1);
 await db.exec(`insert into time_qr_independent_shifts values('${c}','${e}','${t}','2026-09-15 06:00Z','2026-09-15 13:00Z')`);assert.equal((await status()).missing_confirmed_assignments,1,'Partial QR must not auto-confirm');
 await db.exec("update time_qr_independent_shifts set ended_at='2026-09-15 14:00Z'");assert.equal((await status()).missing_confirmed_assignments,0);
 await db.exec("update shift_assignments set starts_at='2026-09-30 20:00Z',ends_at='2026-10-01 04:00Z'");assert.equal((await status()).missing_confirmed_assignments,1,'Night crossing into October blocks September');
 await db.exec("update shift_assignments set starts_at='2026-09-30 22:00Z',ends_at='2026-10-01 06:00Z'");assert.equal((await status()).missing_confirmed_assignments,0,'Local October duty must not block September');
 await db.exec(`insert into time_entries values('${a}','${c}','recorded','2026-08-31 20:00Z','2026-09-01 04:00Z',0)`);assert.equal((await status()).pending_time_entries,1,'Pending work crossing into September');
 await db.exec("update time_entries set actual_start='2026-09-30 22:00Z',actual_end='2026-10-01 06:00Z'");assert.equal((await status()).pending_time_entries,0,'Local October pending work');
 await db.exec("update time_entries set status='open',actual_start='2026-09-15 06:00Z',actual_end=null");assert.equal((await status()).pending_time_entries,1,'Running manual work');
 await db.exec(`insert into absences values('${c}','2026-09-30','2026-10-02','Beantragt')`);assert.equal((await status()).pending_absence_requests,1);
 await db.exec(`insert into time_qr_independent_shifts values('${c}','${e}','${t}','2026-09-30 20:00Z',null)`);assert.equal((await status()).open_qr_shifts,1);
 }finally{await db.close()}
});
