const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../assets/wish-planning-core-v1.js'),S=require('../assets/solid-planning-core-v1.js');
const source=fs.readFileSync('assets/wish-planning-v1.js','utf8');
const promised={id:'promise',employee_id:'db-a',kind:'OFF',status:'PROMISED',start_date:'2027-01-08',end_date:'2027-01-08',starts_at:'2027-01-07T23:00:00Z',ends_at:'2027-01-08T23:00:00Z'};
const duty={date:'2027-01-08',type:'OT1',start:'06:00',end:'16:00'};
function fixture(rpc){
 const calls=[];const context={console,Date,Intl,Event,setTimeout,clearTimeout,setInterval(){},sessionStorage:{getItem:()=>null},document:{getElementById:()=>null,querySelector:()=>null,addEventListener(){}},SFWishCore:C,SFSolidPlanningCore:S,SFBackend:{ready:true,companyId:'alpha',user:{id:'owner'},role:'OWNER',companyTimeZone:'Europe/Berlin',empLocal:new Map([['db-a','a']]),hydrate:async()=>{},updateState(){},client:{rpc(name,args){calls.push({name,args});return rpc(name,args)}}}};
 context.window=context;vm.createContext(context);vm.runInContext(source,context);return{context,calls,api:context.SFWishPlanning};
}
test('late-loaded wish module automatically fetches once and permits drafts before wishes arrive',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const {api,calls}=fixture(()=>pending);
 assert.equal(calls.length,1,'initial feed loads even when company hydration already completed');
 for(let i=0;i<10;i++)assert.equal(api.check('a',duty),null);
 assert.equal(calls.length,1,'candidate checks share the pending request');
 const prefs=api.optimizer('2027-01',[{id:'a',shifts:['OT1']}],[]);
 assert.equal(prefs.accept({id:'a'},[],[{...duty,employeeId:'a'}]),true);
 const loaded=api.refreshFeed();resolve({data:{company_id:'alpha',wishes:[]}});await loaded;
 assert.equal(api.feedReady(),true);assert.equal(api.check('a',duty),null);
});
test('missing or failed wish data does not block preplanning; loaded promises survive refresh failures',async()=>{
 let fail=false;const {api,calls}=fixture(()=>fail?{error:{message:'offline'}}:{data:{company_id:'alpha',wishes:[promised]}});
 await api.refreshFeed();assert.match(api.check('a',duty).message,/Geschützte/);
 fail=true;await api.refreshFeed({optional:true});assert.match(api.check('a',duty).message,/Geschützte/,'cached company promise remains effective');
 await assert.rejects(api.refreshFeed(),e=>e.message==='offline','explicit refresh still reports connectivity errors');
 assert.equal(api.check('b',duty),null);assert.ok(calls.length>=2);
 const unavailable=fixture(()=>({error:{message:'offline'}}));
 await unavailable.api.refreshFeed({optional:true});assert.equal(unavailable.api.check('a',duty),null);
 const prefs=unavailable.api.optimizer('2027-01',[{id:'a',shifts:['OT1']}],[]);assert.equal(prefs.accept({id:'a'},[],[{...duty,employeeId:'a'}]),true);
 assert.equal(unavailable.calls.length,1,'failed background request is throttled instead of retried per candidate');
});
test('company switch clears promises and ignores delayed responses from the previous company',async()=>{
 const requests=new Map();const {context,api}=fixture((name,args)=>new Promise(resolve=>requests.set(args.p_company_id,resolve)));
 context.SFBackend.companyId='beta';context.SFBackend.updateState();
 assert.equal(api.check('a',duty),null);
 requests.get('alpha')({data:{company_id:'alpha',wishes:[promised]}});
 const loaded=api.refreshFeed();requests.get('beta')({data:{company_id:'beta',wishes:[]}});await loaded;
 assert.equal(api.feedReady(),true);assert.equal(api.check('a',duty),null);
 context.SFBackend.role='TIME_TRACKING';context.SFBackend.updateState();assert.equal(api.feedReady(),false);
});
