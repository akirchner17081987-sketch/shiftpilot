import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {buildPlan,workbookRows}=createRequire(import.meta.url)('../assets/schedule-export-core-v1.js');
const base={month:'2026-12',company:'Test GmbH',employees:[{id:'A',first:'Anna',last:'Test',planningTeam:'A',status:'active',personnelNo:'001'},{id:'B',first:'Berta',last:'Test',status:'active'},{id:'C',first:'Chris',last:'Archiv',status:'inactive'},{id:'D',first:'Januar',last:'Start',status:'active',startDate:'2027-01-01'}],types:[{id:'FD',name:'Frühdienst',start:'06:00',end:'14:00'},{id:'ND',name:'Nachtdienst',start:'22:00',end:'06:00'}],assignments:[{id:'1',employeeId:'A',type:'FD',date:'2026-12-01'},{id:'2',employeeId:'A',type:'ND',date:'2026-12-31'},{id:'3',employeeId:'C',type:'FD',date:'2026-12-03',start:'07:00',end:'14:00'},{id:'4',employeeId:'A',type:'ND',date:'2026-11-30'},{id:'5',employeeId:'A',type:'FD',date:'2027-01-01'}],absences:[{employeeId:'B',startDate:'2026-12-05',endDate:'2026-12-07',type:'Urlaub',status:'Genehmigt'},{employeeId:'B',date:'2026-12-08',type:'Krank',status:'Abgelehnt'}],getSoll:()=>2};
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
  const plan=buildPlan(base),book=workbookRows(plan);assert.equal(plan.coverage.length,62);assert.equal(plan.coverage[0].required,2);assert.equal(plan.coverage[0].actual,1);assert.equal(book.matrix[7][0],'001');assert.equal(book.matrix[6].length,36);assert.equal(plan.status,'Entwurf');assert.equal(buildPlan({...base,assignments:base.assignments.map(a=>({...a,publishedAt:'2026-10-01'}))}).status,'Veröffentlicht');
});
test('leap years and unavailable archived employees retain valid rows, while invalid shift times fail clearly',()=>{
  assert.equal(buildPlan({...base,month:'2028-02',assignments:[]}).days.length,29);const unknown=buildPlan({...base,assignments:[{employeeId:'removed',date:'2026-12-01',type:'FD'}]});assert.equal(unknown.rows.find(r=>r.person.id==='removed').person.name,'Ehemaliger Mitarbeiter');assert.throws(()=>buildPlan({...base,assignments:[{employeeId:'A',date:'2026-12-01',type:'unknown'}]}),/Schichtzeiten/);
});
test('an archived model without a template still shows differing hours in the PDF appendix',()=>{
  const plan=buildPlan({...base,assignments:[{employeeId:'A',date:'2026-12-01',type:'OLD',start:'06:00',end:'14:00'},{employeeId:'A',date:'2026-12-02',type:'OLD',start:'07:00',end:'14:00'}]});assert.equal(plan.details[1].adjusted,true);assert.equal(plan.rows[0].cells[1].pdf,'OLD*');
});
