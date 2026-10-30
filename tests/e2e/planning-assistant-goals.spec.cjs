const {test,expect}=require('@playwright/test'),fs=require('fs'),path=require('path'),{html,root}=require('../browser/planning-assistant-fixture.cjs');
test.use({launchOptions:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE?{executablePath:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE}:{}});
const last=p=>p.locator('#sfPlanningChatLog .is-answer').last();
async function setup(page,db={rows:[]},demo=false){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname!=='sf-assistant.test')return r.abort();if(u.pathname==='/goal-api'){
  const q=r.request().postDataJSON(),match=row=>row.company_id===q.company&&row.owner_id===q.owner&&q.filters.every(([k,v])=>row[k]===v);let data,error=null;
  if(q.op==='insert'){const date=new Date().toISOString();data={id:'00000000-0000-0000-0000-'+String(db.rows.length+1).padStart(12,'0'),company_id:q.company,owner_id:q.owner,config:q.values.config,status:'ready',state:{},basis:null,run_token:null,lease_until:null,version:1,created_at:date,updated_at:date};db.rows.push(data);}
  else if(q.op==='select')data=db.rows.filter(match).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
  else if(db.failUpdates)error={message:'Testverbindung unterbrochen'};
  else{const i=db.rows.findIndex(match);data=null;if(i>=0){const old=db.rows[i];if(q.op==='delete'){db.rows.splice(i,1);data={id:old.id};}else if(old.status==='running'&&Date.parse(old.lease_until)>Date.now()&&q.values.run_token&&old.run_token!==q.values.run_token)error={message:'Auftrag wird bereits bearbeitet'};else{data={...old,...q.values,version:old.version+1,updated_at:new Date().toISOString()};if(data.status==='running')data.lease_until=new Date(Date.now()+150000).toISOString();else{data.lease_until=null;data.run_token=null;}db.rows[i]=data;}}}
  return r.fulfill({contentType:'application/json',body:JSON.stringify({data,error})});
 }
 if(u.pathname==='/qa-run.js')return r.fulfill({body:''});if(u.pathname.startsWith('/assets/')){const file=path.join(root,u.pathname),type={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf'}[path.extname(file)]||'application/octet-stream';return r.fulfill({contentType:type,body:fs.readFileSync(file)});}return r.fulfill({contentType:'text/html',body:html});});
 await page.goto('http://sf-assistant.test/');await page.evaluate(isDemo=>{
  if(isDemo)sessionStorage.setItem('sf_demo_session_v1','active');
  assignments=[];absences=[];globalSoll={FD:0,SD:0,ND:0};dailySoll={'2026-12-05':{FD:1}};
  employees=employees.slice(0,2).map(e=>({...e,planningTeam:undefined,role:'Operator',employment:'Teilzeit',monthlyHours:8,weeklyHours:40,shifts:['FD'],qualifications:['__sp:monthlyHours=8']}));
  SFCompliance.policy.solidPlanningRules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxConsecutiveNightShifts:4,minRestHours:11};
  const hash=value=>{let h=2166136261;for(const c of JSON.stringify(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
  SFBackend.client={from:()=>{const q={op:'select',filters:[],values:null},builder={select(){return this},eq(k,v){q.filters.push([k,v]);return this},order(){return this},limit(){return this},insert(values){q.op='insert';q.values=values;return this},update(values){q.op='update';q.values=values;return this},delete(){q.op='delete';return this},single(){return this},maybeSingle(){return this},then(resolve,reject){return fetch('/goal-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...q,company:SFBackend.companyId,owner:SFBackend.user.id})}).then(r=>r.json()).then(resolve,reject)}};return builder;},rpc:async(name,args)=>{
   if(name!=='preview_planning_assistant_order')return {error:{message:'Unexpected planning mutation: '+name}};
   if(window.__holdGoalPreview){window.__holdGoalPreview=false;await new Promise(r=>window.__releaseGoal=r);}
   const fingerprint='basis-'+hash([args.p_company_id,assignments,employees,SFCompliance.policy.solidPlanningRules]);return {data:{fingerprint,planningFingerprint:'period-'+hash(assignments),protectedIds:[]},error:null};
  }};
 },demo);
 await page.getByRole('button',{name:'Planungsassistent',exact:true}).click();return errors;
}
async function ask(page,q){await page.locator('#sfPlanningChatInput').fill(q);await page.getByRole('button',{name:'Frage senden'}).click();await expect(page.locator('#sfPlanningChatProgress')).toBeHidden();}
async function start(page,goal='both'){await ask(page,'Bereite Dezember 2026 vor, schließe Lücken und verteile die Stunden fair');await expect(last(page).locator('form[data-kind="goalOrder"]')).toBeVisible();await last(page).locator('select[name=goal]').selectOption(goal);await last(page).getByRole('button',{name:'Auftrag starten',exact:true}).click();}
async function settled(page){await expect(page.locator('#sfPlanningChatProgress')).toBeHidden({timeout:30000});}
async function clean(page,errors){expect(await page.evaluate(()=>__writes)).toBe(0);expect(errors).toEqual([]);expect(await page.evaluate(()=>__errors)).toEqual([]);}
test('goal orders evaluate strategies, persist a receipt and require confirmation before any duty write',async({page})=>{
 const db={rows:[]},errors=await setup(page,db);await start(page);await settled(page);await expect(last(page).locator('.sf-chat-goal-receipt')).toContainText('Gespeicherter Auftrag');await expect(last(page).getByRole('button',{name:'Vorschläge als Entwurf übernehmen',exact:true})).toBeVisible();await expect(last(page)).toContainText('0');expect(db.rows).toHaveLength(1);expect(db.rows[0].status).toBe('awaiting_approval');expect(db.rows[0].state.steps.length).toBeGreaterThan(0);expect(db.rows[0].state.latest.open).toBe(0);expect(JSON.stringify(db.rows[0].state)).not.toMatch(/first|last|note|proposed|assignments/);await clean(page,errors);
});
test('another device resumes saved decisions; changed policy reopens their basis',async({page,context})=>{
 const db={rows:[]},errors=await setup(page,db);await start(page);await settled(page);await last(page).getByRole('button',{name:'Übernahme zurückstellen',exact:true}).click();await settled(page);await expect(last(page).getByRole('button',{name:'Übernahme wieder zur Prüfung öffnen'})).toBeVisible();const other=await context.newPage(),otherErrors=await setup(other,db);await ask(other,'Setze meinen Dezember-Auftrag fort');await settled(other);await expect(last(other).getByRole('button',{name:'Übernahme wieder zur Prüfung öffnen'})).toBeVisible();await expect(last(other).getByRole('button',{name:'Vorschläge als Entwurf übernehmen',exact:true})).toHaveCount(0);expect(db.rows[0].state.decisions.some(d=>d.key==='proposal')).toBe(true);
 await other.evaluate(()=>SFCompliance.policy.solidPlanningRules.maxConsecutiveShifts=3);await ask(other,'Setze meinen Dezember-Auftrag fort');await settled(other);await expect(last(other).getByRole('button',{name:'Vorschläge als Entwurf übernehmen',exact:true})).toBeVisible();expect(db.rows[0].state.decisions).toHaveLength(0);await clean(other,otherErrors);await clean(page,errors);
});
test('active run leases prevent another device starting the same order; cancellation persists',async({page,context})=>{
 const db={rows:[]},errors=await setup(page,db);await page.evaluate(()=>window.__holdGoalPreview=true);await start(page,'coverage');await expect.poll(()=>db.rows[0]?.status).toBe('running');await expect.poll(()=>page.evaluate(()=>typeof window.__releaseGoal==='function')).toBe(true);const other=await context.newPage(),otherErrors=await setup(other,db);await ask(other,'Meine Planungsaufträge');await expect(last(other).getByRole('button',{name:'Auftrag ist noch reserviert'})).toBeDisabled();await page.getByRole('button',{name:'Planungsauftrag abbrechen',exact:true}).click();await page.evaluate(()=>window.__releaseGoal());await settled(page);await expect(last(page)).toContainText('Auftrag angehalten');expect(db.rows[0].status).toBe('paused');await ask(other,'Meine Planungsaufträge');await expect(last(other).getByRole('button',{name:'Auftrag fortsetzen',exact:true})).toBeEnabled();await clean(other,otherErrors);await clean(page,errors);
});
test('company changes discard an in-flight goal result and do not expose the old receipt',async({page})=>{
 const db={rows:[]},errors=await setup(page,db);await page.evaluate(()=>window.__holdGoalPreview=true);await start(page);await expect.poll(()=>db.rows[0]?.status).toBe('running');await expect.poll(()=>page.evaluate(()=>typeof window.__releaseGoal==='function')).toBe(true);await page.evaluate(()=>SFBackend.companyId='other-company');await expect(page.locator('#sfPlanningChat')).toBeHidden();await page.evaluate(()=>window.__releaseGoal());await page.waitForTimeout(500);await expect(page.locator('#sfPlanningChatLog')).toBeEmpty();expect(db.rows).toHaveLength(1);expect(db.rows[0].company_id).toBe('test-company');await clean(page,errors);
});
test('after a confirmed demo apply the goal independently rechecks the stored plan',async({page})=>{
 const errors=await setup(page,{rows:[]},true);await start(page,'coverage');await settled(page);await last(page).getByRole('button',{name:'Vorschläge als Entwurf übernehmen',exact:true}).click();await page.getByRole('button',{name:'Jetzt als Entwurf übernehmen',exact:true}).click();await expect(last(page).locator('.sf-chat-goal-receipt')).toContainText('Ziel im geprüften Plan erreicht',{timeout:30000});expect(await page.evaluate(()=>__writes)).toBe(1);expect(await page.evaluate(()=>assignments.length)).toBe(1);expect(errors).toEqual([]);expect(await page.evaluate(()=>__errors)).toEqual([]);
});
test('metadata save failures show an explicit failure and never offer an unpersisted proposal',async({page})=>{
 const db={rows:[],failUpdates:true},errors=await setup(page,db);await start(page);await settled(page);await expect(last(page)).toContainText('Testverbindung unterbrochen');await expect(last(page).getByRole('button',{name:'Vorschläge als Entwurf übernehmen',exact:true})).toHaveCount(0);expect(db.rows[0].status).toBe('ready');await clean(page,errors);
});
