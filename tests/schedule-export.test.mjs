import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {buildPlan,workbookRows,selectPDFPlan}=createRequire(import.meta.url)('../assets/schedule-export-core-v1.js');
const base={month:'2026-12',company:'Test GmbH',employees:[{id:'A',first:'Anna',last:'Test',team:'Leipzig',planningTeam:'A',status:'active',personnelNo:'001'},{id:'B',first:'Berta',last:'Test',team:'Recklinghausen',status:'active'},{id:'C',first:'Chris',last:'Archiv',team:'Recklinghausen',status:'inactive'},{id:'D',first:'Januar',last:'Start',status:'active',startDate:'2027-01-01'}],types:[{id:'FD',name:'Frühdienst',start:'06:00',end:'14:00'},{id:'ND',name:'Nachtdienst',start:'22:00',end:'06:00'}],assignments:[{id:'1',employeeId:'A',type:'FD',date:'2026-12-01'},{id:'2',employeeId:'A',type:'ND',date:'2026-12-31'},{id:'3',employeeId:'C',type:'FD',date:'2026-12-03',start:'07:00',end:'14:00'},{id:'4',employeeId:'A',type:'ND',date:'2026-11-30'},{id:'5',employeeId:'A',type:'FD',date:'2027-01-01'}],absences:[{employeeId:'B',startDate:'2026-12-05',endDate:'2026-12-07',type:'Urlaub',status:'Genehmigt'},{employeeId:'B',date:'2026-12-08',type:'Krank',status:'Abgelehnt'}],getSoll:()=>2};
test('December includes all 31 dates and all active or assigned employees, regardless of pool filters',()=>{
  const plan=buildPlan(base);assert.equal(plan.days.length,31);assert.equal(plan.days.at(-1).date,'2026-12-31');assert.deepEqual(plan.rows.map(r=>r.person.id),['A','B','C']);assert.equal(plan.shiftCount,3);assert.equal(plan.rows.find(r=>r.person.id==='B').cells.length,31);
});
test('night shifts stay on their start date, December excludes adjacent-month shifts, and hours retain paid breaks',()=>{
  const plan=buildPlan(base),row=plan.rows.find(r=>r.person.id==='A');assert.equal(row.cells[30].excel,'ND 22:00–06:00 (+1 Tag)');assert.equal(row.hours,16);assert.equal(plan.hours,23);assert.equal(plan.details.at(-1).overnight,true);
});
test('effective absences appear on every day, rejected absences do not, and empty cells are not labelled Frei',()=>{
  const cells=buildPlan(base).rows.find(r=>r.person.id==='B').cells;assert.deepEqual(cells.slice(4,7).map(c=>c.excel),['U','U','U']);assert.equal(cells[7].excel,'–');
});
test('modified hours receive an appendix marker and detail exports preserve exact start and end',()=>{
  const plan=buildPlan(base),row=plan.rows.find(r=>r.person.id==='C');assert.equal(row.cells[2].pdf,'FD*');assert.equal(row.hours,7);const detail=workbookRows(plan).details.find(r=>r[2]==='Chris Archiv');assert.deepEqual(detail.slice(5,9),['07:00','14:00','Nein',7]);
});
test('SOLL/IST covers every day and shift, publication states and personnel numbers survive export',()=>{
  const plan=buildPlan(base),book=workbookRows(plan);assert.equal(plan.coverage.length,62);assert.equal(plan.coverage[0].required,2);assert.equal(plan.coverage[0].actual,1);assert.equal(book.matrix[7][0],'001');assert.equal(book.matrix[6].length,38);assert.equal(plan.status,'Entwurf');assert.equal(buildPlan({...base,assignments:base.assignments.map(a=>({...a,publishedAt:'2026-10-01'}))}).status,'Veröffentlicht');
});
test('leap years and unavailable archived employees retain valid rows, while invalid shift times fail clearly',()=>{
  assert.equal(buildPlan({...base,month:'2028-02',assignments:[]}).days.length,29);const unknown=buildPlan({...base,assignments:[{employeeId:'removed',date:'2026-12-01',type:'FD'}]});assert.equal(unknown.rows.find(r=>r.person.id==='removed').person.name,'Ehemaliger Mitarbeiter');assert.throws(()=>buildPlan({...base,assignments:[{employeeId:'A',date:'2026-12-01',type:'unknown'}]}),/Schichtzeiten/);
});
test('an archived model without a template still shows differing hours in the PDF appendix',()=>{
  const plan=buildPlan({...base,assignments:[{employeeId:'A',date:'2026-12-01',type:'OLD',start:'06:00',end:'14:00'},{employeeId:'A',date:'2026-12-02',type:'OLD',start:'07:00',end:'14:00'}]});assert.equal(plan.details[1].adjusted,true);assert.equal(plan.rows[0].cells[1].pdf,'OLD*');
});
test('minute adjustments are summed before rounding the monthly hours',()=>{
  const plan=buildPlan({...base,assignments:Array.from({length:30},(_,i)=>({employeeId:'A',date:'2026-12-'+String(i+1).padStart(2,'0'),type:'FD',start:'06:00',end:'06:01'}))});assert.equal(plan.hours,0.5);assert.equal(plan.rows[0].hours,0.5);
});

test('location PDFs include the complete month and only the selected employees, times and appendix',()=>{
 const plan=buildPlan(base),le=selectPDFPlan(plan,'Leipzig'),re=selectPDFPlan(plan,'Recklinghausen');
 assert.deepEqual(le.rows.map(r=>r.person.id),['A']);assert.deepEqual(re.rows.map(r=>r.person.id),['B','C']);
 assert.equal(le.days.length,31);assert.equal(le.shiftCount,2);assert.equal(le.hours,16);assert.equal(re.shiftCount,1);assert.equal(re.hours,7);
 assert.ok(le.details.every(a=>a.person.site==='Leipzig'));assert.ok(re.details.every(a=>a.person.site==='Recklinghausen'));
 assert.equal(le.details.filter(a=>a.adjusted).length,0);assert.equal(re.details.filter(a=>a.adjusted).length,1);assert.equal(re.rows.find(r=>r.person.id==='B').cells[4].pdf,'U');
 assert.equal(le.types.some(t=>t.id==='ND'),true);assert.equal(re.types.some(t=>t.id==='ND'),false);assert.equal(re.coverage.length,0);
});
test('Gesamt retains people without a location, all details and Excel while PDF selections never mutate the plan',()=>{
 const plan=buildPlan({...base,employees:[...base.employees,{id:'unassigned',first:'Ohne',last:'Standort',status:'active'}]}),before=JSON.stringify(plan),full=selectPDFPlan(plan,'Gesamt');
 assert.deepEqual(full.rows.map(r=>r.person.id),plan.rows.map(r=>r.person.id));assert.equal(full.hours,23);
 selectPDFPlan(plan,'Leipzig');selectPDFPlan(plan,'Recklinghausen');assert.equal(JSON.stringify(plan),before);assert.equal(workbookRows(plan).matrix.some(row=>row.includes('Ohne Standort')),true);
 assert.equal(selectPDFPlan(plan,'Leipzig').rows.some(r=>r.person.id==='unassigned'),false);
});
test('employee location is separate from teams A to E and persisted metadata survives hydration',()=>{
 const plan=buildPlan({...base,employees:[{id:'A',first:'Anna',status:'active',planningTeam:'E',qualifications:['__sp:team= Leipzig ']},{id:'B',first:'Berta',status:'active',planningTeam:'E',team:' rEcKlInGhAuSeN '},{id:'C',first:'Chris',status:'inactive',team:'',qualifications:['__sp:team=Leipzig']}]}),le=selectPDFPlan(plan,'Leipzig'),re=selectPDFPlan(plan,'Recklinghausen');
 assert.deepEqual(le.rows.map(r=>r.person.id),['A']);assert.equal(le.rows[0].person.team,'E');assert.deepEqual(re.rows.map(r=>r.person.id),['B']);
 assert.equal(selectPDFPlan(plan,'Gesamt').rows.some(r=>r.person.id==='C'),true);
});
test('a Leipzig employee covering TL-RE remains in Leipzig PDF, and filtered status excludes other-site drafts',()=>{
 const plan=buildPlan({...base,types:[...base.types,{id:'TL-RE',start:'20:00',end:'06:00'}],assignments:[{employeeId:'A',date:'2026-12-01',type:'TL-RE',publishedAt:'2026-10-01'},{employeeId:'B',date:'2026-12-02',type:'FD'}]});
 const le=selectPDFPlan(plan,'Leipzig');assert.equal(le.details[0].type,'TL-RE');assert.equal(le.status,'Veröffentlicht');assert.equal(le.hours,10);assert.equal(plan.status,'Teilweise veröffentlicht');
});
test('empty locations are explicit and unsupported scopes are rejected',()=>{
 const plan=buildPlan({...base,employees:[],assignments:[]});assert.equal(selectPDFPlan(plan,'Leipzig').rows.length,0);assert.equal(selectPDFPlan(plan,'Recklinghausen').hours,0);assert.throws(()=>selectPDFPlan(plan,'Berlin'),/Leipzig, Recklinghausen oder Gesamt/);
});

test('monthly personal targets, zero hours and missing targets remain distinct in export',()=>{
 const employees=base.employees.map(e=>({...e,monthlyHours:e.id==='A'?180:e.id==='B'?162:0}));
 const plan=buildPlan({...base,employees}),anna=plan.rows.find(r=>r.person.id==='A'),berta=plan.rows.find(r=>r.person.id==='B');
 assert.equal(anna.targetHours,180);assert.equal(anna.difference,-164);assert.equal(berta.hours,0);assert.equal(berta.targetHours,162);assert.equal(berta.difference,-162);
 assert.equal(plan.employeeCount,3);assert.equal(plan.assignedEmployeeCount,2);assert.equal(plan.targetHours,342);assert.equal(plan.difference,-319);
 const matrix=workbookRows(plan).matrix;assert.deepEqual(matrix[6].slice(-4),['Dienste','Plan-IST (h)','Monats-SOLL (h)','Differenz (h)']);assert.deepEqual(matrix[7].slice(-4),[2,16,180,-164]);
 const le=selectPDFPlan(plan,'Leipzig');assert.equal(le.targetHours,180);assert.equal(le.difference,-164);assert.equal(le.assignedEmployeeCount,1);
 const missing=buildPlan({...base,employees:[{id:'A',first:'Unknown',status:'active'}],assignments:[base.assignments[0]]});assert.equal(missing.rows[0].targetHours,null);assert.equal(missing.difference,null);
});
test('export uses persisted monthly targets, weekly fallback and the shared Secontec employee order',()=>{
 const people=['37','26','2001','2048','119','2015','2059','109'].map(personnelNo=>({id:personnelNo,first:'Test',last:personnelNo,status:'active',personnelNo,weeklyHours:40,qualifications:['__sp:monthlyHours=144']}));
 const plan=buildPlan({...base,companyId:'1f23f5a3-1cbb-430f-af90-36ed34004440',employees:people,assignments:[],employeeMonthlyTarget:()=>173.92});
 assert.deepEqual(plan.rows.map(r=>r.person.personnelNo),['2001','26','2048','2059','37','119','2015','109']);assert.ok(plan.rows.every(r=>r.targetHours===144));
 assert.equal(buildPlan({...base,employees:[{id:'A',status:'active',weeklyHours:40}],assignments:[]}).rows[0].targetHours,173.92);
});
