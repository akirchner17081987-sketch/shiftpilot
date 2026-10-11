const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const displaySource=read('assets/schedule-employee-display-v1.js');
function display(){const c={SFBackend:{companyId:'company-a'}};c.window=c;vm.createContext(c);vm.runInContext(displaySource,c);return{c,d:c.SFScheduleEmployeeDisplay};}
const configuration={order:['alpha','bravo','charlie'],priorityPersonnelNos:['alpha'],colored:true,byTeam:false,colorGroups:{yellow:['alpha'],turquoise:['bravo']}};
test('schedule uses protected assignments and clears the previous company on replacement',()=>{
 const{c,d}=display(),people=['charlie','bravo','alpha'].map(personnelNo=>({personnelNo,last:personnelNo}));
 assert.equal(d.enabled(),false);assert.equal(d.compare(people[0],people[1]),0);
 d.apply(configuration,'company-a');assert.deepEqual(people.sort(d.compare).map(e=>e.personnelNo),configuration.order);
 assert.equal(d.color(people[0]).rgb[0],255);assert.equal(d.color(people[1]).rgb[0],183);assert.equal(d.color(people[2]).rgb[0],247);
 assert.equal(d.enabled('company-b'),false);assert.equal(d.color(people[0],'company-b'),null);
 d.apply({...configuration,byTeam:true,colored:false},'company-b');c.SFBackend.companyId='company-b';
 const rows=[{personnelNo:'charlie',planningTeam:'B'},{personnelNo:'bravo',planningTeam:'A'},{personnelNo:'alpha',planningTeam:'E'}];
 assert.deepEqual(rows.sort(d.compare).map(e=>e.personnelNo),['alpha','bravo','charlie']);assert.equal(d.color(rows[0]),null);
 assert.equal(d.orderEnabled('company-a'),false);d.clear();assert.equal(d.orderEnabled(),false);
});
test('help exposes operational details only for the authenticated current company and escapes them',()=>{
 const nodes=new Map(),listeners={};function node(id){if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',hidden:true,addEventListener(k,f){this[k]=f},setAttribute(){},focus(){}});return nodes.get(id);}
 const c={window:{},document:{getElementById:node,querySelector:()=>node('helpButton'),addEventListener:(k,f)=>listeners[k]=f},setTimeout:f=>f()};vm.createContext(c);
 vm.runInContext(read('assets/help-center-content-v3.js'),c);vm.runInContext(read('assets/help-center-renderer-v2.js'),c);
 const question='Wie werden Mitarbeiter mit festen Schichtfreigaben geplant?',privateAnswer='Interne Zuordnung private-number <img src=x onerror=alert(1)>';
 const b=c.window.SFBackend={ready:false,user:{id:'manager'},companyId:'company-a',companyPrivateConfiguration:{companyId:'company-a',data:{helpArticles:{auto:{[question]:privateAnswer}}}}};
 const draw=()=>listeners.click({target:{closest:s=>s==='[data-hcat]'?{dataset:{hcat:'auto'}}:null}});
 draw();assert.ok(!node('sfHelpResults').innerHTML.includes('private-number'));
 b.ready=true;draw();assert.ok(node('sfHelpResults').innerHTML.includes('private-number'));assert.ok(node('sfHelpResults').innerHTML.includes('&lt;img'));assert.ok(!node('sfHelpResults').innerHTML.includes('<img src=x'));
 b.companyId='company-b';draw();assert.ok(!node('sfHelpResults').innerHTML.includes('private-number'));
 b.companyId='company-a';b.user=null;draw();assert.ok(!node('sfHelpResults').innerHTML.includes('private-number'));
});
test('public assets contain no concrete company identifiers or personnel assignments',()=>{
 for(const file of fs.readdirSync(path.join(root,'assets')).filter(f=>/\.(js|json|html|svg)$/.test(f))){
  const text=read('assets/'+file),ids=text.match(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/g)||[];
  for(const id of ids)assert.ok(id.startsWith('00000000-'),file+' contains a concrete company identifier');
  assert.doesNotMatch(text,/['"](?:2001|2048|2059|2015)['"]|Personalnummern 2001|Bei SchichtFunk gelten|Secontec Services/,file);
 }
});
test('private configuration has tenant RLS and an invoker RPC with no anonymous grant',()=>{
 const sql=read('database/company-private-client-configuration-v1.sql');assert.match(sql,/enable row level security/);assert.match(sql,/for select to authenticated/);assert.match(sql,/sf_company_profile_can_read\(company_id\)/);assert.match(sql,/security invoker set search_path = ''/);assert.match(sql,/auth.uid\(\) is null/);assert.match(sql,/sf_assert_aal2/);assert.match(sql,/revoke all on function public.company_private_client_configuration\(uuid\) from public, anon/);assert.doesNotMatch(sql,/grant .* to anon|security definer|insert into private.company_client_configuration/i);
 assert.equal(sql,read('supabase/migrations/20261011210301_private_company_client_configuration.sql'));
});
