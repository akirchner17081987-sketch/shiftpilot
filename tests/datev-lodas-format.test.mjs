import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=fs.readFileSync(new URL('../assets/datev-lodas-core-v1.js',import.meta.url),'utf8');
const sandbox={};vm.createContext(sandbox);vm.runInContext(source,sandbox);
const C=sandbox.SFDatevLodasCore;

test('DATEV browser export module has valid JavaScript syntax',()=>{
  const ui=fs.readFileSync(new URL('../assets/datev-lodas-export-v1.js',import.meta.url),'utf8');
  assert.doesNotThrow(()=>new vm.Script(ui,{filename:'datev-lodas-export-v1.js'}));
  assert.match(ui,/charset=us-ascii/);
  assert.match(ui,/SchichtFunk_DATEV_LODAS_\$\{month\}\.txt/);
});

test('DATEV LODAS header and movement lines match the binding SchichtFunk pattern',()=>{
  const content=C.formatContent({
    beraterNr:'1103899',
    mandantenNr:'62069',
    month:'2026-08',
    rows:[
      {pnr:'26',wage_type:'1214',minutes:60,cost_center:'NULL'},
      {pnr:'26',wage_type:'145',minutes:3000,cost_center:'NULL'},
      {pnr:'26',wage_type:'101',minutes:7800,cost_center:'NULL'}
    ]
  });
  const expected=[
    '[Allgemein]',
    'Ziel=LODAS',
    'Datumsformat=TT.MM.JJJJ',
    'Zahlenkomma=,',
    'Version=15.06',
    'BeraterNr=1103899',
    'MandantenNr=62069',
    '[Satzbeschreibung]',
    '1;u_lod_bwd_buchung_standard;abrechnung_zeitraum#bwd;bs_wert_butab#bwd;pnr#bwd;la_eigene#bwd;bs_nr#bwd;kostenstelle#bwd;abw_lohnfaktor#bwd;bemerkung#bwd;',
    '[Bewegungsdaten]',
    '1;01.08.2026;1,00;26;1214;1;NULL;',
    '1;01.08.2026;50,00;26;145;1;NULL;',
    '1;01.08.2026;130,00;26;101;1;NULL;'
  ].join('\r\n');
  assert.equal(content,expected);
});

test('DATEV values use two decimals and German decimal comma',()=>{
  assert.equal(C.formatValueFromMinutes(7460),'124,33');
  assert.equal(C.formatValueFromMinutes(1455),'24,25');
});

test('rules aggregate confirmed work and keep the configured own wage type',()=>{
  const result=C.buildRows({
    rules:[{active:true,label:'Grundstunden',source_type:'WORK_TOTAL',source_key:null,wage_type:'101',cost_center:null,sort_order:10}],
    employees:[{employee_id:'e1',employee_name:'Test',personnel_no:'26',confirmed_work_minutes:7800}],
    details:[],entries:[]
  });
  assert.equal(result.errors.length,0);
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].minutes,7800);
  assert.equal(result.rows[0].pnr,'26');
  assert.equal(result.rows[0].wage_type,'101');
  assert.equal(result.rows[0].cost_center,'NULL');
});

test('non-numeric payroll personnel numbers block the fixed LODAS format',()=>{
  const result=C.buildRows({
    rules:[{active:true,label:'Grundstunden',source_type:'WORK_TOTAL',source_key:null,wage_type:'101',cost_center:null,sort_order:10}],
    employees:[{employee_id:'e1',employee_name:'Test',personnel_no:'P001',confirmed_work_minutes:480}],
    details:[],entries:[]
  });
  assert.equal(result.rows.length,0);
  assert.ok(result.errors.some(x=>x.includes('1 bis 5 Ziffern')));
});

test('current LODAS field limits are enforced',()=>{
  assert.deepEqual(Array.from(C.validateSettings({berater_nr:'123',mandanten_nr:'123456'})),[
    'BeraterNr muss aus 4 bis 7 Ziffern bestehen.',
    'MandantenNr muss aus 1 bis 5 Ziffern bestehen.'
  ]);
  assert.ok(C.validateRules([{active:true,source_type:'WORK_TOTAL',wage_type:'12345',cost_center:null}]).some(x=>x.includes('1 bis 4 Ziffern')));
  assert.ok(C.validateRules([{active:true,source_type:'WORK_TOTAL',wage_type:'100',cost_center:'KÖST'}]).some(x=>x.includes('ASCII')));
  assert.throws(()=>C.formatContent({beraterNr:'28547',mandantenNr:'90909',month:'2026-08',rows:[{pnr:'123456',wage_type:'100',minutes:60,cost_center:'NULL'}]}),/Personalnummer/);
});

test('export uses the binding LODAS 15.06 header key and no SST variant',()=>{
  const content=C.formatContent({beraterNr:'28547',mandantenNr:'90909',month:'2026-08',rows:[]});
  assert.match(content,/^Version=15\.06$/m);
  assert.doesNotMatch(content,/^Version_SST=/m);
  assert.ok([...content].every(char=>char.charCodeAt(0)<=127));
});
