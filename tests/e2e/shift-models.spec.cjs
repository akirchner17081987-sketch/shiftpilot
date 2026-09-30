const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const moduleSource=fs.readFileSync(path.join(__dirname,'../../assets/shift-models-v1.js'),'utf8');
const settingsSource=fs.readFileSync(path.join(__dirname,'../../assets/settings-management-v2.js'),'utf8');
async function fixture(page){
  await page.route('https://schichtfunk.de/__shift-model-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body></body></html>'}));
  await page.goto('https://schichtfunk.de/__shift-model-fixture');
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--bg:#06101b;--panel:#0d1928;--text:#edf6ff;--muted:#9bb0c6;--line:#29455e}body{background:var(--bg);color:var(--text);font:14px Arial;margin:16px}button{padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--text);cursor:pointer}input{box-sizing:border-box;width:100%}</style><div id="view-settings"><div class="page-head"></div></div>`);
  await page.addScriptTag({content:`
    window.TYPES=[];window.selectedType=null;window.globalSoll={};window.dailySoll={};window.DAYS=['Mo','Di','Mi','Do','Fr','Sa','So'];window.weekStart=new Date('2026-09-28T12:00:00');window.iso=d=>d.toISOString().slice(0,10);window.addDays=(d,n)=>new Date(+d+n*86400000);window.store={get:()=>null,set(){}};window.saveAll=()=>{};window.showSaveToast=()=>{};window.renderCalendar=()=>{};window.renderLibrary=()=>{};
    const data={a:[{code:'F8',name:'Frühdienst',active:true,default_start:'06:00:00',default_end:'14:00:00',css_class:'teal'}],b:[{code:'B8',name:'Modell Unternehmen 2',active:true,default_start:'08:00:00',default_end:'16:00:00',css_class:'blue'}]};
    window.SFBackend={ready:true,role:'OWNER',companyId:'a',account(){},client:{from(table){let company;return{select(){return this},eq(k,v){company=v;return this},order(){return this},then(resolve){resolve({data:table==='shift_templates'?data[company]:[]})}}},async rpc(name,args){const rows=data[args.p_company_id],m=args.p_model,old=rows.find(x=>x.code===m.code);if(args.p_action==='REMOVE'){if(m.code==='F8')old.active=false;else rows.splice(rows.indexOf(old),1);return{data:{archived:m.code==='F8'}}}const next={code:m.code,name:m.name,default_start:m.start,default_end:m.end,css_class:m.color,active:true};if(old)Object.assign(old,next);else rows.push(next);return{data:{model:next}}}}};
    window.selectFixtureCompany=id=>{SFBackend.companyId=id;SFShiftModels.apply(data[id],id);SFSettingsV2.refreshPlanning()};
  `});
  await page.addScriptTag({content:moduleSource});await page.evaluate(()=>SFShiftModels.apply([{code:'F8',name:'Frühdienst',active:true,default_start:'06:00',default_end:'14:00',css_class:'teal'}],'a'));
  await page.addScriptTag({content:settingsSource});
}
test('add overnight model, isolate companies, then delete unused model',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'＋ Schichtmodell hinzufügen',exact:true}).click();
  await page.getByLabel('Kürzel',{exact:true}).fill('N8');await page.getByLabel('Name',{exact:true}).fill('Nachtdienst');await page.getByRole('dialog').getByLabel('Beginn',{exact:true}).fill('22:00');await page.getByRole('dialog').getByLabel('Ende',{exact:true}).fill('06:00');
  const dialogBounds=await page.getByRole('dialog').boundingBox();expect(dialogBounds.x).toBeGreaterThanOrEqual(0);expect(dialogBounds.x+dialogBounds.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({path:test.info().outputPath('shift-model-dialog.png')});
  await page.getByRole('button',{name:'Schichtmodell hinzufügen',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'N8 löschen',exact:true})).toBeVisible();
  await page.evaluate(()=>selectFixtureCompany('b'));await expect(page.getByRole('button',{name:'N8 löschen',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'B8 löschen',exact:true})).toBeVisible();
  await page.evaluate(()=>selectFixtureCompany('a'));await page.getByRole('button',{name:'N8 löschen',exact:true}).click();await page.getByRole('button',{name:'Schichtmodell löschen',exact:true}).click();await expect(page.getByRole('button',{name:'N8 löschen',exact:true})).toHaveCount(0);
  await page.screenshot({path:test.info().outputPath('shift-model-settings.png'),fullPage:true});
});
test('used model is removed from active list and restored; read-only roles cannot add',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'F8 löschen',exact:true}).click();await page.getByRole('button',{name:'Schichtmodell löschen',exact:true}).click();await expect(page.getByRole('button',{name:'F8 löschen',exact:true})).toHaveCount(0);
  await page.getByText('Entfernte Schichtmodelle (1)',{exact:true}).click();await page.getByRole('button',{name:'Wiederherstellen',exact:true}).click();await expect(page.getByLabel('Kürzel',{exact:true})).toBeDisabled();await page.getByRole('button',{name:'Wiederherstellen',exact:true}).last().click();await expect(page.getByRole('button',{name:'F8 löschen',exact:true})).toBeVisible();
  await page.evaluate(()=>{SFBackend.role='VIEWER';SFSettingsV2.refreshPlanning()});await expect(page.getByRole('button',{name:'＋ Schichtmodell hinzufügen',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Schichtwerte speichern',exact:true})).toBeDisabled();
});
