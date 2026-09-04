import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const originalEnv={...process.env};
const originalFetch=global.fetch;
process.env.DEMO_SESSION_SECRET='demo-analytics-test-session-secret';
process.env.SUPABASE_URL='https://project.test';
process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
process.env.DEMO_ANALYTICS_INGEST_SECRET='test-ingestion-secret-with-enough-entropy';
const require=createRequire(import.meta.url);
const analyticsHandler=require('../api/demo-analytics.js');
const authHandler=require('../api/demo-auth.js');
const page=fs.readFileSync(new URL('../demo.html',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../assets/demo-analytics-v1.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260904163440_anonymous_demo_usage.sql',import.meta.url),'utf8');

function response(){
  const headers=new Map();
  return {statusCode:200,body:'',setHeader(key,value){headers.set(key.toLowerCase(),value)},getHeader(key){return headers.get(key.toLowerCase())},end(value=''){this.body=value}};
}

async function call(body,cookie='',extraHeaders={}){
  const req={method:'POST',body,headers:{host:'example.test',origin:'https://example.test','x-forwarded-proto':'https',cookie,...extraHeaders},socket:{}};
  const res=response();await analyticsHandler(req,res);return res;
}

test.after(()=>{process.env=originalEnv;global.fetch=originalFetch});

test('protected demo loads the anonymous analytics client and visible explanation',()=>{
  assert.match(page,/demo-analytics-v1\.js/);
  assert.match(client,/Anonyme Demo-Auswertung/);
  assert.match(client,/tägliche Summen/);
  assert.match(client,/Keine Namen, Eingaben, Suchbegriffe, Freitexte/);
  assert.match(client,/Keine Besucher-, Geräte- oder dauerhaften Sitzungskennungen/);
});

test('database stores only daily aggregate allowlisted counters',()=>{
  assert.match(migration,/demo_metrics_private\.demo_usage_daily/);
  assert.match(migration,/event_count bigint/);
  assert.match(migration,/primary key \(usage_day, event_name, event_value\)/);
  assert.match(migration,/security invoker/);
  assert.match(migration,/enable row level security/);
  assert.doesNotMatch(migration,/visitor_id|session_id|ip_address|user_agent|occurred_at/);
});

test('analytics endpoint requires a valid protected demo session',async()=>{
  const res=await call({event:'area_opened',value:'schedule'});
  assert.equal(res.statusCode,401);
  assert.equal(JSON.parse(res.body).code,'expired');
});

test('analytics endpoint forwards only an allowlisted category and no visitor data',async()=>{
  const token=authHandler._test.token({kind:'access',exp:Date.now()+60_000});
  const cookie=`${authHandler._test.ACCESS_COOKIE}=${encodeURIComponent(token)}`;
  let forwarded;
  global.fetch=async(url,options)=>{forwarded={url,options};return {ok:true,status:204}};
  const res=await call({event:'scenario_selected',value:'vacation'},cookie);
  assert.equal(res.statusCode,204);
  assert.equal(forwarded.url,'https://project.test/rest/v1/rpc/record_demo_usage');
  const payload=JSON.parse(forwarded.options.body);
  assert.deepEqual({event:payload.p_event_name,value:payload.p_event_value},{event:'scenario_selected',value:'vacation'});
  assert.ok(payload.p_ingest_secret);
  assert.equal('visitor' in payload,false);
  assert.equal('session' in payload,false);
});

test('analytics endpoint rejects free text, unknown categories and extra fields',async()=>{
  const token=authHandler._test.token({kind:'access',exp:Date.now()+60_000});
  const cookie=`${authHandler._test.ACCESS_COOKIE}=${encodeURIComponent(token)}`;
  assert.equal((await call({event:'area_opened',value:'Anna Becker'},cookie)).statusCode,400);
  assert.equal((await call({event:'area_opened',value:'schedule',note:'private input'},cookie)).statusCode,400);
  assert.equal((await call({event:'unknown',value:'overview'},cookie)).statusCode,400);
});
