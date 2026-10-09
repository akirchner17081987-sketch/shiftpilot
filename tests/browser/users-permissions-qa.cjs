const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/users-permissions');fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),index=read('index.html');
const styles=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[1]!==undefined?m[1]:read(m[0].match(/href="([^"]+)"/)[1].split('?')[0])).join('\n');
const script=s=>'<script>'+s.replace(/<\/script/gi,'<\\/script')+'</script>';
const fixture=`
window.TYPES=[];window.DAYS=[];window.__calls=[];window.__fail=null;window.__alerts=[];window.alert=m=>__alerts.push(m);window.showSaveToast=()=>{};
window.employees=[{first:'Lea',last:'Bauer',email:'lead@example.test'}];
window.__rows=[
{record_id:'owner',user_id:'owner',email:'owner@example.test',role:'OWNER',permissions:[],status:'ACTIVE',kind:'MEMBER',is_self:true},
{record_id:'admin',user_id:'admin',email:'admin@example.test',role:'ADMIN',permissions:[],status:'ACTIVE',kind:'MEMBER'},
{record_id:'lead-record',user_id:'lead-user',email:'lead@example.test',role:'TEAM_LEAD',permissions:[],status:'ACTIVE',kind:'MEMBER'},
{record_id:'reader',user_id:'reader',email:'reader@example.test',role:'TEAM_LEAD',permissions:['read_only'],display_name:'<img src=x onerror=alert(1)>',status:'ACTIVE',kind:'MEMBER'},
{record_id:'time',user_id:'time',email:'time@example.test',role:'EMPLOYEE',permissions:['manage_time','confirm_time'],status:'ACTIVE',kind:'MEMBER'},
{record_id:'portal',user_id:'portal-user',email:'portal@example.test',role:'EMPLOYEE',permissions:[],employee_id:'portal',status:'ACTIVE',kind:'EMPLOYEE'},
{record_id:'disabled',user_id:'disabled',email:'disabled@example.test',role:'TEAM_LEAD',permissions:[],status:'DISABLED',kind:'MEMBER'},
{record_id:'invite',email:'invite@example.test',role:'TEAM_LEAD',permissions:['publish_schedule'],status:'INVITED',kind:'INVITE',expires_at:'2026-10-16T10:00:00Z'},
{record_id:'expired',email:'expired@example.test',role:'EMPLOYEE',permissions:[],employee_id:'new-staff',status:'EXPIRED',kind:'INVITE',expires_at:'2026-10-01T10:00:00Z'}];
window.SFBackend={role:'OWNER',companyId:'company-test',ready:true,init:async()=>{},client:{rpc:async(name,args)=>{
__calls.push({name,args});await new Promise(r=>setTimeout(r,10));if(__fail===name)return{error:{message:'Test: Verbindung unterbrochen'}};
if(name==='manager_list_access_users')return{data:{users:JSON.parse(JSON.stringify(__rows)),employees:[{id:'new-staff',name:'Neu, Maria',email:'new@example.test'}]}};
if(name==='manager_set_access_profile'){const r=__rows.find(r=>r.user_id===args.p_user_id);Object.assign(r,{role:args.p_role,permissions:args.p_permissions,status:args.p_status});return{data:null}};
if(name==='manager_revoke_access_invite'){__rows=__rows.filter(r=>r.record_id!==args.p_invite_id);return{data:null}};
if(name==='manager_create_access_invite'){let r=__rows.find(r=>r.kind==='INVITE'&&r.email===args.p_email);if(!r){r={record_id:'new-invite',kind:'INVITE',email:args.p_email};__rows.push(r)}Object.assign(r,{role:args.p_role,permissions:args.p_permissions,status:'INVITED'});return{data:{id:r.record_id,parameter:args.p_role==='EMPLOYEE'&&!args.p_permissions.length?'employeeInvite':'teamInvite'}}};
throw Error('Unexpected RPC '+name);
}}};
`;
let browser;
(async()=>{
browser=await chromium.launch({headless:true,executablePath:process.env.SF_USERS_BROWSER});const reports=[];
for(const [name,width,theme,font] of [['desktop-dark',1440,'dark','normal'],['desktop-light',1280,'light','normal'],['mobile-dark',390,'dark','normal'],['small-mobile-light-large',320,'light','large']]){
 const context=await browser.newContext({viewport:{width,height:950},locale:'de-DE',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(v=>localStorage.setItem('sp_settings_v2',JSON.stringify({fontSize:v})),font);
 const html='<!doctype html><html lang="de" data-sf-theme="'+theme+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'#appShell{display:block!important}.main{max-width:1280px;margin:auto;padding:20px}#view-settings{max-width:1200px;margin:auto}</style></head><body><div id="appShell"><main class="main"><section id="view-settings" class="view active"><div class="page-head"></div></section></main></div>'+script(fixture)+script(read('assets/team-admin-v1.js'))+script(read('assets/settings-management-v2.js'))+'</body></html>';
 await page.route('https://users.test/**',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('https://users.test/');await page.locator('[data-setting-tab="users"]').click();await page.locator('.sf-users-table').waitFor();
 const row=id=>page.locator('.sf-user-row[data-id="'+id+'"]'),writes=()=>page.evaluate(()=>__calls.filter(c=>c.name!=='manager_list_access_users'));
 assert.equal(await page.locator('.sf-user-row').count(),9);assert.equal(await row('owner').locator('button').count(),0);assert.match(await row('lead-record').innerText(),/Bauer, Lea/);assert.equal(await page.locator('.sf-users-table img').count(),0);assert.deepEqual(await page.evaluate(()=>__alerts),[]);
 const names=await page.locator('.sf-user-id b').allTextContents();assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b,'de',{sensitivity:'base'})));
 assert.equal(await page.locator('#sfUserRoleFilter option').count(),5);
 await page.locator('#sfRoleComparison>summary').click();assert.equal(await page.locator('.sf-users-matrix thead th').count(),5);assert.match(await page.locator('.sf-users-matrix').innerText(),/Zusatzrecht/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('#sfRoleComparison>summary').click();await page.screenshot({path:path.join(out,name+'.png')});
 await row('time').locator('summary').click();assert.match(await row('time').innerText(),/Zeiten verwalten/);assert.match(await row('time').innerText(),/Zeiten bestätigen/);
 await page.locator('#sfUserSearch').fill('BAUER');assert.equal(await page.locator('.sf-user-row').count(),1);await page.locator('#sfUserSearch').fill('');
 await page.locator('#sfUserRoleFilter').selectOption('EMPLOYEE');assert.equal(await page.locator('.sf-user-row').count(),3);await page.locator('#sfUserRoleFilter').selectOption('');
 await row('lead-record').locator('[data-edit-role]').click();assert.equal(await page.locator('#sfEditUserRole option').count(),3);await page.locator('[data-access-permission="publish_schedule"]').check();await page.locator('[data-access-permission="manage_time"]').check();
 await page.screenshot({path:path.join(out,name+'-role-dialog.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.keyboard.press('Escape');assert.deepEqual(await writes(),[]);
 await row('lead-record').locator('[data-edit-role]').click();await page.locator('[data-access-permission="publish_schedule"]').check();await page.locator('[data-access-permission="confirm_time"]').check();await page.locator('#sfSaveUserRole').click();await page.locator('#sfUserModal').waitFor({state:'detached'});
 const changed=(await writes())[0];assert.equal(changed.args.p_user_id,'lead-user');assert.deepEqual(changed.args.p_permissions,['publish_schedule','confirm_time']);
 await row('lead-record').locator('[data-edit-role]').click();await page.locator('[data-access-permission="read_only"]').check();assert.equal(await page.locator('[data-access-permission="publish_schedule"]').isDisabled(),true);assert.equal(await page.locator('[data-access-permission="confirm_time"]').isChecked(),false);await page.locator('[data-close]').click();
 await page.evaluate(()=>__fail='manager_set_access_profile');await row('lead-record').locator('[data-toggle]').click();await page.locator('#sfConfirmUserAccess').click();await page.locator('#sfUserMsg.show').waitFor();assert.match(await page.locator('#sfUserMsg').innerText(),/Verbindung/);await page.locator('[data-close]').click();await page.evaluate(()=>__fail=null);
 await row('lead-record').locator('[data-toggle]').click();await page.locator('#sfConfirmUserAccess').click();await page.locator('#sfUserModal').waitFor({state:'detached'});assert.match(await row('lead-record').innerText(),/Gesperrt/);assert.deepEqual((await writes()).at(-1).args.p_permissions,['publish_schedule','confirm_time']);
 await row('invite').locator('[data-new]').click();assert.equal(await page.locator('[data-access-permission="publish_schedule"]').isChecked(),true);await page.locator('#sfInviteRole').selectOption('EMPLOYEE');await page.locator('[data-access-permission="manage_time"]').check();await page.locator('#sfCreateTeamInvite').click();await page.locator('#sfTeamInviteValue').waitFor();assert.match(await page.locator('#sfTeamInviteValue').inputValue(),/teamInvite=/);assert.match((await writes()).at(-1).args.p_token_hash,/^[a-f0-9]{64}$/);await page.locator('[data-close]').click();
 await row('expired').locator('[data-revoke]').click();await page.locator('#sfConfirmRevoke').click();await page.locator('#sfUserModal').waitFor({state:'detached'});assert.equal(await row('expired').count(),0);
 await page.locator('#sfInviteUser').click();assert.equal(await page.locator('#sfInviteRole').inputValue(),'EMPLOYEE');await page.locator('#sfInviteEmail').fill('new@example.test');await page.locator('#sfCreateTeamInvite').click();assert.match(await page.locator('#sfUserMsg').innerText(),/Mitarbeiterprofil/);await page.locator('#sfAccessEmployee').selectOption('new-staff');await page.locator('#sfCreateTeamInvite').click();await page.locator('#sfTeamInviteValue').waitFor();assert.match(await page.locator('#sfTeamInviteValue').inputValue(),/employeeInvite=/);await page.locator('[data-close]').click();
 await row('admin').locator('[data-edit-role]').click();await page.locator('#sfEditUserRole').selectOption('TEAM_LEAD');const before=(await writes()).length;await page.evaluate(()=>SFBackend.companyId='other-company');await page.locator('#sfSaveUserRole').click();await page.locator('#sfUserMsg.show').waitFor();assert.equal((await writes()).length,before);assert.match(await page.locator('#sfUserMsg').innerText(),/Unternehmen/);await page.locator('[data-close]').click();
 await page.evaluate(async()=>{SFBackend.companyId='company-test';SFBackend.role='ADMIN';await SFBackend.renderUserManagement(document.querySelector('#sfSettingBody'))});await page.locator('.sf-users-table').waitFor();assert.equal(await row('admin').locator('button').count(),0);await page.locator('#sfInviteUser').click();assert.equal(await page.locator('#sfInviteRole option[value="ADMIN"]').count(),0);await page.locator('[data-close]').click();
 const count=await page.evaluate(()=>__calls.length);await page.evaluate(async()=>{SFBackend.role='PLANNER';await SFBackend.renderUserManagement(document.querySelector('#sfSettingBody'))});assert.equal(await page.evaluate(()=>__calls.length),count);assert.deepEqual(errors,[]);reports.push({name,fourRoles:true,extraRights:true,portalInvites:true,ownerAdminProtection:true,scopeProtection:true,noOverflow:true});await context.close();
}
const capabilityPage=await browser.newPage();
await capabilityPage.setContent('<html><body><nav><button data-view="schedule">Plan</button><button data-view="time">Zeit</button></nav><div class="side-bottom"><div class="user-row"><small></small></div></div></body></html>');
await capabilityPage.evaluate(()=>{
 window.__context={role:'TEAM_LEAD',permissions:[],backend_role:'PLANNER'};window.__contextError=false;
 window.SFBackend={companyId:'one',role:'PLANNER',user:{id:'fixture'},ensureCompany:async()=>{},can:()=>true,baseOpenApp:v=>v,hydrate:async()=>{},sync:async()=>{},importLegacy:async()=>{},updateState:()=>{},client:{rpc:async()=>__contextError?{error:{message:'context denied'}}:{data:__context}}};
});
await capabilityPage.addScriptTag({content:read('assets/access-profiles-v1.js')});
let capabilities=await capabilityPage.evaluate(async()=>{await SFBackend.ensureCompany();return ['plan','publish','manageTime','confirmTime','viewTime','manageUsers'].map(k=>SFBackend.can(k))});
assert.deepEqual(capabilities,[true,false,false,false,false,false]);
capabilities=await capabilityPage.evaluate(async()=>{__context.permissions=['confirm_time'];await SFBackend.ensureCompany();return ['publish','manageTime','confirmTime','viewTime'].map(k=>SFBackend.can(k))});
assert.deepEqual(capabilities,[false,false,true,true]);
capabilities=await capabilityPage.evaluate(async()=>{__context.permissions=['read_only'];await SFBackend.ensureCompany();return ['plan','publish','manageTime','confirmTime'].map(k=>SFBackend.can(k))});
assert.deepEqual(capabilities,[false,false,false,false]);assert.equal(await capabilityPage.locator('[data-view="time"]').isHidden(),true);
capabilities=await capabilityPage.evaluate(async()=>{__context={role:'OWNER',permissions:[],backend_role:'OWNER'};SFBackend.role='OWNER';await SFBackend.ensureCompany();return ['plan','publish','manageTime','confirmTime','manageUsers'].map(k=>SFBackend.can(k))});
assert.deepEqual(capabilities,[true,true,true,true,true]);assert.equal(await capabilityPage.locator('[data-view="time"]').isHidden(),false);
const denied=await capabilityPage.evaluate(async()=>{__contextError=true;try{await SFBackend.ensureCompany();return false}catch{return SFBackend.accessRole===null&&SFBackend.accessPermissions.length===0}});
assert.equal(denied,true,'failed context clears previous capabilities');await capabilityPage.close();
await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1});
