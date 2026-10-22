import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const modelsSource=fs.readFileSync(new URL('../assets/shift-models-v1.js',import.meta.url),'utf8');
const settingsSource=fs.readFileSync(new URL('../assets/settings-management-v2.js',import.meta.url),'utf8').replace(/  if\(document.readyState==='loading'\)document.addEventListener\('DOMContentLoaded',init\);else init\(\);\s*\}\)\(\);\s*$/, '  window.testSavePlanning=savePlanning;\n})();');
const row=code=>({code,display_code:code,name:code,default_start:'20:00:00',default_end:'05:00:00',css_class:'teal',active:true,sort_order:1,planning_mode:'required',optional_staffing:0,optional_weekdays:[1,2,3,4,5,6,7],coverage_group:'TL',coverage_required:1});

test('inline settings and editor allow shared time changes and send one company-scoped group request',async()=>{
 const w=new Window({url:'https://schichtfunk.de'});
 try{
  const rows=[row('TL-LE'),row('TL-RE')],staffing=rows.map(x=>({shift_code:x.code,required_count:1})),calls=[];
  w.TYPES=[];w.globalSoll={'TL-LE':1,'TL-RE':1};w.dailySoll={};w.employees=[];w.selectedType=null;
  w.SFBackend={ready:true,role:'OWNER',companyId:'a',client:{
   async rpc(name,args){calls.push({name,args});if(name==='manager_manage_shared_shift_model'){for(const x of rows){x.default_start=args.p_model.start+':00';x.default_end=args.p_model.end+':00';x.coverage_required=args.p_model.soll;}for(const x of staffing)x.required_count=args.p_model.soll;}return{data:{}}},
   from(table){return{select(){return this},eq(){return this},order(){return this},then(resolve){resolve({data:table==='shift_templates'?rows:table==='global_staffing_requirements'?staffing:[]})}}}
  }};
  w.eval(modelsSource);w.SFShiftModels.apply(rows,'a');w.eval(settingsSource);
  const host=w.document.createElement('section');host.innerHTML='<div id="sfSetError"></div><div class="sf-set-shifts">'+rows.map(x=>`<div class="sf-set-shift"><div></div><input data-sf-start="${x.code}" value="20:00"><input data-sf-end="${x.code}" value="05:00"><input data-sf-soll="${x.code}" value="1"></div>`).join('')+'</div><button id="sfSaveShiftSettings">Speichern</button>';
  w.document.body.appendChild(host);w.SFShiftModels.enhance(host);
  for(const code of ['TL-LE','TL-RE'])for(const key of ['start','end','soll'])assert.equal(host.querySelector(`[data-sf-${key}="${code}"]`).disabled,false);
  host.querySelector('[data-sf-start="TL-LE"]').value='19:00';host.querySelector('[data-sf-end="TL-LE"]').value='07:00';host.querySelector('[data-sf-soll="TL-LE"]').value='2';
  await w.testSavePlanning();
  assert.equal(calls.length,1);assert.equal(calls[0].name,'manager_manage_shared_shift_model');assert.equal(calls[0].args.p_company_id,'a');
  assert.deepEqual(rows.map(x=>[x.default_start,x.default_end,x.coverage_required]),[['19:00:00','07:00:00',2],['19:00:00','07:00:00',2]]);
  await w.SFShiftModels.openEditor('TL-RE');
  assert.equal(w.document.querySelector('#sfModelStart').readOnly,false);
  assert.equal(w.document.querySelector('#sfModelSoll').disabled,false);
  w.document.querySelector('#sfModelStart').value='18:00';w.document.querySelector('#sfModelEnd').value='06:00';
  await w.document.querySelector('#sfModelForm').onsubmit({preventDefault(){}});
  assert.equal(calls.length,2);assert.equal(calls[1].name,'manager_manage_shared_shift_model');
  assert.deepEqual(rows.map(x=>x.default_start),['18:00:00','18:00:00']);
 }finally{w.happyDOM.abort()}
});
