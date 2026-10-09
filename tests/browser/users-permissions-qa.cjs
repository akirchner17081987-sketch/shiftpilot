// Run: node tests/browser/users-permissions-qa.cjs. Uses intercepted fictitious data only.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/users-permissions');fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),index=read('index.html');
const styles=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[1]!==undefined?m[1]:read(m[0].match(/href="([^"]+)"/)[1].split('?')[0])).join('\n');
const script=s=>'<script>'+s.replace(/<\/script/gi,'<\\/script')+'</script>';
const fixture=`
window.TYPES=[];window.DAYS=[];window.__calls=[];window.__fail=null;window.__alerts=[];window.alert=message=>__alerts.push(message);window.showSaveToast=(...args)=>window.__toast=args;
window.employees=[{first:'Alex',last:'Muster',email:'owner@example.test'},{first:'Lea',last:'Bauer',email:'planner@example.test'},{first:'Alex',last:'<img src=x onerror=alert(1)>',email:'viewer@example.test'}];
window.__rows=[
{record_id:'owner',user_id:'owner',email:'owner@example.test',role:'OWNER',status:'ACTIVE',kind:'MEMBER',is_self:true},
{record_id:'admin',user_id:'admin',email:'admin@example.test',role:'ADMIN',status:'ACTIVE',kind:'MEMBER'},
{record_id:'planner-record',user_id:'planner-user',email:'planner@example.test',role:'PLANNER',status:'ACTIVE',kind:'MEMBER'},
{record_id:'dispatch',user_id:'dispatch',email:'dispatch@example.test',role:'DISPATCHER',status:'ACTIVE',kind:'MEMBER'},
{record_id:'viewer',user_id:'viewer',email:'viewer@example.test',role:'VIEWER',status:'ACTIVE',kind:'MEMBER'},
{record_id:'time',user_id:'time',email:'time@example.test',role:'TIME_TRACKING',status:'ACTIVE',kind:'MEMBER'},
{record_id:'disabled',user_id:'disabled',email:'disabled@example.test',role:'PLANNER',status:'DISABLED',kind:'MEMBER'},
{record_id:'invite',email:'invite@example.test',role:'PLANNER',status:'INVITED',kind:'INVITE',expires_at:'2026-10-16T10:00:00Z'},
{record_id:'expired',email:'expired@example.test',role:'VIEWER',status:'EXPIRED',kind:'INVITE',expires_at:'2026-10-01T10:00:00Z'}];
window.SFBackend={role:'OWNER',companyId:'company-test',ready:true,init:async()=>{},client:{rpc:async(name,args)=>{
__calls.push({name,args});await new Promise(r=>setTimeout(r,20));
if(__fail===name)return{error:{message:'Test: Verbindung unterbrochen'}};
if(name==='manager_list_company_users')return{data:JSON.parse(JSON.stringify(__rows))};
if(name==='manager_update_company_member'){const row=__rows.find(r=>r.user_id===args.p_user_id);if(!row||row.role==='OWNER'||row.is_self)return{error:{message:'Geschützter Zugang'}};row.role=args.p_role;row.status=args.p_status;return{data:null}};
if(name==='manager_revoke_company_invite'){__rows=__rows.filter(r=>r.record_id!==args.p_invite_id);return{data:null}};
if(name==='manager_create_company_invite'){let row=__rows.find(r=>r.kind==='INVITE'&&r.email===args.p_email);if(!row){row={record_id:'new-invite',kind:'INVITE',email:args.p_email};__rows.push(row)}Object.assign(row,{role:args.p_role,status:'INVITED',expires_at:'2026-10-16T10:00:00Z'});return{data:row.record_id}};
throw Error('Unexpected RPC '+name);
}}};
`;
let browser;
(async()=>{
browser=await chromium.launch({headless:true,...(process.env.SF_USERS_BROWSER?{executablePath:process.env.SF_USERS_BROWSER}:{})});
const reports=[];
for(const [name,width,theme,font] of [['desktop-dark',1440,'dark','normal'],['desktop-light',1280,'light','normal'],['mobile-dark',390,'dark','normal'],['small-mobile-light-large',320,'light','large']]){
 const context=await browser.newContext({viewport:{width,height:950},locale:'de-DE',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await context.addInitScript(value=>localStorage.setItem('sp_settings_v2',JSON.stringify({fontSize:value})),font);
 const html='<!doctype html><html lang="de" data-sf-theme="'+theme+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'#appShell{display:block!important}.main{max-width:1280px;margin:auto;padding:20px}#view-settings{max-width:1200px;margin:auto}</style></head><body><div id="appShell"><main class="main"><section id="view-settings" class="view active"><div class="page-head"></div></section></main></div>'+script(fixture)+script(read('assets/team-admin-v1.js'))+script(read('assets/settings-management-v2.js'))+'</body></html>';
 await page.route('https://users.test/**',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('https://users.test/');await page.locator('[data-setting-tab="users"]').click();await page.locator('.sf-users-table').waitFor();
 const row=id=>page.locator('.sf-user-row[data-id="'+id+'"]'),writes=()=>page.evaluate(()=>__calls.filter(c=>c.name!=='manager_list_company_users'));
 assert.equal(await page.locator('.sf-user-row').count(),9);assert.equal(await row('owner').locator('button').count(),0);
 assert.match(await row('planner-record').innerText(),/Bauer, Lea/);assert.equal(await page.locator('.sf-users-table img').count(),0,'escape names');assert.deepEqual(await page.evaluate(()=>__alerts),[]);
 const names=await page.locator('.sf-user-id b').allTextContents();assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b,'de',{sensitivity:'base'})));
 assert.equal(await page.locator('#sfRoleComparison').getAttribute('open'),null);
 await row('planner-record').locator('summary').click();assert.match(await row('planner-record').innerText(),/Dienstplan bearbeiten und veröffentlichen/);
 await page.locator('#sfRoleComparison>summary').click();assert.equal(await page.locator('.sf-users-matrix thead th').count(),7);assert.equal(await page.locator('.sf-users-matrix tbody tr').count(),6);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'matrix stays within its scroll region');
 await page.locator('#sfRoleComparison>summary').click();
 await row('planner-record').locator('summary').click();
 await page.evaluate(()=>{document.body.scrollTo({top:0,behavior:'instant'});document.querySelector('.main').scrollTo({top:0,behavior:'instant'});window.scrollTo({top:0,behavior:'instant'})});
 await page.screenshot({path:path.join(out,name+'.png')});
 await page.locator('#sfUserSearch').fill('BAUER');assert.equal(await page.locator('.sf-user-row').count(),1);assert.deepEqual(await writes(),[]);
 await page.locator('#sfUserSearch').fill('');await page.locator('#sfUserStatusFilter').selectOption('invited');assert.equal(await page.locator('.sf-user-row').count(),1);assert.match(await row('invite').innerText(),/◷\s+Einladung ausstehend/);
 await page.locator('#sfUserRoleFilter').selectOption('VIEWER');assert.equal(await page.locator('.sf-user-row').count(),0);await page.locator('#sfClearUserFilters').click();assert.equal(await page.locator('.sf-user-row').count(),9);
 await row('planner-record').locator('[data-edit-role]').click();assert.equal(await page.locator('#sfSaveUserRole').isDisabled(),true);await page.locator('#sfEditUserRole').selectOption('VIEWER');await page.locator('#sfSelectedRoleInfo summary').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'dialog has no horizontal overflow');await page.screenshot({path:path.join(out,name+'-role-dialog.png')});assert(!await page.locator('#sfSelectedRoleInfo').innerText().then(t=>t.includes('Dienstplan bearbeiten und veröffentlichen')));
 await page.keyboard.press('Escape');assert.equal(await page.locator('#sfUserModal').count(),0);assert.deepEqual(await writes(),[]);
 await row('planner-record').locator('[data-edit-role]').click();await page.locator('#sfEditUserRole').selectOption('VIEWER');await page.locator('#sfSaveUserRole').click();await page.locator('#sfUserModal').waitFor({state:'detached'});
 assert.equal((await writes())[0].args.p_user_id,'planner-user','use user ID rather than record ID');assert.equal((await writes())[0].args.p_company_id,'company-test');assert.match(await row('planner-record').innerText(),/Leser/);
 await row('planner-record').locator('[data-toggle]').click();await page.locator('[data-close]').click();assert.equal((await writes()).length,1,'cancel does not change access');
 await page.evaluate(()=>__fail='manager_update_company_member');await row('planner-record').locator('[data-toggle]').click();await page.locator('#sfConfirmUserAccess').click();await page.locator('#sfUserMsg.show').waitFor();assert.match(await page.locator('#sfUserMsg').innerText(),/Verbindung/);assert.match(await row('planner-record').innerText(),/✓\s+Aktiv/);await page.locator('[data-close]').click();await page.evaluate(()=>__fail=null);
 await page.locator('#sfUserRoleFilter').selectOption('VIEWER');await row('planner-record').locator('[data-toggle]').click();await page.locator('#sfConfirmUserAccess').click();await page.locator('#sfUserModal').waitFor({state:'detached'});assert.equal(await page.locator('#sfUserRoleFilter').inputValue(),'VIEWER');assert.match(await row('planner-record').innerText(),/⊘\s+Gesperrt/);
 await row('planner-record').locator('[data-toggle]').click();await page.locator('#sfConfirmUserAccess').click();await page.locator('#sfUserModal').waitFor({state:'detached'});assert.match(await row('planner-record').innerText(),/✓\s+Aktiv/);
 await page.locator('#sfUserRoleFilter').selectOption('');
 await row('invite').locator('[data-new]').click();assert.equal(await page.locator('#sfInviteEmail').getAttribute('readonly'),'');await page.locator('#sfInviteRole').selectOption('TIME_TRACKING');await page.locator('#sfCreateTeamInvite').click();await page.locator('#sfTeamInviteValue').waitFor();assert.match(await page.locator('#sfUserModal').innerText(),/keine E-Mail versendet/);assert.match(await page.locator('#sfTeamInviteValue').inputValue(),/teamInvite=/);
 const renew=(await writes()).find(c=>c.name==='manager_create_company_invite');assert.equal(renew.args.p_role,'TIME_TRACKING');assert.match(renew.args.p_token_hash,/^[a-f0-9]{64}$/);await page.locator('[data-close]').click();assert.match(await row('invite').innerText(),/Nur Zeiterfassung/);
 await row('expired').locator('[data-revoke]').click();await page.locator('[data-close]').click();assert.equal(await row('expired').count(),1);await row('expired').locator('[data-revoke]').click();await page.locator('#sfConfirmRevoke').click();await page.locator('#sfUserModal').waitFor({state:'detached'});assert.equal(await row('expired').count(),0);
 await page.locator('#sfInviteUser').click();await page.locator('#sfInviteEmail').fill('invalid');await page.locator('#sfCreateTeamInvite').click();assert.match(await page.locator('#sfUserMsg').innerText(),/gültige E-Mail/);
 await page.locator('#sfInviteEmail').fill('new@example.test');await page.locator('#sfInviteRole').selectOption('DISPATCHER');await page.locator('#sfCreateTeamInvite').click();await page.locator('#sfTeamInviteValue').waitFor();await page.locator('[data-close]').click();assert.match(await row('new-invite').innerText(),/Einladung ausstehend/);
 await row('admin').locator('[data-edit-role]').click();await page.locator('#sfEditUserRole').selectOption('PLANNER');const countBefore=(await writes()).length;await page.evaluate(()=>SFBackend.companyId='other-company');await page.locator('#sfSaveUserRole').click();await page.locator('#sfUserMsg.show').waitFor();assert.match(await page.locator('#sfUserMsg').innerText(),/Unternehmen/);assert.equal((await writes()).length,countBefore,'company switch cancels writes');await page.locator('[data-close]').click();await page.evaluate(()=>SFBackend.companyId='company-test');
 await page.evaluate(()=>{__rows.find(r=>r.record_id==='admin').is_self=true});await page.locator('#sfRefreshUsers').click();await row('admin').locator('.sf-user-protected').waitFor();assert.equal(await row('admin').locator('button').count(),0,'own non-owner account protected');
 await page.evaluate(()=>__fail='manager_list_company_users');await page.locator('#sfRefreshUsers').click();await page.locator('#sfUsersNotice.bad').waitFor();assert.match(await page.locator('#sfUsersNotice').innerText(),/Verbindung/);await page.evaluate(()=>__fail=null);
 const beforeDenied=await page.evaluate(()=>__calls.length);await page.evaluate(async()=>{SFBackend.role='PLANNER';await SFBackend.renderUserManagement(document.querySelector('#sfSettingBody'))});assert.equal(await page.evaluate(()=>__calls.length),beforeDenied,'unauthorized role cannot fetch users');assert.match(await page.locator('#sfSettingBody').innerText(),/Nur Inhaber und Administratoren/);
 assert.deepEqual(errors,[]);reports.push({name,sortedNames:true,roles:true,filters:true,protectedAccounts:true,companyScope:true,inviteLinks:true,errorRecovery:true,noOverflow:true});await context.close();
}
await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1});
