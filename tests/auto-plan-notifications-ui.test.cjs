const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('named multiple recipients survive refresh, are sent with a normal start and clear on company switch',async()=>{const {Window}=await import('happy-dom'),w=new Window({url:'https://example.test'});try{
 w.document.body.innerHTML='<section id="view-auto"><input id="autoPlanMonth" value="2027-02"><div class="sf-auto-start"></div></section>';
 const calls=[],choices=[{user_id:'a',name:'Admin <img src=x>',role:'ADMIN',access_role:'ADMIN',push_enabled:true},{user_id:'t',name:'Teamleiter',role:'PLANNER',access_role:'TEAM_LEAD',push_enabled:false}],config={enabled:false,mode:'PREVIEW',run_day:20,run_time:'06:00',lead_months:1,month_count:1,on_changes:false,history_months:3,revision:0};let run=null;
 w.SFBackend={ready:true,user:{id:'a'},companyId:'one',role:'OWNER',client:{rpc:async(name,args)=>{calls.push(args);if(args.p_action==='RUN')run={id:'new',source:'MANUAL',first_month:args.p_month,status:'QUEUED'};return{data:{config,can_edit:true,runs:run?[run]:[],notifications:{choices:args.p_company_id==='one'?choices:[],selected:[]}}};}}};
 w.SFAutoPlanWorkspace={render(){}};w.setInterval=()=>0;const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>ms===10000||ms===5000?0:timeout(fn,ms);w.eval(fs.readFileSync('assets/autonomous-planning-v1.js','utf8'));w.SFAutonomousPlanning.render();await w.happyDOM.whenAsyncComplete();
 const panel=w.document.getElementById('sfAutoPlanNotifications');assert.match(panel.textContent,/Admin <img src=x>/);assert.equal(panel.querySelector('img'),null);assert.match(panel.textContent,/Push bisher nicht aktiviert/);
 for(const input of panel.querySelectorAll('input')){input.checked=true;input.dispatchEvent(new w.Event('change',{bubbles:true}));}
 await w.SFAutonomousPlanning.load(true);assert.equal(w.document.querySelectorAll('#sfAutoPlanNotifications input:checked').length,2);
 await w.SFAutonomousPlanning.runSelectedMonth();assert.equal(JSON.stringify(calls.find(c=>c.p_action==='RUN').p_config.notify_user_ids),JSON.stringify(['a','t']));
 w.SFBackend.companyId='two';w.SFAutonomousPlanning.render();await w.happyDOM.whenAsyncComplete();assert.doesNotMatch(w.document.getElementById('sfAutoPlanNotifications').textContent,/Teamleiter/);assert.equal(w.document.querySelectorAll('#sfAutoPlanNotifications input:checked').length,0);
 w.SFBackend.role='EMPLOYEE';w.SFAutonomousPlanning.render();assert.equal(w.document.getElementById('sfAutoPlanNotifications'),null);
 }finally{await w.happyDOM.abort();w.close();}});
test('completion links select the exact month/proposal and an aborted company switch clears pending routing',async()=>{const {Window}=await import('happy-dom'),w=new Window({url:'https://example.test'});try{
 w.document.body.innerHTML='<section id="view-auto"><input id="autoPlanMonth" value="2027-01"><div class="sf-auto-start"></div></section>';const opened=[],calls=[];
 w.SFBackend={ready:true,user:{id:'owner'},companyId:'one',role:'OWNER',switchCompany:async()=>false,client:{rpc:async(name,args)=>{calls.push(args);return {data:args.p_action==='RESULT'?{id:'job'}:{runs:[{id:'exact-run',first_month:'2027-03-01',status:'READY',summary:{canApply:true}}]}};}}};
 w.SFAutoPlanWorkspace={render(){}};w.SFMonthOptimizer={restoreBackground:async(job,internal,check)=>opened.push({id:job.id,canApply:check.canApply})};w.setInterval=()=>0;w.eval(fs.readFileSync('assets/autonomous-planning-v1.js','utf8'));
 assert.equal(await w.SFAutonomousPlanning.openNotification({id:'note',entity_id:'exact-run',metadata:{company_id:'one',first_month:'2027-03-01',status:'READY'}}),true);
 assert.equal(w.document.getElementById('autoPlanMonth').value,'2027-03');assert.equal(calls.find(c=>c.p_action==='RESULT').p_run_id,'exact-run');assert.equal(JSON.stringify(opened),JSON.stringify([{id:'job',canApply:true}]));
 await w.SFAutonomousPlanning.openNotification({id:'other-note',entity_id:'foreign-run',metadata:{company_id:'two',first_month:'2027-04-01',status:'READY'}});
 assert.equal(w.sessionStorage.getItem('sf_pending_push_notification'),null);assert.equal(w.sessionStorage.getItem('sf_pending_push_view'),null);assert.equal(opened.length,1);
 }finally{await w.happyDOM.abort();w.close();}});
test('a dual-role employee session follows a management URL and never elevates its own client role',async()=>{const {Window}=await import('happy-dom'),w=new Window({url:'https://example.test/?bereich=mitarbeiter'});try{
 const navigations=[];w.location.assign=url=>navigations.push(url);w.SFBackend={ready:true,user:{id:'lead'},companyId:'one',role:'EMPLOYEE',client:{rpc:async()=>{throw Error('must reauthenticate workspace first')}}};w.setInterval=()=>0;w.eval(fs.readFileSync('assets/autonomous-planning-v1.js','utf8'));
 assert.equal(await w.SFAutonomousPlanning.openNotification({id:'note',entity_id:'run',metadata:{company_id:'one',status:'READY'}}),false);
 const url=new URL(navigations[0]);assert.equal(url.origin,'https://example.test');assert.equal(url.searchParams.get('bereich'),'verwaltung');assert.equal(url.searchParams.get('sf_push_notification'),'note');assert.equal(w.SFBackend.role,'EMPLOYEE');
 }finally{await w.happyDOM.abort();w.close();}});
