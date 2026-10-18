import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('active opening table protects closed history and permits future-only openings',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema private;create table time_month_closures(company_id uuid,month_start date,status text);
 create table time_account_openings(employee_id uuid primary key,company_id uuid,effective_date date,opening_balance_minutes int);
 create function private.sf_erasure_row_allowed(uuid,jsonb) returns boolean language sql as $$select false$$;`);
 const old=read('supabase/migrations/20260830015512_harden_closed_month_account_integrity.sql');
 await db.exec(old.slice(old.indexOf('create or replace function private.opening_affects_closed_month'),old.indexOf('revoke all on function private.opening_affects_closed_month')));
 const erasure=read('supabase/migrations/20261006163421_owner_employee_full_erasure.sql'),start=erasure.indexOf('CREATE OR REPLACE FUNCTION private.enforce_closed_month_time_account_opening()');
 await db.exec(erasure.slice(start,erasure.indexOf('CREATE OR REPLACE FUNCTION private.sf_guard_shift_write()',start)));
 await db.exec(read('supabase/migrations/20261018090421_time_account_opening_closed_month_guard.sql'));
 const c='00000000-0000-4000-8000-000000000001',e='00000000-0000-4000-8000-000000000002',f='00000000-0000-4000-8000-000000000003';
 await db.query('insert into time_account_openings values($1,$2,$3,60)',[e,c,'2026-09-01']);
 await db.query("insert into time_month_closures values($1,'2026-09-01','CLOSED')",[c]);
 await assert.rejects(db.query('update time_account_openings set opening_balance_minutes=120 where employee_id=$1',[e]),/abgeschlossenen Monat/);
 await assert.rejects(db.query('update time_account_openings set effective_date=$1 where employee_id=$2',['2026-10-01',e]),/abgeschlossenen Monat/);
 await assert.rejects(db.query('delete from time_account_openings where employee_id=$1',[e]),/abgeschlossenen Monat/);
 await assert.rejects(db.query('insert into time_account_openings values($1,$2,$3,0)',[f,c,'2026-09-30']),/abgeschlossenen Monat/);
 await db.query('insert into time_account_openings values($1,$2,$3,0)',[f,c,'2026-10-01']);
 await db.query('update time_account_openings set opening_balance_minutes=30 where employee_id=$1',[f]);
 await db.exec("update time_month_closures set status='OPEN'");await db.query('update time_account_openings set opening_balance_minutes=120 where employee_id=$1',[e]);
 assert.equal((await db.query('select opening_balance_minutes from time_account_openings where employee_id=$1',[e])).rows[0].opening_balance_minutes,120);
 }finally{await db.close()}
});
