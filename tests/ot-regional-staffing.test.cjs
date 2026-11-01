const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const P=require('../assets/ot-regional-staffing-core-v1.js');
const config={target:3,statesBySite:{Leipzig:'SN',Recklinghausen:'NW'},weekdayCodes:['OT1','OT2','OT3'],specialCodes:['OT-WE']};
test('normal weekday and weekend select distinct shifts',()=>{
  for(const site of ['Leipzig','Recklinghausen']){
    assert.equal(P.allowed('2027-05-26',site,'OT1',config),true);
    assert.equal(P.allowed('2027-05-26',site,'OT-WE',config),false);
    assert.equal(P.allowed('2027-05-29',site,'OT-WE',config),true);
    assert.equal(P.allowed('2027-05-29',site,'OT2',config),false);
  }
});
test('regional holidays affect only the relevant site',()=>{
  assert.equal(P.allowed('2027-05-27','Recklinghausen','OT-WE',config),true);
  assert.equal(P.allowed('2027-05-27','Leipzig','OT3',config),true);
  assert.equal(P.allowed('2027-11-17','Leipzig','OT-WE',config),true);
  assert.equal(P.allowed('2027-11-17','Recklinghausen','OT2',config),true);
});
test('common holiday uses the special shift at both locations',()=>{
  assert.equal(P.allowed('2027-01-01','Leipzig','OT-WE',config),true);
  assert.equal(P.allowed('2027-01-01','Recklinghausen','OT-WE',config),true);
  assert.equal(P.allowed('2027-01-01','Leipzig','OT1',config),false);
});
test('one location holiday offers both groups against one shared capacity',()=>{
  assert.deepEqual(P.alternatives('2027-05-27',['OT1','OT2','OT3','OT-WE','O1'],config),['OT1','OT2','OT3','OT-WE']);
  assert.deepEqual(P.alternatives('2027-01-01',['OT1','OT2','OT3','OT-WE'],config),['OT-WE']);
  assert.deepEqual(P.alternatives('2027-01-04',['OT1','OT2','OT3','OT-WE'],config),['OT1','OT2','OT3']);
});
test('a regional holiday does not globally disable weekday shift codes',()=>{
  const solid=require('../assets/solid-planning-core-v1.js');
  const rules={enabled:true,otDayHolidayExclusion:true,otDayHolidayStates:['DE','SN','NW'],regionalDayStaffing:config,conditionalStaffing:[{shift:'OT1',sourceShift:'O3',sourceDayOffset:-1,coverageStart:'06:00',coverageEnd:'08:00',minimum:3,fallbackCount:1}]};
  assert.equal(solid.required('2027-05-27','OT1',[],rules),null);
  assert.equal(solid.required('2027-11-17','OT1',[],rules),null);
  assert.equal(solid.required('2027-05-26','OT1',[],rules),1);
});
test('different shift types share the three-person capacity',()=>{
  const rows=[{date:'2027-05-27',type:'OT-WE',employeeId:'a'},{date:'2027-05-27',type:'OT1',employeeId:'b'},{date:'2027-05-27',type:'OT3',employeeId:'c'},{date:'2027-05-27',type:'OT2',employeeId:'d',status:'CANCELLED'}];
  assert.deepEqual(P.group('2027-05-27',rows,config),{target:3,filled:3,missing:0,excess:0});
  assert.equal(P.group('2027-05-27',rows.slice(0,2),config).missing,1);
  assert.equal(P.group('2027-05-27',[rows[0],rows[0],{date:'2027-05-27',type:'OT1'}],config).filled,1);
});
test('missing sites and invalid dates never silently select an employee',()=>{
  assert.equal(P.allowed('2027-05-26','unknown','OT1',config),false);
  assert.throws(()=>P.allowed('2027-02-30','Leipzig','OT1',config));
});
test('planner generates one shared set of open positions on a regional holiday',()=>{
  const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
  const functionText=source.split('\n').find(line=>line.startsWith('function autoOpenSlots('));
  assert.ok(functionText);
  const types=['OT1','OT2','OT3','OT-WE'].map(id=>({id,active:true}));
  const assignments=[{date:'2027-05-27',type:'OT-WE',employeeId:'a'}];
  const window={SFCompliance:{policy:{solidPlanningRules:{regionalDayStaffing:config}}},SFSolidPlanningCore:{otRoster:()=>null},SFShiftModels:{
    coverageInfo(date){const stats=P.group(date,assignments,config),alternatives=P.alternatives(date,types.map(t=>t.id),config);return {...stats,key:'REGIONAL-DAY',label:'Tagesbesetzung',representative:alternatives[0],alternatives}},
    requiredSoll:()=>3,find:()=>null
  }};
  const context={window,assignments,employees:[],TYPES:types,autoDayLabel:()=>'',getSoll:()=>3,typeById:code=>types.find(t=>t.id===code),autoAssignmentCounts:()=>new Map(),autoPlanningDates:()=>['2027-05-27']};
  vm.runInNewContext(functionText,context);
  const slots=context.autoOpenSlots();
  assert.equal(slots.length,2);
  assert.ok(slots.every(slot=>slot.coverageGroup==='REGIONAL-DAY'));
  assert.deepEqual(Array.from(slots[0].alternatives),['OT1','OT2','OT3','OT-WE']);
});
test('checkpointed worker fills one shared capacity for all three company models',()=>{
  const C=require('../assets/background-auto-plan-core-v1.js');
  const dates=['2027-05-26','2027-05-27','2027-11-17','2027-01-01','2027-05-29'];
  for(const [normal,special,start,end] of [['OT2','OT','08:00','18:00'],['FD','FD-WE','06:00','14:00'],['OT','OT-WE','07:00','16:00']]){
    const policy={target:3,statesBySite:config.statesBySite,weekdayCodes:[normal],specialCodes:[special]};
    for(const date of dates){
      const people=[['a','Leipzig',normal],['b','Recklinghausen',normal],['c','Recklinghausen',normal],['d','Leipzig',special],['e','Recklinghausen',special],['f','Recklinghausen',special]]
        .map(([id,team,code])=>({id,team,shifts:[code],target:180,monthLimit:200,calendarLimit:200,weeklyLimit:55,maxConsecutive:4}));
      const resource=date+'|REGIONAL-DAY';
      const groups=people.filter(e=>P.allowed(date,e.team,e.shifts[0],policy)).map(employee=>({id:employee.id,employee,options:[[{employeeId:employee.id,date,type:employee.shifts[0],start,end,resource}]]}));
      const rules={enabled:true,timezone:'Europe/Berlin',maxCalendarWeekHours:55,maxConsecutiveShifts:4,minFreeStartDays:2,minBlockRestHours:48,regionalDayStaffing:policy};
      const input={month:date.slice(0,7),employees:people,base:[],groups,capacities:[[resource,3]],criticalCapacities:[[resource,3]],solidRules:rules};
      const packed=C.pack(input),payload={version:1,months:[input.month],minimumInput:packed,monthInputs:[packed],metadata:{company:'synthetic'}};
      let cp=C.start(payload),steps=0;
      while(cp.stage!=='done'){const runner=C.context(payload,cp);runner.step();cp=JSON.parse(JSON.stringify(cp));assert.ok(++steps<2000);}
      const rows=C.result(payload,cp).preview;
      assert.equal(rows.length,3,normal+' '+date);
      for(const row of rows){const person=people.find(e=>e.id===row.employeeId);assert.ok(P.allowed(date,person.team,row.type,policy));}
    }
  }
});
