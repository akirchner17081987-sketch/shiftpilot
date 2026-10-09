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
