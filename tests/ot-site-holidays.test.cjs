const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('../assets/ot-weekend-holiday-policy.js');
const source=fs.readFileSync(require.resolve('../assets/ot-weekend-holiday-policy.js'),'utf8');
const mapping={Leipzig:'SN',Recklinghausen:'NW'};
for(const [date,state,expected] of [['2027-11-01','SN',false],['2027-11-01','NW',true],['2027-11-17','SN',true],['2027-11-17','NW',false],['2027-05-27','SN',false],['2027-05-27','NW',true],['2027-03-08','SN',false],['2027-03-08','NW',false],['2027-01-01','SN',true],['2027-01-02','NW',true]]){
 test('OT calendar '+date+' '+state,()=>assert.equal(api.applies(date,[state]),expected));
}
test('unknown site gets national holidays only and invalid dates fail closed',()=>{
 assert.equal(api.siteState(' Leipzig ',mapping),'SN');assert.equal(api.siteState('Recklinghausen',mapping),'NW');assert.equal(api.siteState('',mapping),'DE');
 assert.equal(api.applies('2027-11-01',[api.siteState('',mapping)]),false);assert.equal(api.applies('2027-02-30',['SN']),false);
});
function browser(){const c={window:{SFCompliance:{policy:{solidPlanningRules:{otHolidayStatesBySite:mapping}}}},document:{readyState:'loading',addEventListener(){}}};vm.runInNewContext(source,c);return c;}
test('calendar uses the shared regional requirement even on an ordinary weekday',()=>{
 let ready,tick;
 const regional={target:3,statesBySite:mapping,weekdayCodes:['OT'],specialCodes:['OT-WE']};
 const c={window:{getSoll:()=>0,SFShiftModels:{requiredSoll:(date,code)=>date==='2027-05-26'&&code==='OT'?3:0},SFCompliance:{policy:{solidPlanningRules:{regionalDayStaffing:regional,otHolidayStatesBySite:mapping}}}},
  document:{readyState:'loading',getElementById:()=>null,addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')ready=fn;}},setInterval:fn=>{tick=fn;return 1;},clearInterval(){}};
 vm.runInNewContext(source,c);ready();tick();
 assert.equal(c.window.getSoll('2027-05-26','OT'),3);
});
test('weekend OT demand cannot fall below the fixed minimum through optional or daily targets',()=>{
 const c=browser();c.window.SFBackend={companyId:'co'};c.sessionStorage={getItem:()=>null};c.TYPES=[];c.globalSoll={OT:1};c.dailySoll={'2027-01-02':{OT:0},'2027-01-03':{OT:1}};c.assignments=[];c.selectedType=null;c.document.getElementById=()=>null;
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/solid-planning-core-v1.js'),'utf8'),c);
 Object.assign(c.window.SFCompliance.policy.solidPlanningRules,{enabled:true,criticalShifts:[{code:'OT',minimum:3,weekdays:[6,7]}]});
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/shift-models-v1.js'),'utf8'),c);
 const m=c.window.SFShiftModels;m.apply([{code:'OT',active:true,default_start:'08:00',default_end:'18:00',optional_weekdays:[6,7],planning_mode:'optional'}],'co');
 assert.equal(m.requiredSoll('2027-01-02','OT',0),3);assert.equal(m.requiredSoll('2027-01-03','OT',1),3);
 c.dailySoll['2027-01-02'].OT=5;assert.equal(m.requiredSoll('2027-01-02','OT',1),5);
 assert.equal(m.requiredSoll('2027-01-04','OT',1),0);
 c.window.SFCompliance.policy.solidPlanningRules={};assert.equal(m.requiredSoll('2027-01-03','OT',1),1,'other company policies keep their own demand');
});
test('holiday eligibility uses employee assignment site while total demand sees both sites',()=>{
 const c=browser(),p=c.window.SFOtPolicy;assert.equal(p.applies('2027-11-01'),true);
 assert.equal(p.applies('2027-11-01',{team:'Leipzig'}),false);assert.equal(p.applies('2027-11-01',{qualifications:['__sp:team=Recklinghausen']}),true);
 assert.equal(p.applies('2027-11-01',{}),false);assert.equal(p.applies('2027-01-02',{team:'Leipzig'}),true);
 delete c.window.SFCompliance.policy.solidPlanningRules.otHolidayStatesBySite;assert.equal(p.applies('2027-03-08'),true);assert.equal(p.configured(),false);
});
test('OT model admits the local holiday, rejects the other site and uses real staffing target',()=>{
 const c=browser();c.window.SFBackend={companyId:'co'};c.sessionStorage={getItem:()=>null};c.TYPES=[];c.globalSoll={OT:3};c.dailySoll={};c.selectedType=null;c.document.getElementById=()=>null;
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/shift-models-v1.js'),'utf8'),c);
 const m=c.window.SFShiftModels;m.apply([{code:'OT',name:'OT',active:true,default_start:'08:00',default_end:'18:00',optional_weekdays:[6,7]}],'co');
 assert.equal(m.rawRequired('2027-11-01','OT',3),3);assert.equal(m.rawRequired('2027-03-08','OT',3),0);
 assert.equal(m.allowsEmployee('OT',{team:'Leipzig',personnelNo:'109'},'2027-11-01'),false);assert.equal(m.allowsEmployee('OT',{team:'Recklinghausen',personnelNo:'109'},'2027-11-01'),true);
 c.dailySoll['2027-11-01']={OT:2};assert.equal(m.rawRequired('2027-11-01','OT',3),2);
});

test('planning respects entry and contract dates including inclusive boundary days',()=>{
 const c=browser();c.window.SFBackend={companyId:'co'};c.sessionStorage={getItem:()=>null};c.TYPES=[];c.selectedType=null;c.document.getElementById=()=>null;
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/shift-models-v1.js'),'utf8'),c);
 const m=c.window.SFShiftModels;m.apply([{code:'FD',name:'FD',active:true,default_start:'06:00',default_end:'14:00'}],'co');
 assert.equal(m.allowsEmployee('FD',{startDate:'2027-01-01'},'2026-12-31'),false);
 assert.equal(m.allowsEmployee('FD',{startDate:'2027-01-01'},'2027-01-01'),true);
 assert.equal(m.allowsEmployee('FD',{contractEnd:'2027-06-30'},'2027-07-01'),false);
 assert.equal(m.allowsEmployee('FD',{contractEnd:'2027-06-30'},'2027-06-30'),true);
 assert.equal(m.allowsEmployee('FD',{start_date:'2027-01-01',contract_end:'2027-06-30'},'2026-12-31'),false);
});

test('holiday exclusion wins over explicit day demand and distinguishes a normal weekday from a holiday',()=>{
 const c=browser();c.window.SFBackend={companyId:'co'};c.sessionStorage={getItem:()=>null};c.TYPES=[];c.selectedType=null;c.globalSoll={OT:3};c.dailySoll={'2027-01-01':{OT2:5}};c.document.getElementById=()=>null;
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/solid-planning-core-v1.js'),'utf8'),c);c.window.SFCompliance.policy.solidPlanningRules={...c.window.SFCompliance.policy.solidPlanningRules,enabled:true,otDayHolidayExclusion:true,otDayHolidayStates:['DE','SN','NW']};
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/shift-models-v1.js'),'utf8'),c);const m=c.window.SFShiftModels;m.apply(['OT1','OT2','OT3','OT'].map(code=>({code,active:true,default_start:'08:00',default_end:'18:00',optional_weekdays:code==='OT'?[6,7]:[1,2,3,4,5]})),'co');
 for(const code of ['OT1','OT2','OT3']){assert.equal(m.requiredSoll('2027-01-01',code,5),0);assert.equal(m.allowsEmployee(code,{team:'Leipzig'},'2027-01-01'),false);}assert.equal(m.requiredSoll('2027-01-01','OT',3),3);assert.equal(m.rawRequired('2027-01-04','OT2',1),1);assert.equal(api.isHoliday('2027-01-02',['DE']),false);assert.equal(api.isHoliday('2027-03-08',['DE','SN','NW']),false);
});


test('daily 9h OT rule keeps all January days at three and remains company-specific',()=>{
 const c=browser();c.window.SFBackend={companyId:'daily'};c.sessionStorage={getItem:()=>null};c.TYPES=[];c.selectedType=null;c.globalSoll={OT:3};c.dailySoll={'2027-01-04':{OT:0}};c.document.getElementById=()=>null;
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/solid-planning-core-v1.js'),'utf8'),c);
 Object.assign(c.window.SFCompliance.policy.solidPlanningRules,{enabled:true,otDailyMinimumStaffing:3,criticalShifts:[{code:'OT',minimum:3,weekdays:[1,2,3,4,5,6,7]}]});
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/shift-models-v1.js'),'utf8'),c);c.window.SFShiftModels.apply([{code:'OT',active:true,default_start:'07:00',default_end:'16:00',optional_weekdays:[1,2,3,4,5,6,7]}],'daily');
 for(let day=1;day<=31;day++){const date='2027-01-'+String(day).padStart(2,'0');assert.equal(c.window.SFOtPolicy.applies(date,{team:'Leipzig'}),true);assert.equal(c.window.SFShiftModels.requiredSoll(date,'OT',3),3,date);assert.equal(c.window.SFShiftModels.rawRequired(date,'OT',3),3,date);}
 assert.equal(c.window.SFOtPolicy.applies('2027-02-30'),false);c.dailySoll['2027-01-04'].OT=5;assert.equal(c.window.SFShiftModels.requiredSoll('2027-01-04','OT',3),5,'higher explicit demand remains visible');
 delete c.window.SFCompliance.policy.solidPlanningRules.otDailyMinimumStaffing;c.window.SFCompliance.policy.solidPlanningRules.criticalShifts=[{code:'OT',minimum:3,weekdays:[6,7]}];assert.equal(c.window.SFOtPolicy.applies('2027-01-04'),false);assert.equal(c.window.SFShiftModels.requiredSoll('2027-01-04','OT',3),0,'ordinary company retains weekend/holiday rule');
});
