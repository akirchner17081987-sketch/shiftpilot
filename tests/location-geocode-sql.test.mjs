import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=fs.readFileSync(new URL('../supabase/migrations/20261021181844_company_location_geocoding.sql',import.meta.url),'utf8');
test('geocoding preserves tenant RLS, invalidates edited addresses and rate-limits concurrent callers',async()=>{
 const db=new PGlite();try{
  await db.exec(`create schema private;create role anon;create role authenticated;create role service_role bypassrls;
   grant usage on schema public,private to service_role;
   create table company_locations(id uuid primary key,company_id uuid,address text not null,is_active boolean not null default true);
   alter table company_locations enable row level security;
   grant select on company_locations to authenticated;grant all on company_locations to service_role;
   create policy tenant_read on company_locations for select to authenticated using(company_id=current_setting('test.company')::uuid);
   insert into company_locations values('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Example 1, 12345 Ort',true),('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Other 2, 23456 Ort',true);`);
  await db.exec(sql);
  assert.equal(/security\s+definer/i.test(sql),false);
  await db.exec(`set test.company='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';set role authenticated;`);
  assert.equal((await db.query('select count(*)::int n from company_locations')).rows[0].n,1);
  await assert.rejects(db.exec("update company_locations set longitude=99"),/permission denied/);
  await assert.rejects(db.exec("select sf_claim_location_geocode('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Example 1, 12345 Ort')"),/permission denied/);
  await db.exec('reset role;set role anon;');await assert.rejects(db.exec('select * from company_locations'),/permission denied/);
  await db.exec('reset role;set role service_role;');
  const claim=(site,company,address)=>db.query('select sf_claim_location_geocode($1,$2,$3) ok',[site,company,address]);
  assert.equal((await claim('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Example 1, 12345 Ort')).rows[0].ok,false);
  assert.equal((await claim('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Example 1, 12345 Ort')).rows[0].ok,true);
  assert.equal((await claim('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Other 2, 23456 Ort')).rows[0].ok,false,'application-wide rate limit');
  assert.equal((await claim('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Example 1, 12345 Ort')).rows[0].ok,false,'site lease prevents duplicates');
  await db.exec(`update company_locations set longitude=12,latitude=51,geocode_status='verified',geocode_address=address where id='11111111-1111-1111-1111-111111111111';`);
  await assert.rejects(db.exec(`update company_locations set latitude=100 where id='11111111-1111-1111-1111-111111111111'`),/check constraint/);
  await db.exec(`update company_locations set address='Changed 3, 34567 Ort' where id='11111111-1111-1111-1111-111111111111';`);
  const row=(await db.query(`select * from company_locations where id='11111111-1111-1111-1111-111111111111'`)).rows[0];
  assert.equal(row.longitude,null);assert.equal(row.latitude,null);assert.equal(row.geocode_status,'pending');assert.equal(row.geocode_retry_at,null);assert.equal(row.geocode_address,'');
 }finally{await db.close();}
});
