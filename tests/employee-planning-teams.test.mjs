import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const rhythm=read('assets/employee-rhythm-v1.js');
const pattern='FD, FD, SD, SD, FREI, ND, ND, FREI, FREI, FREI';
const employee=team=>({id:team||'single',first:'Fiktive',last:'Person',personnelNo:team||'S',status:'active',shifts:['FD','SD','ND'],qualifications:['FD','SD','ND'],rhythmMode:'required',rhythmKind:'cycle',rhythmStart:'2026-12-01',rhythmPattern:pattern,planningTeam:team||'',weeklyHours:40,maxWeeklyHours:48});
function harness(){
 const fields={},calls=[],c={window:{SFBackend:{ready:true,companyId:'a',async persistEmployee(draft){calls.push(structuredClone(draft))}}},employees:[],assignments:[],absences:[],document:{readyState:'loading',addEventListener(){},getElementById:id=>fields[id]||null,querySelectorAll:()=>[],querySelector:()=>null},selectedEmployeeId:null,renderPlanEmployeePool(){},updateStats(){},showSaveToast(...args){calls.push(args)},sessionStorage:{getItem:()=>null},saveAll(){calls.push('saveAll')}};
 vm.runInNewContext(rhythm,c);
 const source=read('assets/employee-management-v2.js').replace(/\}\)\(\);\s*$/,"renderList=()=>{};renderProfile=()=>{};window.teamTest={persistMeta,normalizeEmployee,validatePlanningTeam,saveOverview,planningTeamSection};})();");vm.runInNewContext(source,c);
 return{c,fields,calls,api:c.window.teamTest,check:c.window.SFRhythm.check};
}
test('five staggered teams cover all three shifts with four employees every December day',()=>{
 const {check}=harness(),staff=['A','B','C','D','E'].flatMap(t=>Array.from({length:4},()=>employee(t)));
 for(let day=1;day<=31;day++)for(const shift of ['FD','SD','ND'])assert.equal(staff.filter(e=>check(e,shift,`2026-12-${String(day).padStart(2,'0')}`).allowed).length,4,`${day} ${shift}`);
 assert.equal(check(employee('B'),'SD','2026-12-01').index,2);assert.equal(check(employee('D'),'ND','2026-12-01').index,6);
});
test('team free days are binding and the team cycle begins on the real start date',()=>{
 const {check}=harness();assert.equal(check(employee('C'),'FD','2026-12-01').allowed,false);assert.equal(check(employee('C'),'ND','2026-12-02').allowed,true);assert.equal(check(employee('B'),'ND','2026-11-30').mode,'off');assert.match(check(employee('B'),'FD','2026-12-01').reason,/Team B/);
});
test('no team retains the individual phase, and removing a team overrides stored metadata',()=>{
 const {check}=harness(),e=employee();assert.equal(check(e,'FD','2026-12-01').allowed,true);e.qualifications.push('__sp:planningTeam=B');assert.equal(check(e,'FD','2026-12-01').allowed,true);delete e.planningTeam;assert.equal(check(e,'SD','2026-12-01').allowed,true);
});
test('team metadata survives employee hydration and subsequent profile saves',()=>{
 const {api,check}=harness(),e=employee('E');e.team='Objekt Nord';api.persistMeta(e);const hydrated={qualifications:[...e.qualifications],shifts:[...e.shifts],status:'active'};api.normalizeEmployee(hydrated);assert.equal(hydrated.planningTeam,'E');assert.equal(hydrated.team,'Objekt Nord');assert.equal(check(hydrated,'FD','2026-12-01').expected,'FREI');api.persistMeta(hydrated);assert.ok(hydrated.qualifications.includes('__sp:planningTeam=E'));assert.equal(hydrated.qualifications.filter(q=>q.startsWith('__sp:planningTeam=')).length,1);
});
test('team validation allows independent team rhythms and checks cycle type and required permissions',()=>{
 const {api,c}=harness(),e=employee('B'),peer=employee('A');c.employees=[e,peer];assert.equal(api.validatePlanningTeam(e,e),'');assert.equal(api.validatePlanningTeam(e,{...e,rhythmStart:'2026-12-02'}),'');assert.match(api.validatePlanningTeam(e,{...e,rhythmMode:'off'}),/verbindlichen/);assert.match(api.validatePlanningTeam(e,{...e,rhythmKind:'week'}),/Tagesrhythmus/);assert.match(api.validatePlanningTeam({...e,shifts:['FD']},e),/Schichtfreigaben/);peer.deletedAt='2026-10-01';assert.equal(api.validatePlanningTeam(e,{...e,rhythmStart:'2026-12-02'}),'');c.employees=[e];assert.equal(api.validatePlanningTeam(e,{...e,rhythmStart:'2027-01-01'}),'');
});
test('incomplete team settings fail closed without changing legacy unassigned rhythms',()=>{
 const {check}=harness();assert.equal(check({...employee('A'),rhythmStart:''},'FD','2026-12-01').allowed,false);assert.equal(check({...employee(),rhythmStart:''},'FD','2026-12-01').allowed,true);
});
function form(h){for(const [key,value]of Object.entries({spFirst:'Fiktive',spLast:'Person',spPersonnel:'S',spRole:'Sicherheitsmitarbeiter',spTeam:'Objekt Nord',spEmployment:'Vollzeit',spWeekly:'40',spStart:'2026-12-01',spStatus:'active',spEmail:'',spPhone:'',spContactPreference:'email',spNote:'',spAvailabilityStatus:'green',spMaxWeekly:'48'}))h.fields[key]={value,setAttribute(){}};h.fields.spSave={disabled:false,isConnected:true};}
test('failed profile persistence cannot change a team locally or invalidate a valid plan',async()=>{
 const h=harness(),e=employee();h.c.employees=[e];form(h);h.c.window.SFBackend.persistEmployee=async()=>{throw Error('offline')};await h.api.saveOverview(e,false,{planningTeam:'B'});assert.equal(e.planningTeam,'');assert.equal(h.fields.spSave.disabled,false);assert.equal(h.c.window.SFBackend.employeeStatusSaving,false);
});
test('successful profile persistence saves the team with company scoped employee data and clears obsolete previews',async()=>{
 const h=harness(),e=employee();h.c.employees=[e];form(h);h.c.window.clearAutoPlanPreview=()=>h.calls.push('clearPreview');await h.api.saveOverview(e,false,{planningTeam:'B'});assert.equal(e.planningTeam,'B');assert.ok(h.calls[0].qualifications.includes('__sp:planningTeam=B'));assert.ok(h.calls.includes('clearPreview'));assert.equal(e.team,'Objekt Nord');
});
