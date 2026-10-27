const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../assets/shift-handover-core-v1.js');
const base={kind:'TASK',title:'Kontrolle durchführen',status:'OPEN',critical:false};
test('Critical escalation survives an overdue operational task and excludes completed/carried items',()=>{const rows=[{status:'OPEN',critical:true,due_at:'2026-10-09T08:00Z'},{status:'IN_PROGRESS',critical:false,due_at:'2026-10-09T08:00Z'},{status:'DONE',critical:true,due_at:'2026-10-09T08:00Z'},{status:'CARRIED',critical:true,due_at:'2026-10-09T08:00Z'}];assert.deepEqual(C.stats(rows,Date.parse('2026-10-10T08:00Z')),{open:2,critical:1,done:1});assert.equal(C.overdue({status:'OPEN',due_at:'invalid'}),false);});
test('Critical work needs a real deadline and escalation route; completion needs evidence',()=>{assert.equal(C.validate(base),base);for(const change of [{critical:true},{critical:true,due_at:'invalid',escalation:'Leitung'},{critical:true,due_at:'2026-10-09T08:00Z',escalation:'a'},{status:'DONE'},{title:'aa'},{kind:'UNKNOWN'}])assert.throws(()=>C.validate({...base,...change}));C.validate({...base,critical:true,due_at:'2026-10-09T08:00Z',escalation:'Leitung'});C.validate({...base,status:'DONE',resolution:'Kontrolle erfolgt'});});
const report={id:'r1',state:'APPROVED',version:2,approved_at:'2026-10-10T08:00Z',review_note:'Inhalt geprüft',snapshot:{company:'Testfirma',site:'Leitstelle',shift:'FD',start:'2026-10-09T06:00Z',end:'2026-10-09T14:00Z',as_of:'2026-10-10T07:00Z',planned_people:2,planned_minutes:960,confirmed_people:1,confirmed_minutes:420,time_evidence:'Nur bestätigte Buchungen.',items:[{kind:'TASK',title:'Torkontrolle',status:'CARRIED',detail:'Offenes Tor',critical:true,due_at:'2026-10-09T08:00Z',resolution:''}]}};
test('Exports enforce explicit approval and preserve version, staffing and real evidence separation',()=>{for(const state of ['DRAFT','REJECTED',undefined])assert.throws(()=>C.reportText({...report,state}));assert.throws(()=>C.reportText({...report,approved_at:null}));const text=C.reportText(report);for(const fragment of ['VERSION 2','Berichtskennung: r1','2 Personen · 16 geplante Stunden','1 abgeschlossene Zeitbuchungen · 7 bestätigte Stunden','Planzeiten sind kein Nachweis','Weitergegeben','Inhalt geprüft'])assert.ok(text.includes(fragment),fragment);assert.equal(text.includes('undefined'),false);});
test('HTML content is escaped while downloadable report retains literal text',()=>{assert.equal(C.esc('<img onerror="x">&'), '&lt;img onerror=&quot;x&quot;&gt;&amp;');});


test('overview handover count is read-only, scoped, throttled and discards a previous company response',async()=>{
 const {Window}=await import('happy-dom'),fs=require('node:fs'),w=new Window({url:'https://example.test'});
 try{
  w.document.body.innerHTML='<main><nav id="nav"></nav><section id="view-auto"></section><section id="view-overview" class="active"></section></main>';
  const calls=[];let deferred,delay=false;
  w.SFHandoverCore=C;w.SFBackend={companyId:'one',user:{id:'owner'},role:'OWNER',companyTimeZone:'Europe/Berlin',client:{rpc:async(name,args)=>{calls.push({name,args});if(delay)return new Promise(resolve=>deferred=resolve);return{data:{company_id:args.p_company_id,manager:true,as_of:new Date().toISOString(),boards:[{items:[{id:'open',status:'OPEN'},{id:'done',status:'DONE'}]}]}}}}};
  w.setInterval=()=>0;const later=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>ms>=1000?0:later(fn,ms);
  w.eval(fs.readFileSync('assets/shift-handover-v1.js','utf8'));await w.happyDOM.whenAsyncComplete();
  assert.equal(w.document.getElementById('sfHandoverToday').dataset.openPoints,'1');assert.match(w.document.getElementById('sfHandoverToday').textContent,/Zeitraum.*Stand/);
  assert.equal(calls.length,1);assert.equal(calls[0].name,'shift_handover_bundle');assert.equal(Date.parse(calls[0].args.p_to)-Date.parse(calls[0].args.p_from),7*864e5);
  delay=true;const pending=w.SFHandover.refreshOverview();await Promise.resolve();w.SFBackend.companyId='two';delay=false;await w.SFHandover.refreshOverview();
  deferred({data:{company_id:'one',manager:true,as_of:new Date().toISOString(),boards:[{items:[{id:'old',status:'OPEN'},{id:'old2',status:'OPEN'}]}]}});await pending;
  assert.equal(w.document.getElementById('sfHandoverToday').dataset.openPoints,'1');assert.ok(calls.every(c=>c.name==='shift_handover_bundle'));
  w.SFBackend.client.rpc=async()=>({error:{message:'Unavailable'}});await w.SFHandover.refreshOverview();assert.equal(w.document.getElementById('sfHandoverToday').dataset.openPoints,'');assert.match(w.document.getElementById('sfHandoverToday').textContent,/veraltet/);
 }finally{await w.happyDOM.abort();w.close();}
});
