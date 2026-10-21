const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
async function environment(){
 const {Window}=await import('happy-dom'),w=new Window({url:'https://fixture.invalid'});
 w.structuredClone=structuredClone;
 w.document.body.innerHTML='<div id="sfSettingsV2"><div class="sf-set-head"><span class="status"></span></div></div><div id="sfSettingBody"></div>';
 const fixture={calls:[],profile:{company_id:'company-a',name:'Own company',timezone:'Europe/Berlin',contacts:[],revision:1,can_edit:true,sites:[{id:'own',company_id:'company-a',name:'Own object',code:'A',address:'Example 1, 12345 Ort',is_active:true,geocode_status:'pending'}]}};
 const B=w.SFBackend={ready:false,user:{id:'manager'},companyId:'company-a',role:'OWNER',accessRole:'OWNER',client:{
  rpc:async()=>({data:structuredClone(fixture.profile)}),
  functions:{invoke:async(name,args)=>{
   fixture.calls.push({name,args});Object.assign(fixture.profile.sites[0],{longitude:12.3,latitude:51.3,geocode_address:fixture.profile.sites[0].address,geocode_status:'verified',geocode_source:'nominatim'});
   return {data:{site:structuredClone(fixture.profile.sites[0])}};
  }}
 }};
 w.eval(fs.readFileSync('assets/company-profile-v1.js','utf8'));B.ready=true;
 return {w,B,fixture,P:w.SFCompanyProfile,close:()=>w.happyDOM.abort()};
}
test('company profile automatically resolves its own active objects and shows the saved status',async()=>{
 const {w,P,fixture,close}=await environment();try{
  fixture.profile.sites.push({id:'archived',name:'Old',is_active:false,address:'Other 2, 23456 Ort'});
  await P.load();await P.locateSites();assert.equal(fixture.calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls[0])),{name:'location-geocode',args:{body:{company_id:'company-a',site_id:'own'}}});
  assert.equal(P.current().sites[0].longitude,12.3);assert.equal(P.current().sites[0].geocode_status,'verified');
  await P.render(w.document.getElementById('sfSettingBody'));w.document.querySelector('[data-company-panel="sites"]').click();
  assert.match(w.document.querySelector('[data-site-geo="own"]').textContent,/Auf der Karte verortet/);
 }finally{await close();}
});
test('a delayed result from the previous company cannot modify the new company profile',async()=>{
 const {P,B,fixture,close}=await environment();try{
  let complete;B.client.functions.invoke=()=>new Promise(resolve=>complete=resolve);
  await P.load();const pending=P.locateSites();B.companyId='company-b';
  fixture.profile={...fixture.profile,company_id:'company-b',sites:[{id:'b',company_id:'company-b',name:'B',is_active:true,address:'B 1, 12345 Ort',geocode_status:'verified',longitude:8,latitude:50}]};
  await P.load({force:true});complete({data:{site:{id:'own',company_id:'company-a',address:'Example 1, 12345 Ort',longitude:12,latitude:51,geocode_status:'verified'}}});await pending;
  assert.equal(P.current().company_id,'company-b');assert.equal(P.current().sites[0].id,'b');assert.equal(P.current().sites[0].longitude,8);
 }finally{await close();}
});
test('a foreign or mismatched response is discarded without copying a location',async()=>{
 const {P,B,fixture,close}=await environment();try{
  B.client.functions.invoke=async()=>({data:{site:{id:'own',company_id:'company-b',address:fixture.profile.sites[0].address,longitude:12,latitude:51,geocode_status:'verified'}}});
  await P.load();await P.locateSites();assert.equal(P.current().sites[0].longitude,undefined);assert.equal(P.current().sites.length,1);
 }finally{await close();}
});
