const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),read=p=>fs.readFileSync(path.join(__dirname,'../../',p),'utf8');
const index=read('index.html'),styles=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>`<style>${m[1]}</style>`).join('');
test('named completion recipients can be selected and saved on desktop and mobile',async({page})=>{
 await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="de"><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<style>${read('assets/auto-plan-period-v1.css')}body{padding:16px}#view-auto{display:block!important;max-width:1100px;margin:auto}</style></head><body><section id="view-auto" class="view active sf-auto-workspace"><input id="autoPlanMonth" type="month" value="2027-02"><div class="sf-auto-start"></div></section></body></html>`}));
 await page.goto('https://example.test/');await page.evaluate(()=>{
  window.__calls=[];window.SFAutoPlanWorkspace={render(){}};window.__selected=[];
  const config={enabled:false,mode:'PREVIEW',run_day:20,run_time:'06:00',lead_months:1,month_count:1,on_changes:false,history_months:3,revision:0};
  window.SFBackend={ready:true,user:{id:'owner'},role:'OWNER',companyId:'company',client:{rpc:async(name,args)=>{__calls.push(args);if(args.p_action==='NOTIFY_SAVE')__selected=args.p_config.notify_user_ids;return{data:{config,can_edit:true,runs:[],notifications:{selected:__selected,choices:[{user_id:'owner',name:'Muster, Anna',role:'OWNER',access_role:'OWNER',self:true,push_enabled:true},{user_id:'lead',name:'Beispiel, Thomas',role:'PLANNER',access_role:'TEAM_LEAD',push_enabled:false}]}}};}}};
 });
 await page.addScriptTag({content:read('assets/autonomous-planning-v1.js')});await page.evaluate(()=>SFAutonomousPlanning.render());
 const panel=page.locator('#sfAutoPlanNotifications');await expect(panel).toBeVisible();await expect(panel).toContainText('Muster, Anna (du) · Inhaber');
 await panel.getByRole('checkbox').nth(0).check();await panel.getByRole('checkbox').nth(1).check();await panel.getByRole('button',{name:'Empfängerauswahl speichern'}).click();
 await expect.poll(()=>page.evaluate(()=>__selected)).toEqual(['owner','lead']);await expect(panel.getByRole('checkbox').nth(1)).toBeChecked();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
