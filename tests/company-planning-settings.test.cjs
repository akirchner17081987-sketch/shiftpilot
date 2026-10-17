const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite'),core=require('../assets/solid-planning-core-v1.js');
const source=fs.readFileSync('assets/settings-management-v2.js','utf8');
function fixture(){
 const nodes=new Map();const body={innerHTML:'',querySelectorAll:()=>[],querySelector(id){if(!nodes.has(id))nodes.set(id,{onclick:null,onsubmit:null,textContent:'',addEventListener(){}});return nodes.get(id)}};
 const ctx={document:{readyState:'loading',addEventListener(){},querySelector:s=>s==='.company-card b'?{textContent:'Alpha'}:null},console,addEventListener(){},setTimeout(){},localStorage:{getItem:()=>null},TYPES:[{id:'OT2',start:'08:00',end:'18:00',active:true}],employees:[{id:'a',last:'Alpha',first:'Person',personnelNo:'private-alpha',status:'active',shifts:['OT2'],weeklyHours:40}],globalSoll:{OT2:2},SFBackend:{ready:true,companyId:'alpha',planningPolicyCompanyId:'alpha',role:'OWNER',companyTimeZone:'Europe/Berlin'},SFCompliance:{policy:{solidPlanningRules:{enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',otOnlyMonthlyMaxHours:220}}},SFShiftModels:{isCompanyLoaded:()=>true,models:[{id:'OT2',start:'08:00',end:'18:00',active:true}],coverageGroup:()=>null,invalidate(){}},SFSolidPlanningCore:core};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);return{ctx,body};
}
test('settings show current company only, suppress stale company data and signed-out data',()=>{
 const{ctx,body}=fixture();ctx.SFPlanningRuleSettings.render(body);assert.match(body.innerHTML,/Alpha/);assert.match(body.innerHTML,/private-alpha/);assert.match(body.innerHTML,/value="220"/);assert.match(body.innerHTML,/OT1, OT2 und OT3/);assert.match(body.innerHTML,/normale OT am Wochenende ist davon ausgenommen/);assert.doesNotMatch(body.innerHTML,/8 h:|Secontec|FD-WE/);
 ctx.SFBackend.companyId='beta';ctx.SFPlanningRuleSettings.render(body);assert.doesNotMatch(body.innerHTML,/private-alpha|value="220"/);
 ctx.SFBackend.companyId='alpha';ctx.SFBackend.ready=false;ctx.SFPlanningRuleSettings.render(body);assert.doesNotMatch(body.innerHTML,/private-alpha|value="220"/);
});
test('failed save does not change rules or clear preview; save applies acknowledged company data',async()=>{
 const{ctx}=fixture();let invalidate=0,args;ctx.clearAutoPlanPreview=()=>invalidate++;ctx.SFBackend.client={rpc:async(name,p)=>{args=p;return{error:{message:'offline'}}}};
 await assert.rejects(ctx.SFPlanningRuleSettings.save({maxConsecutiveShifts:3},{},'alpha'),/offline/);assert.equal(invalidate,0);assert.equal(ctx.SFCompliance.policy.solidPlanningRules.maxConsecutiveShifts,undefined);assert.equal(ctx.SFBackend.planningRulesSaving,false);
 ctx.SFBackend.client.rpc=async(name,p)=>({data:{company_id:p.p_company_id,solid_planning_rules:{enabled:true,confirmedRulesVersion:2,maxConsecutiveShifts:p.p_patch.maxConsecutiveShifts},monthly_planning_max_hours:190,monthly_planning_max_shifts:18}});
 await ctx.SFPlanningRuleSettings.save({maxConsecutiveShifts:3},{},'alpha');assert.equal(ctx.SFCompliance.policy.solidPlanningRules.maxConsecutiveShifts,3);assert.equal(invalidate,1);assert.equal(args.p_company_id,'alpha');
 ctx.SFBackend.role='PLANNER';await assert.rejects(ctx.SFPlanningRuleSettings.save({maxConsecutiveShifts:3},{},'alpha'),/Änderungsrechte/);
 ctx.SFBackend.role='OWNER';await assert.rejects(ctx.SFPlanningRuleSettings.save({maxConsecutiveShifts:3},{},'beta'),/Änderungsrechte/);
});
test('OT settings contain separate inputs while the 8h model is explicitly identified',()=>{
 const {ctx,body}=fixture();ctx.TYPES.push({id:'TR',start:'08:00',end:'16:00',active:true});ctx.SFShiftModels.models.push(ctx.TYPES[1]);
 Object.assign(ctx.SFCompliance.policy.solidPlanningRules,{otOnlyMaxCalendarWeekHours:50,otOnlyMaxConsecutiveShifts:5});
 ctx.SFPlanningRuleSettings.render(body);
 const ot=body.innerHTML.split('data-ot-day-settings>')[1].split('</section>')[0];
 assert.match(ot,/10 Stunden/);assert.match(ot,/data-rule-key="otOnlyMaxCalendarWeekHours" value="50"/);assert.match(ot,/data-rule-key="otOnlyMaxConsecutiveShifts" value="5"/);
 assert.doesNotMatch(ot,/eightHour|data-rule-key="maxCalendarWeekHours"/);
 assert.match(body.innerHTML,/Vorhandene Modelle: TR/);assert.match(body.innerHTML,/Schichtmodelle bis 8 Stunden/);
});
test('configured blocks, nights, recovery and monthly caps change actual client decisions',()=>{
 const p={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin'},e={id:'a',employment:'Vollzeit',monthlyHours:180,weeklyHours:40,shifts:['FD']},rows=[1,2,3].map(d=>({employeeId:'a',date:'2027-01-0'+d,type:'FD',start:'06:00',end:'14:00'}));
 assert.equal(core.errors(e,rows,p).length,0);assert.ok(core.errors(e,rows,{...p,maxConsecutiveShifts:2}).length);
 assert.equal(core.errors(e,rows,{...p,maxCalendarWeekHours:16}).some(r=>r.message.includes('Kalenderwoche')),true);
 assert.equal(core.errors(e,[rows[0],{...rows[0],date:'2027-01-04'}],{...p,minFreeCalendarDays:3}).some(r=>r.message.includes('Kalendertage')),true);
 const l=core.limits(e,[{id:'FD',start:'06:00',end:'14:00'}],{...p,monthlyMaxHours:175,eightHourAutoMaxHours:168,eightHourMaxShifts:21});assert.equal(l.monthLimit,168);assert.equal(l.calendarLimit,175);assert.equal(l.maxMonthlyShifts,21);
 assert.doesNotMatch(core.summary({...p,otOnlyMonthlyMaxHours:220},[{id:'O3',start:'22:00',end:'08:00'}]),/Tagdienst OT1|; 8 h:/);
 assert.match(core.summary({enabled:true,minBlockRestHours:48,minFreeStartDays:2},[],{monthlyPlanningMaxHours:190,monthlyPlanningMaxShifts:18}),/190 h.*48 h/);
 assert.doesNotMatch(core.summary({enabled:true,minBlockRestHours:48,minFreeStartDays:2}),/190|vollständig freie/);
});
test('database enforces configured limits, authorization, concurrency and company isolation atomically',async()=>{
 const db=new PGlite(),alpha='00000000-0000-0000-0000-000000000001',beta='00000000-0000-0000-0000-000000000002',owner='00000000-0000-0000-0000-000000000003';
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA private;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE company_members(company_id uuid,user_id uuid,status text,role text);
 CREATE TABLE company_compliance_policy(company_id uuid primary key,solid_planning_rules jsonb,monthly_planning_max_hours numeric,monthly_planning_max_shifts int,updated_at timestamptz);
 CREATE TABLE employees(id uuid,company_id uuid,qualifications text[],role text,employment text,weekly_hours numeric,shift_permissions text[],personnel_no text);
 CREATE TABLE companies(id uuid,name text,timezone text);CREATE TABLE shift_templates(company_id uuid,active boolean,code text,default_start time,default_end time);
 CREATE TABLE shift_assignments(id uuid,company_id uuid,employee_id uuid,status text,starts_at timestamptz,ends_at timestamptz,shift_code text);
 CREATE TABLE open_shift_market_claims(assignment_id uuid,employee_id uuid,company_id uuid,status text);
 CREATE TABLE audit_events(company_id uuid,event_type text,entity_type text,entity_id uuid,actor_id uuid,actor_role text,old_values jsonb,new_values jsonb,metadata jsonb);
 CREATE FUNCTION private.sf_month_meta(q text[],k text) RETURNS text LANGUAGE sql AS $$ SELECT split_part(v,'=',2) FROM unnest(q) v WHERE v LIKE '__sp:'||k||'=%' LIMIT 1 $$;
 `);
 const old=fs.readFileSync('supabase/migrations/20261009100331_confirmed_planning_rules_v2.sql','utf8');await db.exec(old.slice(old.indexOf('CREATE OR REPLACE FUNCTION private.sf_confirmed_month_error'),old.indexOf('CREATE OR REPLACE FUNCTION private.sf_assert_month_planning_limits')));
 const ot=fs.readFileSync('supabase/migrations/20261012013020_ot_monthly_limit_override.sql','utf8');await db.exec(ot.slice(0,ot.indexOf('CREATE OR REPLACE FUNCTION private.sf_assert_month_planning_limits')));
 await db.exec(fs.readFileSync('supabase/migrations/20261012021422_company_planning_rule_settings.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261012022626_company_planning_rule_audit_trigger.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261012144728_ot_day_separate_planning_settings.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261014003638_weekly_planning_maximum_55_hours.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261014010135_teamleader_recovery_and_month_targets.sql','utf8'));
 const policy={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',otOnlyMonthlyMaxHours:220};
 await db.query('INSERT INTO company_compliance_policy VALUES($1,$2,190,18,now()),($3,$2,190,23,now())',[alpha,policy,beta]);await db.query("INSERT INTO company_members VALUES($1,$2,'ACTIVE','OWNER')",[alpha,owner]);await db.query("SELECT set_config('test.uid',$1,false)",[owner]);
 const save=(company,patch,expected)=>db.query('SELECT manager_save_planning_rules($1,$2,$3,$4) result',[company,patch,expected,'fixture']);
 await assert.rejects(save(beta,{maxConsecutiveShifts:3},policy),/dieses Unternehmens/);
 await assert.rejects(save(alpha,{enabled:false},policy),/nicht direkt bearbeitbar/);
 await assert.rejects(save(alpha,{otOnlyMonthlyMaxHours:221},policy),/zwischen/);
 await assert.rejects(save(alpha,{maxCalendarWeekHours:56},policy),/zwischen/);
 await assert.rejects(save(alpha,{otOnlyMaxCalendarWeekHours:56},policy),/zwischen/);
 await assert.rejects(save(alpha,{otOnlyMaxConsecutiveShifts:6},policy),/zwischen/);
 await assert.rejects(save(alpha,{maxConsecutiveShifts:2.5},policy),/ganzzahlig/);
 await assert.rejects(save(alpha,{conditionalStaffing:[{shift:'foreign',sourceShift:'other'}]},policy),/aktive unterschiedliche/);
 const patch={maxConsecutiveShifts:3,maxCalendarWeekHours:32,monthlyMaxHours:170,eightHourAutoMaxHours:168,eightHourMaxShifts:21};const r=(await save(alpha,patch,policy)).rows[0].result;assert.equal(r.solid_planning_rules.maxConsecutiveShifts,3);
 await assert.rejects(save(alpha,{maxConsecutiveShifts:2},policy),/zwischenzeitlich/);assert.deepEqual((await db.query('SELECT solid_planning_rules FROM company_compliance_policy WHERE company_id=$1',[beta])).rows[0].solid_planning_rules,policy);
 assert.equal((await db.query('SELECT count(*)::int n FROM audit_events')).rows[0].n,1);
 assert.equal((await db.query("SELECT has_table_privilege('authenticated','public.audit_events','INSERT') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("SELECT has_function_privilege('authenticated','private.sf_audit_planning_rule_change()','EXECUTE') allowed")).rows[0].allowed,false);
 await db.exec('GRANT USAGE ON SCHEMA auth TO authenticated;GRANT SELECT ON company_members TO authenticated;GRANT SELECT,UPDATE ON company_compliance_policy TO authenticated;');
 await db.exec('SET ROLE authenticated');
 await save(alpha,{maxConsecutiveShifts:4},r.solid_planning_rules);
 await db.exec('RESET ROLE');
 assert.equal((await db.query('SELECT count(*)::int n FROM audit_events')).rows[0].n,2);
 const duties=[1,2,3,4].map(n=>({starts_at:`2027-01-0${n}T05:00Z`,ends_at:`2027-01-0${n}T13:00Z`,shift_code:'FD'}));const errors=(await db.query("SELECT private.sf_confirmed_rule_errors($1,'Europe/Berlin',$2) AS errors",[duties,r.solid_planning_rules])).rows[0].errors;assert.ok(errors.some(x=>/3 Dienste/.test(x)));
 const hours=[{starts_at:'2027-01-01T05:00Z',ends_at:'2027-01-08T13:00Z',market_approved:false}];assert.match((await db.query("SELECT private.sf_confirmed_month_error($1,'2027-01-01','Europe/Berlin',true,180,true,false,$2) err",[hours,r.solid_planning_rules])).rows[0].err,/170 Stunden/);
 await db.query("UPDATE company_members SET role='PLANNER'");await assert.rejects(save(alpha,{maxConsecutiveShifts:2},r.solid_planning_rules),/Inhaber/);
 assert.equal((await db.query("SELECT has_function_privilege('anon','public.manager_save_planning_rules(uuid,jsonb,jsonb,text)','EXECUTE') allowed")).rows[0].allowed,false);
 await db.query("UPDATE company_members SET role='OWNER'");
 const baseline=(await db.query('SELECT solid_planning_rules r FROM company_compliance_policy WHERE company_id=$1',[alpha])).rows[0].r;
 const updated=(await save(alpha,{otOnlyMaxCalendarWeekHours:50,otOnlyMaxConsecutiveShifts:5,otOnlyMinFreeCalendarDays:2,otOnlyMinBlockRestHours:48},baseline)).rows[0].result.solid_planning_rules;
 const employee='00000000-0000-0000-0000-000000000004';
 await db.query("INSERT INTO companies VALUES($1,'Fixture','Europe/Berlin');",[alpha]);
 await db.query("INSERT INTO employees VALUES($1,$2,ARRAY[]::text[],'Sicherheitsmitarbeiter','Vollzeit',40,ARRAY['OT1','OT2','OT3'],'fixture');",[employee,alpha]);
 await db.query("INSERT INTO shift_templates VALUES($1,true,'OT1','06:00','16:00')",[alpha]);
 for(const d of [4,5,6,7])await db.query("INSERT INTO shift_assignments VALUES(null,$1,$2,'DRAFT',$3,$4,'OT1')",[alpha,employee,`2027-01-0${d}T05:00Z`,`2027-01-0${d}T15:00Z`]);
 const candidate=()=>db.query("SELECT private.sf_confirmed_candidate_error($1,$2,'2027-01-08T05:00Z','2027-01-08T15:00Z','OT1') err",[alpha,employee]);
 assert.equal((await candidate()).rows[0].err,null,'fifth 10h duty uses scoped values despite general 3/32 limits');
 await db.query("INSERT INTO shift_assignments VALUES(null,$1,$2,'DRAFT','2027-01-08T05:00Z','2027-01-08T15:00Z','OT1')",[alpha,employee]);
 await db.query("SELECT private.sf_assert_solid_recovery($1,$2,'2027-01-08')",[alpha,employee]);
 await db.query("DELETE FROM shift_assignments WHERE starts_at='2027-01-08T05:00Z'");
 await db.query("UPDATE employees SET qualifications=ARRAY['__sp:maxWeekly=40']");
 assert.match((await candidate()).rows[0].err,/40 Stunden/);
 await db.query("UPDATE employees SET qualifications=ARRAY[]::text[],shift_permissions=ARRAY['OT1','OT']");
 assert.ok((await candidate()).rows[0].err,'ordinary OT permission excludes day-duty override');
 await db.query("UPDATE employees SET shift_permissions=ARRAY['OT1'],employment='Teilzeit'");
 assert.ok((await candidate()).rows[0].err,'part-time contract remains protected');
 assert.deepEqual((await db.query('SELECT solid_planning_rules FROM company_compliance_policy WHERE company_id=$1',[beta])).rows[0].solid_planning_rules,policy);
 assert.equal(updated.maxCalendarWeekHours,32);
 const baseline55=(await db.query('SELECT solid_planning_rules r FROM company_compliance_policy WHERE company_id=$1',[alpha])).rows[0].r;
 const caps55=(await save(alpha,{maxCalendarWeekHours:55,otOnlyMaxCalendarWeekHours:55},baseline55)).rows[0].result.solid_planning_rules;
 await assert.rejects(save(alpha,{teamLeaderMinNightRecoveryCalendarDays:1},caps55),/zwischen/);
 await assert.rejects(save(alpha,{teamLeaderMaxConsecutiveNightShifts:3,teamLeaderPreferredNightBlockLength:4},caps55),/Bevorzugter/);
 const tl=(await save(alpha,{teamLeaderMaxConsecutiveNightShifts:4,teamLeaderPreferredNightBlockLength:4,teamLeaderMinNightRecoveryCalendarDays:2,teamLeaderMinimumMonthlyHours:170},caps55)).rows[0].result.solid_planning_rules;assert.equal(tl.teamLeaderMinNightRecoveryCalendarDays,2);
 assert.equal(caps55.maxCalendarWeekHours,55);assert.equal(caps55.otOnlyMaxCalendarWeekHours,55);
 assert.deepEqual((await db.query('SELECT solid_planning_rules FROM company_compliance_policy WHERE company_id=$1',[beta])).rows[0].solid_planning_rules,policy);
 }finally{await db.close()}
});

test('company weekend-by-rhythm policy hides the retired goal without hiding OT rules',()=>{
 const {ctx,body}=fixture();Object.assign(ctx.SFCompliance.policy.solidPlanningRules,{weekendPlanningByRhythm:true,minFreeWeekendsPerMonth:1});ctx.SFPlanningRuleSettings.render(body);
 assert.doesNotMatch(body.innerHTML,/data-rule-key="minFreeWeekendsPerMonth"/);assert.match(body.innerHTML,/data-rule-key="otOnlyMonthlyMaxHours"/);
 ctx.SFCompliance.policy.solidPlanningRules.weekendPlanningByRhythm=false;ctx.SFPlanningRuleSettings.render(body);assert.match(body.innerHTML,/data-rule-key="minFreeWeekendsPerMonth"/);
});
test('weekend target migration preserves OT weekdays, fixed cycles, personal limits and other companies',async()=>{
 const db=new PGlite(),migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_remove_general_weekend_target.sql'));
 try{
 await db.exec('CREATE TABLE companies(id text PRIMARY KEY,name text);CREATE TABLE company_compliance_policy(company_id text PRIMARY KEY,solid_planning_rules jsonb,updated_at timestamptz);');
 const rules={enabled:true,confirmedRulesVersion:2,minFreeWeekendsPerMonth:1,otWeekdayRoster:{employeeIds:['a','b','c'],weekdays:[1,2,3,4,5],allowDaysOff:true},fixedWeeklyRoster:{employeeIds:['fixed'],weekdays:[1,2,3,4]},monthlyMaxHours:200,maxCalendarWeekHours:55};
 for(const [id,name] of [['primary','Secontec Services'],['other','Secontec Services - 8h']]){await db.query('INSERT INTO companies VALUES($1,$2)',[id,name]);await db.query('INSERT INTO company_compliance_policy VALUES($1,$2,now())',[id,JSON.stringify(rules)]);}
 const sql=fs.readFileSync('supabase/migrations/'+migration,'utf8');await db.exec(sql);await db.exec(sql);
 const rows=(await db.query('SELECT company_id,solid_planning_rules AS rules FROM company_compliance_policy ORDER BY company_id')).rows;
 assert.deepEqual(rows.find(r=>r.company_id==='primary').rules,{...rules,minFreeWeekendsPerMonth:0,weekendPlanningByRhythm:true});assert.deepEqual(rows.find(r=>r.company_id==='other').rules,rules);
 }finally{await db.close()}
});
