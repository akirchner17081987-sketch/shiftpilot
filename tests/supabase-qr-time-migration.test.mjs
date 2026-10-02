import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260908000043_qr_time_tracking_v1.sql',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../qr-time.html',import.meta.url),'utf8');

const has=(pattern,message)=>assert.match(sql,pattern,message);

test('QR time tracking creates terminal and append-only punch tables',()=>{
  has(/create table if not exists public\.time_qr_terminals/i,'terminal table missing');
  has(/create table if not exists public\.time_qr_punches/i,'punch table missing');
  has(/punch_type text not null check \(punch_type in \('CLOCK_IN','CLOCK_OUT'\)\)/i,'punch types must be constrained');
});

test('QR tables are RLS protected and not directly exposed',()=>{
  has(/alter table public\.time_qr_terminals enable row level security/i,'terminal RLS missing');
  has(/alter table public\.time_qr_punches enable row level security/i,'punch RLS missing');
  has(/revoke all on table public\.time_qr_terminals from public, anon, authenticated/i,'terminal direct grants must be revoked');
  has(/revoke all on table public\.time_qr_punches from public, anon, authenticated/i,'punch direct grants must be revoked');
});

test('employee identity and timestamp are resolved server-side',()=>{
  has(/v_employee := private\.sf_employee_id\(\)/i,'employee must come from authenticated account mapping');
  has(/v_now timestamptz := clock_timestamp\(\)/i,'server time must drive punches');
  has(/auth\.uid\(\),\s*'CLOCK_IN',\s*v_now/i,'clock-in must use auth uid and server time');
  has(/auth\.uid\(\),\s*'CLOCK_OUT',\s*v_now/i,'clock-out must use auth uid and server time');
});

test('QR tokens are high entropy and stored only as hashes',()=>{
  has(/extensions\.gen_random_bytes\(32\)/i,'terminal token must have 256 bits of entropy');
  has(/token_hash bytea not null unique/i,'only token hash should be persisted');
  has(/extensions\.digest\(v_token,'sha256'\)/i,'created token must be hashed');
  assert.doesNotMatch(sql,/\btoken text\b[\s\S]*create table if not exists public\.time_qr_terminals/i,'terminal table must not contain plaintext token');
});

test('security definer QR functions use a fixed empty search path and explicit grants',()=>{
  for(const fn of ['private.sf_qr_time_context','public.employee_qr_time_status','public.employee_clock_from_qr','public.manager_create_time_qr_terminal','public.manager_list_time_qr_terminals','public.manager_rotate_time_qr_terminal','public.manager_set_time_qr_terminal_active']){
    const escaped=fn.replaceAll('.','\\.');
    assert.match(sql,new RegExp(`create or replace function ${escaped}[\\s\\S]{0,500}?security definer[\\s\\S]{0,80}?set search_path = ''`,'i'),`${fn} must pin search_path`);
  }
  has(/grant execute on function public\.employee_qr_time_status\(text\) to authenticated/i,'status RPC grant missing');
  has(/grant execute on function public\.employee_clock_from_qr\(text,text\) to authenticated/i,'clock RPC grant missing');
});

test('QR booking protects closed months and duplicate/stale submissions',()=>{
  has(/private\.sf_is_time_month_closed/i,'month closure check missing');
  has(/pg_advisory_xact_lock/i,'concurrent scans must be serialized');
  has(/interval '20 seconds'/i,'rapid duplicate scans must be rejected');
  has(/p_expected_action/i,'client must confirm the server-derived action');
});

test('mobile QR page does not accept employee id or timestamp from the browser',()=>{
  assert.match(html,/functions\/v1\/qr-independent/,'independent QR function is used by scan page');
  assert.match(html,/personnelNo:/,'personnel number is supplied for the separate login');
  assert.match(html,/startDate:/,'entry date is supplied for the separate login');
  assert.doesNotMatch(html,/p_employee_id\s*:/i,'browser must never supply employee id');
  assert.doesNotMatch(html,/p_actual_(start|end)\s*:/i,'browser must never supply actual timestamps');
  assert.match(html,/Arbeitszeit beginnen/,'clock-in confirmation missing');
  assert.match(html,/Arbeitszeit beenden/,'clock-out confirmation missing');
  assert.match(html,/Pause beginnen/);
  assert.match(html,/Pause beenden/);
});

function qrLoginHarness(status={state:'READY',name:'Fiktiver Mitarbeiter',breaks:[]}){
  const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,textContent:'',addEventListener(event,handler){this[event]=handler},replaceChildren(){},append(){}});return elements.get(id)};
  const requests=[];
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script,{document:{getElementById:get,querySelectorAll:()=>[],createElement:()=>({append(){}})},location:{search:'?t='+'0'.repeat(64)},URLSearchParams,Intl,Date,Number,fetch:async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);return{ok:true,json:async()=>body.action==='LOGIN'?{ok:true,sessionToken:'test-session'}:{ok:true,...status}}}});
  return{get,requests,submit:()=>get('login').submit({preventDefault(){}})};
}
test('QR login accepts the eight-digit joining date and sends its original ISO date',async()=>{
  const h=qrLoginHarness();h.get('personnel').value='TEST-1001';h.get('startDate').value='16102024';await h.submit();
  assert.equal(h.requests[0].action,'LOGIN');assert.equal(h.requests[0].startDate,'2024-10-16');assert.equal(h.requests[0].personnelNo,'TEST-1001');
  assert.equal(h.requests[1].action,'STATUS');assert.equal(h.get('startDate').value,'');assert.equal(h.get('login').hidden,true);
  assert.match(html,/inputmode="numeric"[^>]*placeholder="TTMMJJJJ"[^>]*pattern="\[0-9\]\{8\}"[^>]*maxlength="8"/);
});
test('QR login validates calendar dates without any requests for invalid entries',async()=>{
  for(const entered of ['161024','16.10.2024','31042024','29022023','00000000']){
    const h=qrLoginHarness();h.get('startDate').value=entered;await h.submit();assert.equal(h.requests.length,0,entered);assert.ok(h.get('message').textContent);
  }
  const h=qrLoginHarness();h.get('startDate').value='29022024';await h.submit();assert.equal(h.requests[0].startDate,'2024-02-29');
});

test('QR pause controls allow pauses six through ten and stop after ten',async()=>{
  for(const count of [5,6,9,10]){
    const status={state:'RUNNING',name:'Fixture',breaks:Array.from({length:count},(_,i)=>({number:i+1}))};
    const h=qrLoginHarness(status);h.get('startDate').value='16102024';await h.submit();
    assert.equal(h.get('pauseStart').hidden,count===10);assert.equal(h.get('end').hidden,false);
  }
  const h=qrLoginHarness({state:'BREAK',breaks:Array.from({length:10},(_,i)=>({number:i+1}))});
  h.get('startDate').value='16102024';await h.submit();assert.equal(h.get('pauseEnd').hidden,false);assert.equal(h.get('end').hidden,false);
});

test('time-only QR report renders all ten pause pairs',async()=>{
  const fields=new Map(),field=id=>{if(!fields.has(id))fields.set(id,{});return fields.get(id)};
  const card={querySelector:field},view={classList:{contains:()=>false}};
  const rows=[{id:'fixture',employee_name:'Fixture',personnel_no:'TEST',started_at:'2026-09-29T18:00:00Z',ended_at:'2026-09-30T04:00:00Z',paid_minutes:600,pause_minutes:60,
    breaks:Array.from({length:10},(_,i)=>({number:i+1,started_at:'2026-09-29T20:00:00Z',ended_at:'2026-09-29T20:06:00Z'}))}];
  const B={role:'TIME_TRACKING',companyId:'fixture-company',client:{rpc:async()=>({data:rows})}};
  vm.runInNewContext(fs.readFileSync(new URL('../assets/qr-independent-report-v1.js',import.meta.url),'utf8'),{window:{SFBackend:B},document:{getElementById:id=>id==='view-time'?view:card,addEventListener(){}},setTimeout(){},Intl,Date,Number,console});
  await B.qrIndependentReport.refresh();
  const output=field('#sfQrReportRows').innerHTML;
  for(let i=1;i<=10;i++)assert.ok(output.includes('<td>Pause '+i+'</td>'));
  assert.match(output,/10 Std\./);assert.match(output,/10 Pausen/);
});
