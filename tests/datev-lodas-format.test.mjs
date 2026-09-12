import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=fs.readFileSync(new URL('../assets/datev-lodas-core-v1.js',import.meta.url),'utf8');
const sandbox={};vm.createContext(sandbox);vm.runInContext(source,sandbox);
const C=sandbox.SFDatevLodasCore;
const ui=fs.readFileSync(new URL('../assets/datev-lodas-export-v1.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260911061817_complete_datev_lodas_export_v2.sql',import.meta.url),'utf8');

test('DATEV browser export module has valid JavaScript syntax',()=>{
  assert.doesNotThrow(()=>new vm.Script(ui,{filename:'datev-lodas-export-v1.js'}));
  assert.match(ui,/charset=us-ascii/);
  assert.match(ui,/id="sfDatevExtension"/);
  assert.match(ui,/<option value="txt"[^>]*>\.txt \(empfohlen\)<\/option>/);
  assert.match(ui,/<option value="sic"[^>]*>\.sic \(optional\)<\/option>/);
  assert.match(ui,/value==='sic'\?'sic':'txt'/);
  assert.match(ui,/SchichtFunk_DATEV_LODAS_\$\{month\}\.\$\{extension\}/);
});

test('DATEV download requires a successful server authorization first',()=>{
  const authorization=ui.indexOf("B.client.rpc('manager_authorize_datev_lodas_export'");
  const download=ui.indexOf('URL.createObjectURL(blob)');
  assert.ok(authorization>=0,'server authorization RPC is missing');
  assert.ok(download>authorization,'download must happen after server authorization');
  assert.match(ui,/if\(audit\.error\)throw audit\.error/);
  assert.doesNotMatch(ui,/console\.warn\('DATEV Export-Audit'/);
});

test('DATEV authorization migration uses least privilege and a private definer',()=>{
  assert.match(migration,/revoke all on table public\.datev_lodas_settings from public, anon/);
  assert.match(migration,/create or replace function private\.authorize_datev_lodas_export/);
  assert.match(migration,/security definer\s+set search_path = ''/);
  assert.match(migration,/create or replace function public\.manager_authorize_datev_lodas_export/);
  assert.match(migration,/security invoker\s+set search_path = ''/);
  assert.match(migration,/p_expected_closure_revision/);
  assert.match(migration,/serverAuthorized', true/);
});

test('DATEV LODAS header and movement lines match the binding SchichtFunk pattern',()=>{
  const content=C.formatContent({beraterNr:'1103899',mandantenNr:'62069',month:'2026-08',rows:[{pnr:'26',wage_type:'1214',minutes:60,cost_center:'NULL'},{pnr:'26',wage_type:'2214',minutes:3000,cost_center:'NULL'},{pnr:'26',wage_type:'101',minutes:7800,cost_center:'NULL'}]});
  const expected=['[Allgemein]','Ziel=LODAS','Datumsformat=TT.MM.JJJJ','Zahlenkomma=,','Version=15.06','BeraterNr=1103899','MandantenNr=62069','[Satzbeschreibung]','1;u_lod_bwd_buchung_standard;abrechnung_zeitraum#bwd;bs_wert_butab#bwd;pnr#bwd;la_eigene#bwd;bs_nr#bwd;kostenstelle#bwd;abw_lohnfaktor#bwd;bemerkung#bwd;','[Bewegungsdaten]','1;01.08.2026;1,00;26;1214;1;NULL;','1;01.08.2026;50,00;26;2214;1;NULL;','1;01.08.2026;130,00;26;101;1;NULL;'].join('\r\n');
  assert.equal(content,expected);
});

test('DATEV values use two decimals and German decimal comma',()=>{
  assert.equal(C.formatValueFromMinutes(7460),'124,33');
  assert.equal(C.formatValueFromMinutes(1455),'24,25');
});

test('rules aggregate confirmed work and keep the configured own wage type',()=>{
  const result=C.buildRows({rules:[{active:true,label:'Grundstunden',source_type:'WORK_TOTAL',source_key:null,wage_type:'101',cost_center:null,sort_order:10}],employees:[{employee_id:'e1',employee_name:'Test',personnel_no:'26',confirmed_work_minutes:7800}],details:[],entries:[]});
  assert.equal(result.errors.length,0);assert.equal(result.rows.length,1);assert.equal(result.rows[0].minutes,7800);assert.equal(result.rows[0].pnr,'26');assert.equal(result.rows[0].wage_type,'101');assert.equal(result.rows[0].cost_center,'NULL');
});

test('Urlaub Tagesbasis exports days as quantity instead of hours',()=>{
  const result=C.buildRows({rules:[{active:true,label:'Urlaub',source_type:'ABSENCE_DAYS',source_key:'Urlaub',wage_type:'141',cost_center:null,sort_order:20}],employees:[{employee_id:'e1',employee_name:'Test',personnel_no:'26',confirmed_work_minutes:0}],details:[{employee_id:'e1',employee_name:'Test',work_date:'2026-08-03',absence_types:'Urlaub'},{employee_id:'e1',employee_name:'Test',work_date:'2026-08-04',absence_types:'Urlaub'}],entries:[]});
  assert.equal(result.errors.length,0);assert.equal(result.rows[0].unit,'DAYS');assert.equal(result.rows[0].quantity,2);
  const content=C.formatContent({beraterNr:'1103899',mandantenNr:'62069',month:'2026-08',rows:result.rows});
  assert.match(content,/1;01\.08\.2026;2,00;26;141;1;NULL;/);
});

test('Krank Std. exports credited sickness hours as wage type 145',()=>{
  const result=C.buildRows({rules:[{active:true,label:'Krank Std.',source_type:'ABSENCE_TYPE',source_key:'Krank',wage_type:'145',cost_center:null,sort_order:30}],employees:[{employee_id:'e1',employee_name:'Test',personnel_no:'26',confirmed_work_minutes:0}],details:[{employee_id:'e1',employee_name:'Test',work_date:'2026-08-05',absence_types:'Krank',absence_credit_minutes:480}],entries:[]});
  assert.equal(result.errors.length,0);assert.equal(result.rows.length,1);assert.equal(result.rows[0].wage_type,'145');assert.equal(result.rows[0].minutes,480);
  const content=C.formatContent({beraterNr:'1103899',mandantenNr:'62069',month:'2026-08',rows:result.rows});
  assert.match(content,/1;01\.08\.2026;8,00;26;145;1;NULL;/);
});

test('night premium counts only 22:00-06:00 in Europe/Berlin',()=>{
  const entry={entry_status:'confirmed',actual_start:'2026-08-03T18:00:00+02:00',actual_end:'2026-08-04T04:00:00+02:00',actual_break_minutes:0};
  assert.equal(C.premiumMinutes(entry,'NIGHT_WINDOW'),360);
});

test('Sunday premium counts the full Sunday 00:00-24:00 window',()=>{
  const entry={entry_status:'confirmed',actual_start:'2026-08-01T22:00:00+02:00',actual_end:'2026-08-02T06:00:00+02:00',actual_break_minutes:0};
  assert.equal(C.premiumMinutes(entry,'SUNDAY_WINDOW'),360);
});

test('premium rules aggregate 1214 and 2214 separately',()=>{
  const result=C.buildRows({rules:[{active:true,label:'Nacht',source_type:'NIGHT_WINDOW',source_key:'22:00-06:00',wage_type:'1214',cost_center:null,sort_order:20},{active:true,label:'Sonntag',source_type:'SUNDAY_WINDOW',source_key:'00:00-24:00',wage_type:'2214',cost_center:null,sort_order:30}],employees:[{employee_id:'e1',employee_name:'Test',personnel_no:'26',confirmed_work_minutes:0}],details:[],entries:[{employee_id:'e1',employee_name:'Test',entry_status:'confirmed',actual_start:'2026-08-01T22:00:00+02:00',actual_end:'2026-08-02T06:00:00+02:00',actual_break_minutes:0}]});
  assert.equal(result.errors.length,0);assert.equal(result.rows.find(x=>x.wage_type==='1214').minutes,480);assert.equal(result.rows.find(x=>x.wage_type==='2214').minutes,360);
});

test('Feiertagszuschlag 100% exports only confirmed work minutes inside a Sachsen holiday',()=>{
  const result=C.buildRows({rules:[{active:true,label:'Feiertagszuschlag 100% frei',source_type:'HOLIDAY_WINDOW',source_key:'00:00-24:00',wage_type:'214',cost_center:null,sort_order:130}],employees:[{employee_id:'e1',employee_name:'Test',personnel_no:'26',confirmed_work_minutes:0}],details:[{employee_id:'e1',employee_name:'Test',work_date:'2026-10-31',holiday_name:'Reformationstag',absence_types:'',absence_credit_minutes:0}],entries:[{employee_id:'e1',employee_name:'Test',entry_status:'confirmed',actual_start:'2026-10-30T22:00:00+01:00',actual_end:'2026-10-31T06:00:00+01:00',actual_break_minutes:0}]});
  assert.equal(result.errors.length,0);assert.equal(result.rows.length,1);assert.equal(result.rows[0].wage_type,'214');assert.equal(result.rows[0].minutes,360);
  const content=C.formatContent({beraterNr:'1103899',mandantenNr:'62069',month:'2026-10',rows:result.rows});
  assert.match(content,/1;01\.10\.2026;6,00;26;214;1;NULL;/);
});

test('premium calculation blocks ambiguous breaks without break placement',()=>{
  const result=C.buildRows({rules:[{active:true,label:'Nacht',source_type:'NIGHT_WINDOW',source_key:'22:00-06:00',wage_type:'1214',cost_center:null,sort_order:20}],employees:[{employee_id:'e1',employee_name:'Test',personnel_no:'26',confirmed_work_minutes:0}],details:[],entries:[{employee_id:'e1',employee_name:'Test',entry_status:'confirmed',actual_start:'2026-08-03T20:00:00+02:00',actual_end:'2026-08-04T06:00:00+02:00',actual_break_minutes:30}]});
  assert.ok(result.errors.some(x=>x.includes('Pause ohne genaue Pausenlage')));
});

test('empty movement exports are blocked instead of producing a misleading file',()=>{
  const result=C.buildRows({rules:[{active:true,label:'Grundstunden',source_type:'WORK_TOTAL',source_key:null,wage_type:'101',cost_center:null,sort_order:10}],employees:[{employee_id:'e1',employee_name:'Test',personnel_no:'26',confirmed_work_minutes:0}],details:[],entries:[]});
  assert.equal(result.rows.length,0);assert.ok(result.errors.some(x=>x.includes('Ein leerer DATEV-Export ist nicht zulässig')));
});

test('non-numeric payroll personnel numbers block the fixed LODAS format',()=>{
  const result=C.buildRows({rules:[{active:true,label:'Grundstunden',source_type:'WORK_TOTAL',source_key:null,wage_type:'101',cost_center:null,sort_order:10}],employees:[{employee_id:'e1',employee_name:'Test',personnel_no:'P001',confirmed_work_minutes:480}],details:[],entries:[]});
  assert.equal(result.rows.length,0);assert.ok(result.errors.some(x=>x.includes('1 bis 5 Ziffern')));
});

test('current LODAS field limits are enforced',()=>{
  assert.deepEqual(Array.from(C.validateSettings({berater_nr:'123',mandanten_nr:'123456'})),['BeraterNr muss aus 4 bis 7 Ziffern bestehen.','MandantenNr muss aus 1 bis 5 Ziffern bestehen.']);
  assert.ok(C.validateRules([{active:true,source_type:'WORK_TOTAL',wage_type:'12345',cost_center:null}]).some(x=>x.includes('1 bis 4 Ziffern')));
  assert.ok(C.validateRules([{active:true,source_type:'WORK_TOTAL',wage_type:'100',cost_center:'KÖST'}]).some(x=>x.includes('ASCII')));
  assert.throws(()=>C.formatContent({beraterNr:'28547',mandantenNr:'90909',month:'2026-08',rows:[{pnr:'123456',wage_type:'100',minutes:60,cost_center:'NULL'}]}),/Personalnummer/);
});

test('export uses the binding LODAS 15.06 header key and no SST variant',()=>{
  const content=C.formatContent({beraterNr:'28547',mandantenNr:'90909',month:'2026-08',rows:[]});assert.match(content,/^Version=15\.06$/m);assert.doesNotMatch(content,/^Version_SST=/m);assert.ok([...content].every(char=>char.charCodeAt(0)<=127));
});
