import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const row=(team='A',pattern=['FD','FREI'],offset=0)=>({team_code:team,start_date:'2026-12-01',pattern,start_offset:offset});
function harness(){
 const calls=[],c={window:{SFBackend:{ready:true,role:'OWNER',companyId:'one',client:{async rpc(name,args){calls.push({name,args});return{data:row(args.p_team_code,args.p_pattern,args.p_start_offset)}}}}},employees:[{id:'a',planningTeam:'A',status:'active',shifts:['FD','SD','ND'],rhythmStart:'2026-12-01',rhythmPattern:'FD,FD,SD,SD,FREI,ND,ND,FREI,FREI,FREI'}],TYPES:['FD','SD','ND'].map(id=>({id})),sessionStorage:{getItem:()=>null},document:{},setTimeout,clearTimeout};
 vm.createContext(c);vm.runInContext(read('assets/employee-rhythm-v1.js'),c);vm.runInContext(read('assets/planning-teams-v1.js'),c);const m=c.window.SFPlanningTeams;m.apply([row()], 'one');return{c,m,calls,r:c.window.SFRhythm,b:c.window.SFBackend};
}
test('each team has its own start, pattern and phase; unassigned staff retain their rule',()=>{
 const {c,m,r}=harness();m.apply([row('A',['ND','FREI'],1),{...row('B',['SD','SD','FREI']),start_date:'2027-01-01'}],'one');
 assert.equal(r.check(c.employees[0],'ND','2026-12-01').expected,'FREI');assert.equal(r.check(c.employees[0],'ND','2026-12-02').allowed,true);
 const b={...c.employees[0],planningTeam:'B'};assert.equal(r.check(b,'FD','2026-12-01').mode,'off');assert.equal(r.check(b,'SD','2027-01-01').allowed,true);
 assert.equal(r.check({...b,planningTeam:'',rhythmMode:'required'},'FD','2026-12-01').allowed,true);
 assert.equal(r.config({...b,planningTeam:'C'}).offset,4);
});
test('a company change immediately isolates rules and editing rights, including demo mode',()=>{
 const {c,m,b}=harness();b.companyId='two';assert.equal(m.get('A'),null);assert.equal(m.canManage(),false);m.apply([row('A',['SD'])],'two');assert.equal(m.get('A').pattern[0],'SD');b.role='VIEWER';assert.equal(m.canManage(),false);c.sessionStorage.getItem=()=> 'active';assert.equal(m.get('A'),null);
});
test('save validates permissions, dates, length and phase before calling the server',()=>{
 const {c,m}=harness(),valid={team:'A',start:'2026-12-01',pattern:['FD','FREI'],offset:1};assert.equal(m.validate(valid).offset,1);
 for(const rule of [{...valid,start:'2026-02-30'},{...valid,team:'F'},{...valid,offset:2},{...valid,offset:-1},{...valid,pattern:[]},{...valid,pattern:['UNKNOWN']},{...valid,pattern:Array(366).fill('FREI')}])assert.throws(()=>m.validate(rule));
 c.employees[0].shifts=['FD'];assert.throws(()=>m.validate({...valid,pattern:['ND'],offset:0}),/Schichtfreigaben/);c.employees[0].deletedAt='2026-10-01';assert.equal(m.validate({...valid,pattern:['ND'],offset:0}).pattern[0],'ND');
});
test('successful central save updates all members dynamically, invalidates preview and leaves staff/services unchanged',async()=>{
 const {c,m,b,r,calls}=harness(),before=JSON.stringify(c.employees);let clears=0;c.window.clearAutoPlanPreview=()=>clears++;c.employees.push({...c.employees[0],id:'a2'});
 const actualBefore=JSON.stringify(c.employees);await m.save({team:'A',start:'2026-12-01',pattern:['ND','FREI'],offset:0});
 assert.equal(calls[0].name,'manager_save_planning_team');assert.equal(calls[0].args.p_company_id,'one');assert.equal(JSON.stringify(c.employees),actualBefore);assert.equal(clears,1);assert.equal(b.teamRhythmSaving,false);for(const e of c.employees)assert.equal(r.check(e,'ND','2026-12-01').allowed,true);assert.ok(before);
});
test('failed saves and concurrent changes cannot replace a previous rule',async()=>{
 const {m,b,calls}=harness(),valid={team:'A',start:'2026-12-01',pattern:['ND'],offset:0};b.client.rpc=async()=>({error:Error('offline')});await assert.rejects(m.save(valid),/offline/);assert.equal(m.get('A').pattern[0],'FD');assert.equal(b.teamRhythmSaving,false);
 for(const key of ['syncing','companySwitching','employeeStatusSaving','shiftModelSaving','autoPlanApplying','schedulePublishing']){b[key]=true;await assert.rejects(m.save(valid),/gespeichert/);b[key]=false;}assert.equal(calls.length,0);
});
test('pending general sync finishes before the team saving guard is raised',async()=>{
 const {m,b}=harness();b.syncTimer=setTimeout(()=>{},1000);let synced=false;b.sync=async()=>{assert.ok(!b.teamRhythmSaving);synced=true};await m.save({team:'A',start:'2026-12-01',pattern:['FD'],offset:0});assert.equal(synced,true);assert.equal(b.syncTimer,null);
});
test('hydration, cache versions, company switching and audited database policies include central teams',()=>{
 const db=read('assets/supabase-data-v1.js'),migration=read('supabase/migrations/20261001053613_company_planning_team_rhythms.sql');assert.match(db,/from\('company_planning_teams'\).*eq\('company_id',B.companyId\)/);assert.match(db,/SFPlanningTeams\?\.apply\(ptr.data/);assert.match(read('assets/company-switcher-v1.js'),/teamRhythmSaving/);assert.match(read('index.html'),/planning-teams-v1.js\?v=20261004-fd-split1/);assert.match(migration,/ENABLE ROW LEVEL SECURITY/);assert.match(migration,/SECURITY INVOKER/);assert.match(migration,/private.capture_audit_change/);assert.doesNotMatch(migration,/UPDATE public.employees|UPDATE public.shift_assignments/);
});
